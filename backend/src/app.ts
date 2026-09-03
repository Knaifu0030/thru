import { randomUUID, timingSafeEqual } from "node:crypto";
import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AppConfig } from "./config.js";
import type { SkillExecutor } from "./executor.js";
import type { THRUEngine } from "./forge-engine.js";
import { handleMcpRequest } from "./mcp.js";
import { renderBrowserFixture, type MockPortal } from "./mock-portal.js";
import type { SkillRegistry } from "./registry.js";
import { RunQueueFullError, type RunManager } from "./run-manager.js";
import type { ApiKeyStore } from "./key-store.js";
import type { TeachingSessionStore } from "./teaching-sessions.js";
import type { DatabaseRuntime } from "./database.js";
import type { SessionStore } from "./session-store.js";
import type { ApprovalStore } from "./approval-store.js";
import { getWebcmdDiagnostic } from "./webcmd-diagnostic.js";

const METHODS = "GET, POST, DELETE, OPTIONS";
const HEADERS = "Content-Type, X-THRU-Admin-Key, Prefer, Idempotency-Key, Authorization";
const MAX_BODY_BYTES = 1_048_576;

export interface AppDependencies { readonly registry: SkillRegistry; readonly executor: SkillExecutor; readonly mockPortal: MockPortal; readonly forgeEngine: THRUEngine; readonly runManager: RunManager; readonly apiKeys?: ApiKeyStore; readonly sessions?: SessionStore; readonly teaching?: TeachingSessionStore; readonly approvals?: ApprovalStore; readonly database?: DatabaseRuntime }
interface ErrorBody { readonly error: { readonly code: string; readonly message: string; readonly requestId: string; readonly details?: unknown } }

function setCors(req: IncomingMessage, res: ServerResponse, config: AppConfig): boolean {
  const origin = req.headers.origin?.replace(/\/$/, "");
  if (!origin) return true;
  if (!config.allowedOrigins.has(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", METHODS);
  res.setHeader("Access-Control-Allow-Headers", HEADERS);
  res.setHeader("Vary", "Origin");
  return true;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), "Cache-Control": "no-store" });
  res.end(payload);
}

function errorBody(code: string, message: string, requestId: string, details?: unknown): ErrorBody {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large", "Request body exceeds 1 MiB.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "invalid_json", "Request body must be valid JSON."); }
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message); }
}

function hasAdminAccess(req: IncomingMessage, config: AppConfig): boolean {
  if (!config.adminKey) return false;
  const candidate = req.headers["x-thru-admin-key"];
  if (typeof candidate !== "string") return false;
  const expected = Buffer.from(config.adminKey);
  const actual = Buffer.from(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

interface AuthPrincipal { user_id: string; scopes: import("./key-store.js").ApiCapability[]; kind: "api_key" | "session" }
async function authenticatedPrincipal(req: IncomingMessage, dependencies: AppDependencies, capability: import("./key-store.js").ApiCapability = "run"): Promise<AuthPrincipal | null> { const value = req.headers.authorization?.replace(/^Bearer\s+/i, ""); if (!value) return null; if (dependencies.apiKeys) { const key = await dependencies.apiKeys.authenticateIdentity(value, capability); if (key) return { user_id: key.user_id, scopes: key.scopes, kind: "api_key" }; } if (dependencies.sessions) { const session = await dependencies.sessions.authenticateIdentity(value, capability); if (session) return { user_id: session.user_id, scopes: session.scopes, kind: "session" }; } return null; }
async function authenticatedKey(req: IncomingMessage, dependencies: AppDependencies, capability: import("./key-store.js").ApiCapability = "run"): Promise<boolean> { return Boolean(await authenticatedPrincipal(req, dependencies, capability)); }
function hasBearerToken(req: IncomingMessage): boolean { return typeof req.headers.authorization === "string" && /^Bearer\s+\S+/i.test(req.headers.authorization); }

export function createTHRUServer(config: AppConfig, dependencies: AppDependencies) {
  const requestWindows = new Map<string, number[]>();
  return createServer((req, res) => {
    const started = Date.now();
    const now = Date.now();
    const address = (String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0] ?? "unknown").trim();
    const window = requestWindows.get(address)?.filter((at) => now - at < 60_000) ?? [];
    if (window.length >= config.rateLimitPerMinute) {
      res.setHeader("Retry-After", "60");
      json(res, 429, errorBody("rate_limited", "Too many requests; retry after one minute.", randomUUID()));
      console.log(JSON.stringify({ event: "http_request", request_id: res.getHeader("X-Request-Id") ?? "rate-limited", method: req.method, path: (req.url ?? "/").split("?", 1)[0], status: 429, duration_ms: Date.now() - started }));
      return;
    }
    window.push(now); requestWindows.set(address, window);
    if (requestWindows.size > 10_000) for (const [key, values] of requestWindows) if (!values.length || now - values[values.length - 1]! > 60_000) requestWindows.delete(key);
    void route(req, res, config, dependencies).catch((error: unknown) => {
      if (res.headersSent) { res.end(); return; }
      const requestId = String(res.getHeader("X-Request-Id") ?? randomUUID());
      if (error instanceof HttpError) json(res, error.status, errorBody(error.code, error.message, requestId, error.details));
      else json(res, 500, errorBody("internal_error", "THRU could not complete this request.", requestId));
    }).finally(() => { const requestId = String(res.getHeader("X-Request-Id") ?? "unknown"); console.log(JSON.stringify({ event: "http_request", request_id: requestId, method: req.method, path: (req.url ?? "/").split("?", 1)[0], status: res.statusCode, duration_ms: Date.now() - started })); });
  });
}

async function route(req: IncomingMessage, res: ServerResponse, config: AppConfig, dependencies: AppDependencies): Promise<void> {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  if (!setCors(req, res, config)) throw new HttpError(403, "origin_not_allowed", "This origin is not allowed.");
  if (req.method === "OPTIONS") { res.writeHead(204, { "Cache-Control": "no-store" }); res.end(); return; }

  const url = new URL(req.url ?? "/", "http://thru.internal");
  if (dependencies.sessions && (url.pathname === "/auth/session" || url.pathname === "/auth/me")) {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (req.method === "POST" && url.pathname === "/auth/session") {
      if (!bearer || !dependencies.apiKeys) throw new HttpError(401, "auth_required", "Exchange a valid THRU API key for a session.");
      const manage = await dependencies.apiKeys.authenticateIdentity(bearer, "manage");
      const run = manage ?? await dependencies.apiKeys.authenticateIdentity(bearer, "run");
      if (!run) throw new HttpError(401, "invalid_api_key", "The supplied THRU API key is invalid, revoked, or lacks access.");
      json(res, 201, await dependencies.sessions.create(run.scopes, run.user_id)); return;
    }
    if (req.method === "GET" && url.pathname === "/auth/me") {
      if (!bearer) throw new HttpError(401, "auth_required", "A THRU API key or session token is required.");
      const manage = dependencies.apiKeys ? await dependencies.apiKeys.authenticate(bearer, "manage") : null;
      const run = manage ?? (dependencies.apiKeys ? await dependencies.apiKeys.authenticate(bearer, "run") : null);
      if (run) { json(res, 200, { authenticated: true, kind: "api_key", scopes: run.scopes }); return; }
      const session = await dependencies.sessions.authenticate(bearer, "manage") ?? await dependencies.sessions.authenticate(bearer, "run");
      if (!session) throw new HttpError(401, "invalid_session", "The supplied session is invalid, revoked, or expired.");
      json(res, 200, { authenticated: true, kind: "session", session }); return;
    }
    if (req.method === "DELETE" && url.pathname === "/auth/session") {
      if (!bearer || !await dependencies.sessions.revoke(bearer)) throw new HttpError(404, "session_not_found", "Session not found or already revoked.");
      json(res, 200, { status: "revoked" }); return;
    }
  }
  if (url.pathname === "/mcp") { if (hasBearerToken(req) && !(await authenticatedKey(req, dependencies, "run"))) throw new HttpError(401, "invalid_api_key", "The supplied THRU API key is invalid, revoked, or lacks run access."); dependencies.executor.setInternalBaseUrl(`http://${req.headers.host ?? `127.0.0.1:${config.port}`}`); await handleMcpRequest(req, res, dependencies.registry, dependencies.executor); return; }
  if (req.method === "GET" && url.pathname === "/health") {
    const webcmd = getWebcmdDiagnostic();
    let storage = "ready"; try { await access(path.dirname(config.runsFile), constants.W_OK); } catch { storage = "degraded"; }
    json(res, 200, { status: webcmd.status === "ready" && storage === "ready" ? "ok" : "degraded", service: "thru-backend", version: config.version, webcmd, storage, persistence: dependencies.database?.status === "ready" ? "postgresql-runs+azure-files" : "azure-files-json", database: dependencies.database?.status ?? "disabled", skills: dependencies.registry.list().length }); return;
  }
  if (req.method === "GET" && url.pathname === "/hello") {
    json(res, 200, { status: "online", service: "thru-backend", version: config.version, message: "THRU deployment online", webcmd: getWebcmdDiagnostic() }); return;
  }
  if (req.method === "GET" && url.pathname === "/registry") { json(res, 200, { skills: dependencies.registry.list() }); return; }
  const evidenceMatch = /^\/teaching-sessions\/([0-9a-f-]+)\/evidence\/([A-Za-z0-9-]+\.jpg)$/.exec(url.pathname);
  if (evidenceMatch && req.method === "GET" && dependencies.teaching) {
    const admin = hasAdminAccess(req, config); const principal = await authenticatedPrincipal(req, dependencies, "manage");
    if (!admin && !principal) throw new HttpError(401, "auth_required", "Teaching evidence requires an authenticated operator.");
    const session = dependencies.teaching.get(evidenceMatch[1] ?? "");
    if (!session || (!admin && session.user_id && session.user_id !== principal?.user_id)) throw new HttpError(404, "evidence_not_found", "Teaching evidence not found.");
    const filename = evidenceMatch[2] ?? "";
    try { const evidencePath = path.join(path.dirname(config.teachingFile), "captures", session.id, filename); const bytes = await readFile(evidencePath); res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": bytes.byteLength, "Cache-Control": "private, no-store" }); res.end(bytes); } catch { throw new HttpError(404, "evidence_not_found", "Teaching evidence not found."); }
    return;
  }
  if (dependencies.teaching && url.pathname.startsWith("/teaching-sessions")) {
    const admin = hasAdminAccess(req, config);
    const teachingPrincipal = await authenticatedPrincipal(req, dependencies, "manage");
    if (!admin && !teachingPrincipal) throw new HttpError(401, "auth_required", "Teaching requires an authenticated operator.");
    const match = /^\/teaching-sessions(?:\/([0-9a-f-]+))?(?:\/(actions|capture|review|validate|publish)(?:\/(actions|stop))?)?$/.exec(url.pathname); if (!match) throw new HttpError(404, "not_found", "Teaching session route not found."); const id = match[1]; const operation = match[2]; const suboperation = match[3];
    try {
      if (req.method === "POST" && !id) { const body = await readJson(req) as { goal_text?: unknown; url?: unknown; sample_inputs?: Record<string, unknown> }; if (typeof body.goal_text !== "string" || typeof body.url !== "string") throw new Error("goal_text and url are required."); json(res, 201, await dependencies.teaching.create(body.goal_text, body.url, body.sample_inputs, teachingPrincipal?.user_id)); return; }
      if (!id) throw new Error("session id is required.");
      const ownedSession = dependencies.teaching.get(id);
      if (!ownedSession || (!admin && ownedSession.user_id && ownedSession.user_id !== teachingPrincipal?.user_id)) throw new HttpError(404, "session_not_found", "Teaching session not found.");
      if (req.method === "GET" && !operation) { const session = dependencies.teaching.get(id); if (!session) throw new HttpError(404, "session_not_found", "Teaching session not found."); json(res, 200, session); return; }
      if (req.method === "GET" && operation === "capture" && !suboperation) { json(res, 200, ownedSession); return; }
      if (req.method === "POST" && operation === "capture" && !suboperation) { json(res, 200, await dependencies.teaching.startCapture(id, admin ? undefined : teachingPrincipal?.user_id)); return; }
      if (req.method === "POST" && operation === "capture" && suboperation === "actions") { const body = await readJson(req) as { type?: unknown; target?: unknown; value?: unknown; runtime_value?: unknown }; if (typeof body.type !== "string") throw new Error("capture action type is required."); const action = { type: body.type as import("./teaching-sessions.js").TeachingAction["type"], ...(typeof body.target === "string" ? { target: body.target } : {}), ...(typeof body.value === "string" ? { value: body.value } : {}), ...(typeof body.runtime_value === "string" ? { runtime_value: body.runtime_value } : {}) }; json(res, 200, await dependencies.teaching.captureAction(id, action, admin ? undefined : teachingPrincipal?.user_id)); return; }
      if (req.method === "DELETE" && operation === "capture" && suboperation === "stop") { const stopped = await dependencies.teaching.stopCapture(id, admin ? undefined : teachingPrincipal?.user_id); json(res, stopped ? 200 : 404, stopped ?? { status: "not_found" }); return; }
      if (req.method === "POST" && operation === "actions") { json(res, 200, await dependencies.teaching.addAction(id, await readJson(req) as Omit<import("./teaching-sessions.js").TeachingAction, "at">)); return; }
      if (req.method === "POST" && operation === "review") { const body = await readJson(req) as { artifact?: unknown }; json(res, 200, await dependencies.teaching.review(id, body.artifact)); return; }
      if (req.method === "POST" && operation === "validate") { const body = await readJson(req) as { approve_sensitive?: unknown }; json(res, 200, await dependencies.teaching.validate(id, { approveSensitive: body.approve_sensitive === true })); return; }
      if (req.method === "POST" && operation === "publish") { json(res, 201, { status: "published", skill: await dependencies.teaching.publish(id) }); return; }
      if (req.method === "DELETE" && !operation) { json(res, await dependencies.teaching.delete(id) ? 200 : 404, { status: "deleted" }); return; }
      throw new HttpError(404, "not_found", "Teaching operation not found.");
    } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "teaching_failed", (error as Error).message); }
  }
  if (dependencies.apiKeys && (url.pathname === "/keys" || url.pathname.startsWith("/keys/"))) {
    const admin = hasAdminAccess(req, config);
    const principal = await authenticatedPrincipal(req, dependencies, "manage");
    if (!admin && !principal) throw new HttpError(401, "auth_required", "A valid management API key is required.");
    if (req.method === "GET") { json(res, 200, { keys: dependencies.apiKeys.list(admin ? undefined : principal?.user_id) }); return; }
    if (req.method === "POST") { const body = await readJson(req) as { name?: unknown; scopes?: unknown }; const created = await dependencies.apiKeys.create(typeof body.name === "string" ? body.name : "", body.scopes, principal?.user_id); json(res, 201, created); return; }
    const keyMatch = /^\/keys\/([a-z0-9_]+)$/.exec(url.pathname); if (req.method === "DELETE" && keyMatch) { const revoked = await dependencies.apiKeys.revoke(keyMatch[1] ?? "", admin ? undefined : principal?.user_id); json(res, revoked ? 200 : 404, { status: "revoked" }); return; }
  }
  const approvalMatch = /^\/runs\/([0-9a-f-]+)\/approval$/.exec(url.pathname);
  if (approvalMatch && req.method === "POST") {
    const admin = hasAdminAccess(req, config);
    const approver = await authenticatedPrincipal(req, dependencies, "manage");
    if (!dependencies.approvals || (!approver && !admin)) throw new HttpError(401, "auth_required", "Approving a gate requires a management-scoped THRU key.");
    const run = dependencies.runManager.get(approvalMatch[1] ?? "");
    if (!run) throw new HttpError(404, "run_not_found", "Run not found.");
    if (run.user_id && !admin && (!approver || approver.user_id !== run.user_id)) throw new HttpError(403, "run_forbidden", "Only the run owner can approve this gate.");
    if (run.result?.status !== "needs_human") throw new HttpError(409, "gate_not_pending", "This run does not have a pending human gate.");
    if (dependencies.approvals.list(run.id).length) throw new HttpError(409, "gate_already_decided", "This human gate already has an immutable decision.");
    const body = await readJson(req) as { decision?: unknown; note?: unknown };
    if (body.decision !== "approved" && body.decision !== "denied") throw new HttpError(400, "invalid_decision", "Decision must be approved or denied.");
    const approval = await dependencies.approvals.record(run.id, body.decision, typeof body.note === "string" ? body.note : undefined, approver?.user_id);
    if (body.decision === "approved") {
      await dependencies.runManager.resume(run.id, approval.id);
    }
    await dependencies.runManager.appendEvent(run.id, { type: body.decision === "approved" ? "gate_approved" : "gate_denied", at: approval.created_at, message: typeof body.note === "string" ? body.note.slice(0, 500) : `Gate ${body.decision}.` });
    json(res, 201, { approval, run: dependencies.runManager.get(run.id) });
    return;
  }
  const runMatch = /^\/runs\/([0-9a-f-]+)$/.exec(url.pathname);
  if (runMatch) { const run = dependencies.runManager.get(runMatch[1] ?? ""); if (!run) throw new HttpError(404, "run_not_found", "Run not found."); const admin = hasAdminAccess(req, config); const principal = await authenticatedPrincipal(req, dependencies, "run"); if (hasBearerToken(req) && !principal && !admin) throw new HttpError(401, "invalid_api_key", "The supplied THRU API key is invalid or revoked."); if (run.user_id && (!principal || principal.user_id !== run.user_id) && !admin) throw new HttpError(403, "run_forbidden", "This run belongs to another authenticated user."); if (req.method === "DELETE") { if (!principal && !admin) throw new HttpError(401, "auth_required", "Cancelling a run requires a valid run-scoped API key."); json(res, 200, await dependencies.runManager.cancel(run.id)); return; } if (req.method === "GET") { json(res, 200, run); return; } }
  if (req.method === "GET" && url.pathname === "/runs") {
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const principal = await authenticatedPrincipal(req, dependencies, "run"); if (hasBearerToken(req) && !principal) throw new HttpError(401, "invalid_api_key", "The supplied THRU API key is invalid or revoked.");
    json(res, 200, { runs: dependencies.runManager.list(Number.isFinite(limit) ? limit : 200, principal?.user_id) }); return;
  }
  if (req.method === "GET" && url.pathname === "/events") {
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const principal = await authenticatedPrincipal(req, dependencies, "run"); if (hasBearerToken(req) && !principal) throw new HttpError(401, "invalid_api_key", "The supplied THRU API key is invalid or revoked.");
    const runEvents = dependencies.runManager.list(Number.isFinite(limit) ? limit : 200, principal?.user_id).flatMap((run) => [
      ...run.events.map((event) => ({ ...event, run_id: run.id, skill: run.skill })),
      ...(run.result?.healing ?? []).map((healing) => ({ type: "healing" as const, at: healing.at ?? run.completed_at ?? run.created_at, message: healing.note, step: healing.step, rung: healing.rung, run_id: run.id, skill: run.skill })),
    ]);
    const teachingEvents = (principal || hasAdminAccess(req, config) ? (dependencies.teaching?.list(principal?.user_id) ?? []) : []).flatMap((session) => session.events.map((event) => ({ type: `teaching_${event.type}`, at: event.at, message: event.message, run_id: session.id, skill: session.artifact?.skill.id ?? "teaching" })));
    const events = [...runEvents, ...teachingEvents].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 1000);
    json(res, 200, { events }); return;
  }
  if (req.method === "GET" && url.pathname === "/metrics") {
    const runs = dependencies.runManager.list(1000); const terminal = runs.filter((run) => run.state === "completed" || run.state === "failed" || run.state === "cancelled"); const timed = terminal.filter((run) => run.started_at && run.completed_at).map((run) => Date.parse(run.completed_at!) - Date.parse(run.started_at!));
    json(res, 200, { runs: { total: runs.length, queued: runs.filter((run) => run.state === "queued").length, running: runs.filter((run) => run.state === "running").length, completed: runs.filter((run) => run.state === "completed").length, failed: runs.filter((run) => run.state === "failed").length, cancelled: runs.filter((run) => run.state === "cancelled").length, success_rate: terminal.length ? runs.filter((run) => run.state === "completed").length / terminal.length : null, average_execution_ms: timed.length ? Math.round(timed.reduce((sum, value) => sum + value, 0) / timed.length) : null }, queue: dependencies.runManager.metrics() }); return;
  }
  if (req.method === "GET" && url.pathname === "/mock/hell-portal") {
    const html = dependencies.mockPortal.render();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(html) }); res.end(html); return;
  }
  if (req.method === "GET" && url.pathname === "/mock/fixture") { const html = renderBrowserFixture(url.searchParams.get("scenario") ?? ""); res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(html) }); res.end(html); return; }
  if (req.method === "POST" && url.pathname === "/admin/sabotage") {
    const operator = await authenticatedPrincipal(req, dependencies, "manage");
    if (!hasAdminAccess(req, config) && !operator) throw new HttpError(401, "admin_required", "A management-scoped operator credential is required.");
    const body = await readJson(req) as { variant?: unknown };
    try { json(res, 200, { variant: dependencies.mockPortal.setVariant(String(body.variant ?? "")) }); }
    catch (error) { throw new HttpError(400, "invalid_variant", (error as Error).message); }
    return;
  }
  if (req.method === "POST" && (url.pathname === "/teach" || url.pathname === "/forge")) {
    const operator = await authenticatedPrincipal(req, dependencies, "manage");
    if (!hasAdminAccess(req, config) && !operator) throw new HttpError(401, "admin_required", "A management-scoped operator credential is required.");
    try { json(res, 201, await dependencies.forgeEngine.propose(await readJson(req) as { goal_text: string; url: string; sample_inputs?: Record<string, unknown> })); }
    catch (error) { throw new HttpError(400, "teach_proposal_failed", "THRU could not produce a safe proposal.", (error as Error).message); }
    return;
  }
  const proposalMatch = /^\/(?:teach|forge)\/([0-9a-f-]+)$/.exec(url.pathname);
  if (proposalMatch && req.method === "POST") { const operator = await authenticatedPrincipal(req, dependencies, "manage"); if (!hasAdminAccess(req, config) && !operator) throw new HttpError(401, "admin_required", "A management-scoped operator credential is required."); const body = await readJson(req) as { artifact?: unknown }; try { const skill = await dependencies.forgeEngine.confirm(proposalMatch[1] ?? "", body.artifact); json(res, 201, { status: "created", skill }); } catch (error) { throw new HttpError(400, "teach_confirmation_failed", (error as Error).message); } return; }
  if (proposalMatch && req.method === "DELETE") { const operator = await authenticatedPrincipal(req, dependencies, "manage"); if (!hasAdminAccess(req, config) && !operator) throw new HttpError(401, "admin_required", "A management-scoped operator credential is required."); json(res, dependencies.forgeEngine.discard(proposalMatch[1] ?? "") ? 200 : 404, { status: "discarded" }); return; }
  if (req.method === "POST" && url.pathname === "/registry/import") {
    const operator = await authenticatedPrincipal(req, dependencies, "manage");
    if (!hasAdminAccess(req, config) && !operator) throw new HttpError(401, "admin_required", "A management-scoped operator credential is required.");
    try { const skill = await dependencies.registry.import(await readJson(req)); json(res, 201, skill); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "invalid_artifact", "Import rejected.", (error as Error).message); }
    return;
  }

  const lifecycleMatch = /^\/skills\/([a-z0-9-]+)\/(versions|rollback|deprecate)$/.exec(url.pathname);
  if (lifecycleMatch && dependencies.registry.get(lifecycleMatch[1] ?? "")) {
    const id = lifecycleMatch[1] ?? "";
    if (lifecycleMatch[2] === "versions" && req.method === "GET") { json(res, 200, { skill: id, versions: await dependencies.registry.versions(id) }); return; }
    const admin = hasAdminAccess(req, config); const principal = await authenticatedPrincipal(req, dependencies, "manage");
    if (!admin && !principal) throw new HttpError(401, "auth_required", "A management-scoped operator credential is required.");
    const owner = admin ? undefined : principal?.user_id;
    if (lifecycleMatch[2] === "rollback" && req.method === "POST") { const body = await readJson(req) as { version?: unknown }; if (!Number.isInteger(body.version)) throw new HttpError(400, "invalid_version", "A numeric target version is required."); try { json(res, 200, { skill: await dependencies.registry.rollback(id, Number(body.version), owner) }); } catch (error) { throw new HttpError(409, "rollback_failed", (error as Error).message); } return; }
    if (lifecycleMatch[2] === "deprecate" && req.method === "POST") { try { await dependencies.registry.setState(id, "deprecated", owner); json(res, 200, { status: "deprecated", skill: id }); } catch (error) { throw new HttpError(409, "lifecycle_failed", (error as Error).message); } return; }
  }

  const skillMatch = /^\/skills\/([a-z0-9-]+)(?:\/(card|export))?$/.exec(url.pathname);
  if (skillMatch) {
    const id = skillMatch[1] ?? "";
    const action = skillMatch[2];
    const skill = dependencies.registry.get(id);
    if (!skill) throw new HttpError(404, "skill_not_found", "Skill not found.", { available_skills: dependencies.registry.list().map((item) => item.skill.id) });
    if (req.method === "GET" && action === "card") { json(res, 200, { skill: skill.skill, contract: skill.contract, vitals: skill.vitals }); return; }
    if (req.method === "GET" && action === "export") { res.setHeader("Content-Disposition", `attachment; filename="${id}.skill.json"`); json(res, 200, skill); return; }
    if (!action && (req.method === "GET" || req.method === "POST")) {
      const state = await dependencies.registry.state(id);
      if (state !== "published") throw new HttpError(410, "skill_unavailable", `Skill is ${state}.`);
      const principal = await authenticatedPrincipal(req, dependencies, "run");
      if (hasBearerToken(req) && !principal) throw new HttpError(401, "invalid_api_key", "The supplied THRU API key is invalid, revoked, or lacks run access.");
      const inputs = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readJson(req);
      dependencies.executor.setInternalBaseUrl(`http://${req.headers.host ?? `127.0.0.1:${config.port}`}`);
      const idempotencyKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim().slice(0, 200) : undefined;
      let submitted;
      try { submitted = dependencies.runManager.submit(id, inputs, { surface: "rest", timeBudgetMs: 55_000 }, idempotencyKey || undefined, principal?.user_id); }
      catch (error) { if (error instanceof RunQueueFullError) throw new HttpError(429, "queue_full", error.message, { retry_after_seconds: 5, limit: error.limit }); throw error; }
      if (/respond-async/i.test(String(req.headers.prefer ?? ""))) { res.setHeader("Location", `/runs/${submitted.run.id}`); json(res, 202, submitted.run); return; }
      const completed = await Promise.race([submitted.completion, new Promise<null>((resolve) => setTimeout(() => resolve(null), 55_000))]);
      if (!completed) { res.setHeader("Location", `/runs/${submitted.run.id}`); json(res, 202, submitted.run); return; }
      json(res, completed.result?.status === "invalid_input" ? 400 : completed.state === "failed" ? 500 : 200, completed.result ?? completed); return;
    }
  }
  throw new HttpError(404, "not_found", "Route not found.");
}

import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AppConfig } from "./config.js";
import type { SkillExecutor } from "./executor.js";
import type { ForgeEngine } from "./forge-engine.js";
import { handleMcpRequest } from "./mcp.js";
import { renderBrowserFixture, type MockPortal } from "./mock-portal.js";
import type { SkillRegistry } from "./registry.js";
import type { RunManager } from "./run-manager.js";
import { getWebcmdDiagnostic } from "./webcmd-diagnostic.js";

const METHODS = "GET, POST, DELETE, OPTIONS";
const HEADERS = "Content-Type, X-Forge-Admin-Key, Prefer";
const MAX_BODY_BYTES = 1_048_576;

export interface AppDependencies { readonly registry: SkillRegistry; readonly executor: SkillExecutor; readonly mockPortal: MockPortal; readonly forgeEngine: ForgeEngine; readonly runManager: RunManager }
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
  const candidate = req.headers["x-forge-admin-key"];
  if (typeof candidate !== "string") return false;
  const expected = Buffer.from(config.adminKey);
  const actual = Buffer.from(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createForgeServer(config: AppConfig, dependencies: AppDependencies) {
  return createServer((req, res) => {
    void route(req, res, config, dependencies).catch((error: unknown) => {
      if (res.headersSent) { res.end(); return; }
      const requestId = String(res.getHeader("X-Request-Id") ?? randomUUID());
      if (error instanceof HttpError) json(res, error.status, errorBody(error.code, error.message, requestId, error.details));
      else json(res, 500, errorBody("internal_error", "Forge could not complete this request.", requestId));
    });
  });
}

async function route(req: IncomingMessage, res: ServerResponse, config: AppConfig, dependencies: AppDependencies): Promise<void> {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  if (!setCors(req, res, config)) throw new HttpError(403, "origin_not_allowed", "This origin is not allowed.");
  if (req.method === "OPTIONS") { res.writeHead(204, { "Cache-Control": "no-store" }); res.end(); return; }

  const url = new URL(req.url ?? "/", "http://forge.internal");
  if (url.pathname === "/mcp") { dependencies.executor.setInternalBaseUrl(`http://${req.headers.host ?? `127.0.0.1:${config.port}`}`); await handleMcpRequest(req, res, dependencies.registry, dependencies.executor); return; }
  if (req.method === "GET" && url.pathname === "/health") {
    const webcmd = getWebcmdDiagnostic();
    json(res, 200, { status: webcmd.status === "ready" ? "ok" : "degraded", service: "forge-backend", version: config.version, webcmd, skills: dependencies.registry.list().length }); return;
  }
  if (req.method === "GET" && url.pathname === "/hello") {
    json(res, 200, { status: "online", service: "forge-backend", version: config.version, message: "Forge deployment online", webcmd: getWebcmdDiagnostic() }); return;
  }
  if (req.method === "GET" && url.pathname === "/registry") { json(res, 200, { skills: dependencies.registry.list() }); return; }
  const runMatch = /^\/runs\/([0-9a-f-]+)$/.exec(url.pathname);
  if (req.method === "GET" && runMatch) { const run = dependencies.runManager.get(runMatch[1] ?? ""); if (!run) throw new HttpError(404, "run_not_found", "Run not found."); json(res, 200, run); return; }
  if (req.method === "GET" && url.pathname === "/mock/hell-portal") {
    const html = dependencies.mockPortal.render();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(html) }); res.end(html); return;
  }
  if (req.method === "GET" && url.pathname === "/mock/fixture") { const html = renderBrowserFixture(url.searchParams.get("scenario") ?? ""); res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(html) }); res.end(html); return; }
  if (req.method === "POST" && url.pathname === "/admin/sabotage") {
    if (!hasAdminAccess(req, config)) throw new HttpError(401, "admin_required", "A valid admin key is required.");
    const body = await readJson(req) as { variant?: unknown };
    try { json(res, 200, { variant: dependencies.mockPortal.setVariant(String(body.variant ?? "")) }); }
    catch (error) { throw new HttpError(400, "invalid_variant", (error as Error).message); }
    return;
  }
  if (req.method === "POST" && url.pathname === "/forge") {
    if (!hasAdminAccess(req, config)) throw new HttpError(401, "admin_required", "A valid admin key is required.");
    try { json(res, 201, await dependencies.forgeEngine.propose(await readJson(req) as { goal_text: string; url: string; sample_inputs?: Record<string, unknown> })); }
    catch (error) { throw new HttpError(400, "forge_proposal_failed", "Forge could not produce a safe proposal.", (error as Error).message); }
    return;
  }
  const proposalMatch = /^\/forge\/([0-9a-f-]+)$/.exec(url.pathname);
  if (proposalMatch && req.method === "POST") { if (!hasAdminAccess(req, config)) throw new HttpError(401, "admin_required", "A valid admin key is required."); const body = await readJson(req) as { artifact?: unknown }; try { const skill = await dependencies.forgeEngine.confirm(proposalMatch[1] ?? "", body.artifact); json(res, 201, { status: "forged", skill }); } catch (error) { throw new HttpError(400, "forge_confirmation_failed", (error as Error).message); } return; }
  if (proposalMatch && req.method === "DELETE") { if (!hasAdminAccess(req, config)) throw new HttpError(401, "admin_required", "A valid admin key is required."); json(res, dependencies.forgeEngine.discard(proposalMatch[1] ?? "") ? 200 : 404, { status: "discarded" }); return; }
  if (req.method === "POST" && url.pathname === "/registry/import") {
    if (!hasAdminAccess(req, config)) throw new HttpError(401, "admin_required", "A valid admin key is required.");
    try { const skill = await dependencies.registry.import(await readJson(req)); json(res, 201, skill); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "invalid_artifact", "Import rejected.", (error as Error).message); }
    return;
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
      const inputs = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readJson(req);
      dependencies.executor.setInternalBaseUrl(`http://${req.headers.host ?? `127.0.0.1:${config.port}`}`);
      const submitted = dependencies.runManager.submit(id, inputs, { surface: "rest", timeBudgetMs: 55_000 });
      if (/respond-async/i.test(String(req.headers.prefer ?? ""))) { res.setHeader("Location", `/runs/${submitted.run.id}`); json(res, 202, submitted.run); return; }
      const completed = await Promise.race([submitted.completion, new Promise<null>((resolve) => setTimeout(() => resolve(null), 55_000))]);
      if (!completed) { res.setHeader("Location", `/runs/${submitted.run.id}`); json(res, 202, submitted.run); return; }
      json(res, completed.result?.status === "invalid_input" ? 400 : completed.state === "failed" ? 500 : 200, completed.result ?? completed); return;
    }
  }
  throw new HttpError(404, "not_found", "Route not found.");
}

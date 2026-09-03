import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import test, { after, before } from "node:test";
import { createTHRUServer } from "./app.js";
import { SkillExecutor } from "./executor.js";
import { MockPortal } from "./mock-portal.js";
import { SkillRegistry } from "./registry.js";
import { THRUEngine } from "./forge-engine.js";
import { RunManager } from "./run-manager.js";
import { ApiKeyStore } from "./key-store.js";
import { SessionStore } from "./session-store.js";
import { ApprovalStore } from "./approval-store.js";
import { TeachingSessionStore } from "./teaching-sessions.js";
import { stopWebcmdDaemon } from "./webcmd-runner.js";
import type { JsonSchema, SkillArtifact, WorkflowStep } from "./types.js";

const allowedOrigin = "https://thru.example.vercel.app";
let server: Server;
let baseUrl = "";
let testDirectory = "";
let registry: SkillRegistry;
let mockPortal: MockPortal;
let apiKeys: ApiKeyStore;
let sessions: SessionStore;
let approvals: ApprovalStore;
let teaching: TeachingSessionStore;

before(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "forge-test-"));
  registry = new SkillRegistry(testDirectory);
  await registry.load();
  const fixture = JSON.parse(await readFile(path.resolve("skills/hell-check.skill.json"), "utf8"));
  await registry.import(fixture);
  mockPortal = new MockPortal();
  const executor = new SkillExecutor(registry);
  const forgeEngine = new THRUEngine(registry, null, async (url) => ({ url, title: "Test", headings: ["Test"], labels: [], inputs: [], buttons: [], tables: [] }));
  const runManager = new RunManager(executor);
  apiKeys = new ApiKeyStore(path.join(testDirectory, "keys.json"));
  await apiKeys.ready();
  sessions = new SessionStore(path.join(testDirectory, "sessions.json"));
  await sessions.ready();
  approvals = new ApprovalStore(path.join(testDirectory, "approvals.json"));
  await approvals.ready();
  teaching = new TeachingSessionStore(forgeEngine, 60_000, path.join(testDirectory, "teaching.json"), executor);
  await teaching.ready();
  server = createTHRUServer({
    port: 0,
    version: "test",
    allowedOrigins: new Set([allowedOrigin]),
    skillsDirectory: testDirectory,
    adminKey: "test-admin-key",
    runsFile: path.join(testDirectory, "runs.json"),
    keysFile: path.join(testDirectory, "keys.json"),
    teachingFile: path.join(testDirectory, "teaching.json"),
    sessionsFile: path.join(testDirectory, "sessions.json"),
    approvalsFile: path.join(testDirectory, "approvals.json"),
    rateLimitPerMinute: 120,
    queueMaxDepth: 100,
    runRetentionDays: 30,
    databaseUrl: null,
  }, { registry, executor, mockPortal, forgeEngine, runManager, apiKeys, sessions, teaching, approvals });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await stopWebcmdDaemon();
  await rm(testDirectory, { recursive: true, force: true });
});

test("health returns a safe structured response", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(body.service, "thru-backend");
  assert.ok(body.status === "ok" || body.status === "degraded");
});

test("hello proves an allowed cross-origin request", async () => {
  const response = await fetch(`${baseUrl}/hello`, {
    headers: { Origin: allowedOrigin },
  });
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
  assert.equal(body.message, "THRU deployment online");
});

test("preflight returns the exact CORS contract", async () => {
  const response = await fetch(`${baseUrl}/hello`, {
    method: "OPTIONS",
    headers: { Origin: allowedOrigin },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST, DELETE, OPTIONS");
  assert.equal(
    response.headers.get("access-control-allow-headers"),
    "Content-Type, X-THRU-Admin-Key, Prefer, Idempotency-Key, Authorization",
  );
});

test("an unapproved origin is rejected without a permissive header", async () => {
  const response = await fetch(`${baseUrl}/hello`, {
    headers: { Origin: "https://unapproved.example" },
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("unknown routes return a structured 404", async () => {
  const response = await fetch(`${baseUrl}/missing`);
  const body = (await response.json()) as { error: { code: string; requestId: string } };
  assert.equal(response.status, 404);
  assert.equal(body.error.code, "not_found");
  assert.ok(body.error.requestId.length > 0);
});

test("malformed and oversized requests fail safely without stack traces", async () => {
  const malformed = await fetch(`${baseUrl}/registry/import`, { method: "POST", headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": "test-admin-key" }, body: "{" }); const malformedText = await malformed.text(); assert.equal(malformed.status, 400); assert.doesNotMatch(malformedText, /\bat\s+\w+|node:internal/);
  const oversized = await fetch(`${baseUrl}/registry/import`, { method: "POST", headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": "test-admin-key" }, body: JSON.stringify({ value: "x".repeat(1_048_576) }) }); const oversizedText = await oversized.text(); assert.equal(oversized.status, 413); assert.doesNotMatch(oversizedText, /\bat\s+\w+|node:internal/);
  const oddMethod = await fetch(`${baseUrl}/skills/hell-check`, { method: "PATCH", body: "noise" }); assert.equal(oddMethod.status, 404);
});

test("registry exposes installed skills", async () => {
  const response = await fetch(`${baseUrl}/registry`);
  const body = (await response.json()) as { skills: Array<{ skill: { id: string } }> };
  assert.equal(response.status, 200);
  assert.deepEqual(body.skills.map((item) => item.skill.id), ["hell-check"]);
});

test("MCP lists each registry skill as a typed tool", async () => {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /thru_hell_check/);
  assert.match(body, /Certificate reference/);

  const call = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "thru_hell_check", arguments: { certificate: "DEMO-1000" } } }),
  });
  const callBody = await call.text();
  assert.equal(call.status, 200);
  assert.match(callBody, /\\"status\\":\\"success\\"/);
});

test("invalid skill input is rejected before execution", async () => {
  const response = await fetch(`${baseUrl}/skills/hell-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ certificate: "?" }),
  });
  const body = (await response.json()) as { status: string };
  assert.equal(response.status, 400);
  assert.equal(body.status, "invalid_input");
});

test("one skill runs through REST and updates vitals", async () => {
  const runsBefore = registry.get("hell-check")?.vitals.runs ?? 0;
  const response = await fetch(`${baseUrl}/skills/hell-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ certificate: "DEMO-1234" }),
  });
  const body = (await response.json()) as { status: string; data: { status: string } };
  assert.equal(response.status, 200);
  assert.equal(body.status, "success");
  assert.equal(body.data.status, "verified");
  assert.equal(registry.get("hell-check")?.vitals.runs, runsBefore + 1);
});

test("admin sabotage triggers relocation and persists a version bump", async () => {
  const sabotage = await fetch(`${baseUrl}/admin/sabotage`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": "test-admin-key" },
    body: JSON.stringify({ variant: "v2" }),
  });
  assert.equal(sabotage.status, 200);
  const response = await fetch(`${baseUrl}/skills/hell-check?certificate=DEMO-2345`);
  const body = (await response.json()) as { status: string; version: number; healing: Array<{ rung: string }> };
  assert.equal(body.status, "healed_success");
  assert.equal(body.version, 2);
  assert.equal(body.healing[0]?.rung, "relocate");
  assert.equal(registry.get("hell-check")?.history.length, 1);
});

test("larger mock drift triggers targeted step re-forging", async () => {
  mockPortal.setVariant("v3");
  const response = await fetch(`${baseUrl}/skills/hell-check?certificate=DEMO-3456`);
  const body = (await response.json()) as { status: string; version: number; healing: Array<{ rung: string }> };
  assert.equal(body.status, "healed_success");
  assert.equal(body.version, 3);
  assert.equal(body.healing[0]?.rung, "reforge");
});

test("gateway refuses a sensitive step with needs_human", async () => {
  const base = registry.get("hell-check");
  assert.ok(base);
  await registry.import({
    ...base,
    skill: { ...base.skill, id: "sensitive-submit", sensitive: true },
    workflow: {
      ...base.workflow,
      steps: base.workflow.steps.map((step, index) => index === 0 ? { ...step, sensitive: true, target_description: "Submit a payment" } : step),
    },
  });
  const response = await fetch(`${baseUrl}/skills/sensitive-submit?certificate=DEMO-4567`);
  const body = (await response.json()) as { status: string; needs_human: { reason: string } };
  assert.equal(response.status, 200);
  assert.equal(body.status, "needs_human");
  assert.match(body.needs_human.reason, /payment/i);
});

test("management approval is durably audited against a gated run", async () => {
  const gated = await fetch(`${baseUrl}/skills/sensitive-submit?certificate=DEMO-4567`);
  const gatedBody = await gated.json() as { status: string; skill: string };
  assert.equal(gatedBody.status, "needs_human");
  const runs = await fetch(`${baseUrl}/runs?limit=20`).then((response) => response.json()) as { runs: Array<{ id: string; result: { status: string } | null }> };
  const run = runs.runs.find((candidate) => candidate.result?.status === "needs_human");
  assert.ok(run);
  const approval = await fetch(`${baseUrl}/runs/${run!.id}/approval`, { method: "POST", headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": "test-admin-key" }, body: JSON.stringify({ decision: "denied", note: "Test operator declined the sensitive action." }) });
  const approvalBody = await approval.json() as { approval: { decision: string; approver_id: string; note: string | null }; run: { events: Array<{ type: string }> } };
  assert.equal(approval.status, 201);
  assert.equal(approvalBody.approval.decision, "denied");
  assert.equal(approvalBody.approval.approver_id, "00000000-0000-0000-0000-000000000001");
  assert.equal(approvalBody.approval.note, "Test operator declined the sensitive action.");
  assert.ok(approvalBody.run.events.some((event) => event.type === "gate_denied"));
  const second = await fetch(`${baseUrl}/runs/${run!.id}/approval`, { method: "POST", headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": "test-admin-key" }, body: JSON.stringify({ decision: "approved" }) });
  assert.equal(second.status, 409);
});

test("approved gates securely resume the run and remain auditable", async () => {
  const gated = await fetch(`${baseUrl}/skills/sensitive-submit?certificate=DEMO-APPROVE`);
  assert.equal((await gated.json() as { status: string }).status, "needs_human");
  const runs = await fetch(`${baseUrl}/runs?limit=50`).then((response) => response.json()) as { runs: Array<{ id: string; result: { status: string } | null }> };
  const run = runs.runs.find((candidate) => candidate.result?.status === "needs_human");
  assert.ok(run);
  const approval = await fetch(`${baseUrl}/runs/${run!.id}/approval`, { method: "POST", headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": "test-admin-key" }, body: JSON.stringify({ decision: "approved", note: "Approved for the controlled MVP fixture." }) });
  assert.equal(approval.status, 201);
  let state = await fetch(`${baseUrl}/runs/${run!.id}`).then((response) => response.json()) as { state: string; result: { status: string } | null };
  for (let attempt = 0; attempt < 30 && (state.state === "queued" || state.state === "running"); attempt++) { await new Promise((resolve) => setTimeout(resolve, 250)); state = await fetch(`${baseUrl}/runs/${run!.id}`).then((response) => response.json()) as typeof state; }
  assert.equal(state.state, "completed");
  assert.ok(state.result && ["success", "healed_success"].includes(state.result.status));
});

test("guided browser capture route records and serves isolated evidence", async () => {
  const headers = { "Content-Type": "application/json", "X-THRU-Admin-Key": "test-admin-key" };
  const created = await fetch(`${baseUrl}/teaching-sessions`, { method: "POST", headers, body: JSON.stringify({ goal_text: "Read the example page", url: "https://example.com" }) });
  assert.equal(created.status, 201);
  const session = await created.json() as { id: string };
  const started = await fetch(`${baseUrl}/teaching-sessions/${session.id}/capture`, { method: "POST", headers });
  assert.equal(started.status, 200);
  const capture = await started.json() as { capture: { status: string } };
  assert.equal(capture.capture.status, "running");
  const action = await fetch(`${baseUrl}/teaching-sessions/${session.id}/capture/actions`, { method: "POST", headers, body: JSON.stringify({ type: "extract", target: "body" }) });
  assert.equal(action.status, 200);
  const actionBody = await action.json() as { actions: Array<{ evidence?: { screenshot_ref?: string } }> };
  const screenshotRef = actionBody.actions.at(-1)?.evidence?.screenshot_ref ?? "";
  assert.match(screenshotRef, /^captures\//);
  const filename = screenshotRef.split("/").at(-1)!;
  const evidence = await fetch(`${baseUrl}/teaching-sessions/${session.id}/evidence/${filename}`, { headers });
  assert.equal(evidence.status, 200);
  assert.equal(evidence.headers.get("content-type"), "image/jpeg");
  await fetch(`${baseUrl}/teaching-sessions/${session.id}`, { method: "DELETE", headers });
});

test("admin routes fail closed when the key is absent", async () => {
  const response = await fetch(`${baseUrl}/admin/sabotage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant: "v1" }),
  });
  assert.equal(response.status, 401);
});

test("scoped API keys execute, protect management actions, and revoke immediately", async () => {
  const runKey = await apiKeys.create("run-only", ["run"]);
  const manageKey = await apiKeys.create("manager", ["run", "manage"]);
  const runResponse = await fetch(`${baseUrl}/skills/hell-check?certificate=DEMO-9012`, { headers: { Authorization: `Bearer ${runKey.value}` } });
  assert.equal(runResponse.status, 200);
  const forbidden = await fetch(`${baseUrl}/keys`, { method: "POST", headers: { Authorization: `Bearer ${runKey.value}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "should-fail" }) });
  assert.equal(forbidden.status, 401);
  const revoked = await fetch(`${baseUrl}/keys/${runKey.key.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${manageKey.value}` } });
  assert.equal(revoked.status, 200);
  const blocked = await fetch(`${baseUrl}/skills/hell-check?certificate=DEMO-9013`, { headers: { Authorization: `Bearer ${runKey.value}` } });
  assert.equal(blocked.status, 401);
});

test("API keys can exchange for scoped, revocable browser sessions", async () => {
  const manageKey = await apiKeys.create("session-manager", ["run", "manage"]);
  const created = await fetch(`${baseUrl}/auth/session`, { method: "POST", headers: { Authorization: `Bearer ${manageKey.value}` } });
  assert.equal(created.status, 201);
  const body = await created.json() as { token: string; session: { scopes: string[] } };
  assert.ok(body.token.startsWith("st_thru_"));
  assert.deepEqual(body.session.scopes, ["run", "manage"]);
  const me = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(me.status, 200);
  assert.equal((await me.json() as { kind: string }).kind, "session");
  const keys = await fetch(`${baseUrl}/keys`, { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(keys.status, 200);
  const logout = await fetch(`${baseUrl}/auth/session`, { method: "DELETE", headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(logout.status, 200);
  const revoked = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(revoked.status, 401);
});

test("Prefer respond-async returns a queued run that can be polled", async () => {
  mockPortal.setVariant("v1");
  const response = await fetch(`${baseUrl}/skills/hell-check`, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "respond-async" }, body: JSON.stringify({ certificate: "DEMO-5678" }) });
  assert.equal(response.status, 202); const queued = await response.json() as { id: string; state: string }; assert.ok(queued.id); assert.ok(["queued", "running"].includes(queued.state));
  let state: { state: string; result?: { status: string } | null } = queued;
  for (let attempt = 0; attempt < 30 && state.state !== "completed"; attempt++) { await new Promise((resolve) => setTimeout(resolve, 250)); state = await (await fetch(`${baseUrl}/runs/${queued.id}`)).json() as typeof state; }
  assert.equal(state.state, "completed"); assert.ok(["success", "healed_success"].includes(state.result?.status ?? ""));
});

test("two-phase THRU keeps drafts unregistered until confirmation and hot-registers MCP", async () => {
  const proposed = await fetch(`${baseUrl}/teach`, { method: "POST", headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": "test-admin-key" }, body: JSON.stringify({ goal_text: "Read test page", url: "https://example.org" }) });
  assert.equal(proposed.status, 201); const proposal = await proposed.json() as { proposal_id: string; artifact: { skill: { id: string } } }; assert.equal(registry.get(proposal.artifact.skill.id), undefined);
  const confirmed = await fetch(`${baseUrl}/teach/${proposal.proposal_id}`, { method: "POST", headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": "test-admin-key" }, body: "{}" }); assert.equal(confirmed.status, 201); assert.ok(registry.get(proposal.artifact.skill.id));
  const tools = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list", params: {} }) }); assert.match(await tools.text(), new RegExp(`thru_${proposal.artifact.skill.id.replaceAll("-", "_")}`));
});

test("browser execution resolves iframe tables by headers", async () => {
  await installFixtureSkill("iframe-table", [{ id: "s1", action: "navigate", target_description: "Iframe table fixture", url: "{site}/mock/fixture?scenario=iframe", expect: { contains: ["Iframe fixture"], not_contains: ["captcha"] }, timeout_ms: 8_000, sensitive: false }, { id: "s2", action: "extract", target_description: "Results table", selector_primary: "#results", selector_fallbacks: ["table"], extraction: { strategy: "header_map", map_to: "outputs", selector: "#results" }, expect: { element_present: "#results", not_contains: ["access denied"] }, timeout_ms: 8_000, sensitive: false }], { type: "object", properties: { items: { type: "array", items: { type: "object", properties: {}, additionalProperties: true } } }, required: ["items"] });
  const body = await (await fetch(`${baseUrl}/skills/iframe-table`)).json() as { status: string; data: { items: Array<Record<string, string>> } }; assert.equal(body.status, "success"); assert.deepEqual(body.data.items[0], { Name: "Alpha", Status: "Ready" });
});

test("browser execution adopts a new tab and extracts JSON", async () => {
  await installFixtureSkill("new-tab-json", [{ id: "s1", action: "navigate", target_description: "New tab fixture", url: "{site}/mock/fixture?scenario=newtab", expect: { contains: ["New tab fixture"], not_contains: ["captcha"] }, timeout_ms: 8_000, sensitive: false }, { id: "s2", action: "click", target_description: "Open result button", selector_primary: "#open-result", selector_fallbacks: ["text:Open Result"], expect: { element_present: "#result-json", not_contains: ["access denied"] }, timeout_ms: 8_000, sensitive: false }, { id: "s3", action: "extract", target_description: "New tab JSON", selector_primary: "#result-json", selector_fallbacks: ["pre"], extraction: { strategy: "json_element", map_to: "outputs", selector: "#result-json" }, expect: { contains: ["new-tab"], not_contains: ["error"] }, timeout_ms: 8_000, sensitive: false }], { type: "object", properties: { status: { type: "string" }, source: { type: "string" } }, required: ["status", "source"] });
  const body = await (await fetch(`${baseUrl}/skills/new-tab-json`)).json() as { status: string; data: { source: string } }; assert.equal(body.status, "success"); assert.equal(body.data.source, "new-tab");
});

test("a plausible repair is rolled back when its successor expectation fails", async () => {
  const installed = await installFixtureSkill("rollback-repair", [{ id: "s1", action: "navigate", target_description: "Certificate fixture", url: "{site}/mock/hell-portal", expect: { contains: ["Certificate Status"], not_contains: ["captcha"] }, timeout_ms: 8_000, sensitive: false }, { id: "s2", action: "click", target_description: "Check Status", selector_primary: "#broken-button", selector_fallbacks: ["#check-status"], expect: { element_present: "#result-json", not_contains: ["captcha"] }, timeout_ms: 8_000, sensitive: false }, { id: "s3", action: "extract", target_description: "Impossible successor", selector_primary: "#missing-result", selector_fallbacks: [], extraction: { strategy: "json_element", map_to: "outputs", selector: "#missing-result" }, expect: { contains: ["never"], not_contains: ["captcha"] }, timeout_ms: 1_000, sensitive: false }], { type: "object", properties: { status: { type: "string" } } });
  const result = await (await fetch(`${baseUrl}/skills/rollback-repair`)).json() as { status: string; healing: unknown[] }; assert.equal(result.status, "portal_error"); assert.ok(result.healing.length > 0); assert.equal(registry.get("rollback-repair")?.skill.version, installed.skill.version); assert.equal(registry.get("rollback-repair")?.history.length, 0);
});

test("dynamic selects, empty extraction, popup dismissal, and runtime login detection are safe", async () => {
  await installFixtureSkill("dynamic-select", [{ id: "s1", action: "navigate", target_description: "Dynamic fixture", url: "{site}/mock/fixture?scenario=dynamic", expect: { contains: ["Dynamic controls"], not_contains: ["captcha"] }, timeout_ms: 8_000, sensitive: false }, { id: "s2", action: "fill", target_description: "Category", selector_primary: "#category", selector_fallbacks: ["label:Category"], value_from: "inputs.category", expect: { field_value_equals: "inputs.category", not_contains: ["password"] }, timeout_ms: 8_000, sensitive: false }, { id: "s3", action: "extract", target_description: "Chosen category", selector_primary: "#chosen", selector_fallbacks: ["body"], extraction: { strategy: "header_map", map_to: "outputs", selector: "#chosen" }, expect: { contains: ["Beta"], not_contains: ["error"] }, timeout_ms: 8_000, sensitive: false }], { type: "object", properties: { text: { type: "string" }, empty: { type: "boolean" } }, required: ["text", "empty"] }, { type: "object", properties: { category: { type: "string" } }, required: ["category"] });
  const dynamic = await (await fetch(`${baseUrl}/skills/dynamic-select?category=Beta`)).json() as { status: string; healing?: unknown; steps?: unknown }; assert.equal(dynamic.status, "success", JSON.stringify(dynamic));
  await installFixtureSkill("empty-result", [{ id: "s1", action: "navigate", target_description: "Empty fixture", url: "{site}/mock/fixture?scenario=empty", expect: { contains: ["Empty result fixture"], not_contains: ["captcha"] }, timeout_ms: 8_000, sensitive: false }, { id: "s2", action: "extract", target_description: "Empty result", selector_primary: "#empty-result", selector_fallbacks: ["body"], extraction: { strategy: "header_map", map_to: "outputs", selector: "#empty-result" }, expect: { contains: ["Empty result fixture"], not_contains: ["error"] }, timeout_ms: 8_000, sensitive: false }], { type: "object", properties: { text: { type: "string" }, empty: { type: "boolean" } }, required: ["text", "empty"] });
  const empty = await (await fetch(`${baseUrl}/skills/empty-result`)).json() as { status: string; data: { empty: boolean } }; assert.equal(empty.status, "success", JSON.stringify(empty)); assert.equal(empty.data.empty, true);
  await installFixtureSkill("popup-dismiss", [{ id: "s1", action: "navigate", target_description: "Popup fixture", url: "{site}/mock/fixture?scenario=popup", expect: { contains: ["Popup fixture"], not_contains: ["captcha"] }, timeout_ms: 8_000, sensitive: false }, { id: "s2", action: "extract", target_description: "Popup-free content", selector_primary: "main", selector_fallbacks: ["body"], extraction: { strategy: "header_map", map_to: "outputs", selector: "main" }, expect: { contains: ["Popup fixture"], not_contains: ["Close popup"] }, timeout_ms: 8_000, sensitive: false }], { type: "object", properties: { text: { type: "string" }, empty: { type: "boolean" } }, required: ["text", "empty"] });
  assert.equal((await (await fetch(`${baseUrl}/skills/popup-dismiss`)).json() as { status: string }).status, "success");
  await installFixtureSkill("runtime-login", [{ id: "s1", action: "navigate", target_description: "Account page", url: "{site}/mock/fixture?scenario=login", expect: { contains: ["Account login"], not_contains: ["access denied"] }, timeout_ms: 8_000, sensitive: false }, { id: "s2", action: "extract", target_description: "Account content", selector_primary: "body", selector_fallbacks: ["main"], extraction: { strategy: "header_map", map_to: "outputs", selector: "body" }, expect: { element_present: "body", not_contains: ["error"] }, timeout_ms: 8_000, sensitive: false }], { type: "object", properties: { text: { type: "string" } } });
  const login = await (await fetch(`${baseUrl}/skills/runtime-login`)).json() as { status: string }; assert.equal(login.status, "needs_human"); assert.equal(registry.get("runtime-login")?.skill.sensitive, true);
});

async function installFixtureSkill(id: string, steps: WorkflowStep[], outputs: JsonSchema, inputs: JsonSchema = { type: "object", properties: {}, required: [] }): Promise<SkillArtifact> {
  const base = JSON.parse(await readFile(path.resolve("skills/hell-check.skill.json"), "utf8")) as SkillArtifact;
  return registry.import({ ...base, skill: { ...base.skill, id, name: id, version: 1, sensitive: false }, contract: { inputs, outputs }, workflow: { engine: "webcmd", steps }, vitals: { runs: 0, successes: 0, healed_runs: 0, avg_ms: 0, last_run: null, last_heal: null }, history: [] });
}

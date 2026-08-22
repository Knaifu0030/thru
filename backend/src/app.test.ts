import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import test, { after, before } from "node:test";
import { createForgeServer } from "./app.js";
import { SkillExecutor } from "./executor.js";
import { MockPortal } from "./mock-portal.js";
import { SkillRegistry } from "./registry.js";
import { ForgeEngine } from "./forge-engine.js";
import { RunManager } from "./run-manager.js";

const allowedOrigin = "https://forge.example.vercel.app";
let server: Server;
let baseUrl = "";
let testDirectory = "";
let registry: SkillRegistry;
let mockPortal: MockPortal;

before(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "forge-test-"));
  registry = new SkillRegistry(testDirectory);
  await registry.load();
  const fixture = JSON.parse(await readFile(path.resolve("skills/hell-check.skill.json"), "utf8"));
  await registry.import(fixture);
  mockPortal = new MockPortal();
  const executor = new SkillExecutor(registry);
  const forgeEngine = new ForgeEngine(registry, null, async (url) => ({ url, title: "Test", headings: ["Test"], labels: [], inputs: [], buttons: [], tables: [] }));
  const runManager = new RunManager(executor);
  server = createForgeServer({
    port: 0,
    version: "test",
    allowedOrigins: new Set([allowedOrigin]),
    skillsDirectory: testDirectory,
    adminKey: "test-admin-key",
  }, { registry, executor, mockPortal, forgeEngine, runManager });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
  await rm(testDirectory, { recursive: true, force: true });
});

test("health returns a safe structured response", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(body.service, "forge-backend");
  assert.ok(body.status === "ok" || body.status === "degraded");
});

test("hello proves an allowed cross-origin request", async () => {
  const response = await fetch(`${baseUrl}/hello`, {
    headers: { Origin: allowedOrigin },
  });
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
  assert.equal(body.message, "Forge deployment online");
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
    "Content-Type, X-Forge-Admin-Key, Prefer",
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
  assert.match(body, /forge_hell_check/);
  assert.match(body, /Certificate reference/);

  const call = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "forge_hell_check", arguments: { certificate: "DEMO-1000" } } }),
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
    headers: { "Content-Type": "application/json", "X-Forge-Admin-Key": "test-admin-key" },
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

test("admin routes fail closed when the key is absent", async () => {
  const response = await fetch(`${baseUrl}/admin/sabotage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant: "v1" }),
  });
  assert.equal(response.status, 401);
});

test("Prefer respond-async returns a queued run that can be polled", async () => {
  mockPortal.setVariant("v1");
  const response = await fetch(`${baseUrl}/skills/hell-check`, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "respond-async" }, body: JSON.stringify({ certificate: "DEMO-5678" }) });
  assert.equal(response.status, 202); const queued = await response.json() as { id: string; state: string }; assert.ok(queued.id); assert.ok(["queued", "running"].includes(queued.state));
  let state: { state: string; result?: { status: string } | null } = queued;
  for (let attempt = 0; attempt < 30 && state.state !== "completed"; attempt++) { await new Promise((resolve) => setTimeout(resolve, 250)); state = await (await fetch(`${baseUrl}/runs/${queued.id}`)).json() as typeof state; }
  assert.equal(state.state, "completed"); assert.ok(["success", "healed_success"].includes(state.result?.status ?? ""));
});

test("two-phase Forge keeps drafts unregistered until confirmation and hot-registers MCP", async () => {
  const proposed = await fetch(`${baseUrl}/forge`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forge-Admin-Key": "test-admin-key" }, body: JSON.stringify({ goal_text: "Read test page", url: "https://example.org" }) });
  assert.equal(proposed.status, 201); const proposal = await proposed.json() as { proposal_id: string; artifact: { skill: { id: string } } }; assert.equal(registry.get(proposal.artifact.skill.id), undefined);
  const confirmed = await fetch(`${baseUrl}/forge/${proposal.proposal_id}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forge-Admin-Key": "test-admin-key" }, body: "{}" }); assert.equal(confirmed.status, 201); assert.ok(registry.get(proposal.artifact.skill.id));
  const tools = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list", params: {} }) }); assert.match(await tools.text(), new RegExp(`forge_${proposal.artifact.skill.id.replaceAll("-", "_")}`));
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { boundedNarration, enforceSensitivity, GLOBAL_RUN_BUDGET_MS, isSensitiveStep, semanticSimilarity } from "./execution-policy.js";
import { THRUEngine } from "./forge-engine.js";
import { AzureOpenAITHRUModel, type THRUModel } from "./forge-model.js";
import { SkillRegistry } from "./registry.js";
import { validateArtifact, validateOutputs } from "./skill-validation.js";
import type { SkillArtifact } from "./types.js";
import { RunManager, RunQueueFullError } from "./run-manager.js";
import type { SkillExecutor } from "./executor.js";
import { ApiKeyStore } from "./key-store.js";
import type { DatabaseRuntime } from "./database.js";

async function fixture(): Promise<SkillArtifact> { return JSON.parse(await readFile(path.resolve("skills/hell-check.skill.json"), "utf8")) as SkillArtifact; }

test("execution policies are bounded and sensitivity only escalates", async () => {
  assert.equal(GLOBAL_RUN_BUDGET_MS, 90_000); assert.equal(boundedNarration("x".repeat(300)).length, 160); assert.equal(semanticSimilarity("Check certificate status", "Check certificate status"), 1); assert.ok(semanticSimilarity("Check certificate status", "Check status") >= 0.5); assert.equal(isSensitiveStep({ action: "click", target_description: "Delete record", sensitive: false }), true);
  const base = await fixture(); const sensitive = enforceSensitivity({ ...base, workflow: { ...base.workflow, steps: base.workflow.steps.map((step, index) => index === 0 ? { ...step, target_description: "Submit payment", sensitive: false } : step) } }); const attemptedRemoval = enforceSensitivity({ ...sensitive, skill: { ...sensitive.skill, sensitive: false }, workflow: { ...sensitive.workflow, steps: sensitive.workflow.steps.map((step) => ({ ...step, sensitive: false })) } }, sensitive); assert.equal(attemptedRemoval.skill.sensitive, true); assert.equal(attemptedRemoval.workflow.steps[0]?.sensitive, true);
});

test("artifact and output validation reject unsupported or malformed contracts", async () => {
  const base = await fixture(); assert.equal(validateArtifact(base).ok, true); assert.equal(validateArtifact({ ...base, history: Array.from({ length: 11 }, () => ({})) }).ok, false); assert.equal(validateArtifact({ ...base, contract: { ...base.contract, inputs: { ...base.contract.inputs, oneOf: [] } } }).ok, false); assert.equal(validateOutputs(base, { certificate: "DEMO-1", status: "verified", holder: "Demo", issued_on: "2026-08-22" }).ok, true); assert.equal(validateOutputs(base, null).ok, false);
});

test("registry suffixes collisions, quarantines temp files, and restores a valid backup", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "forge-registry-")); const base = await fixture(); const registry = new SkillRegistry(directory); await registry.load(); const first = await registry.import(base); const second = await registry.import(base); assert.equal(first.skill.id, "hell-check"); assert.equal(second.skill.id, "hell-check-2");
  const target = path.join(directory, "hell-check.skill.json"); await writeFile(`${target}.bak`, JSON.stringify(first), "utf8"); await writeFile(target, "broken", "utf8"); await writeFile(path.join(directory, "orphan.tmp"), "broken", "utf8"); const restored = new SkillRegistry(directory); await restored.load(); assert.ok(restored.get("hell-check")); assert.ok((await readdir(path.join(directory, "_invalid"))).some((name) => name.includes("orphan.tmp")));
});

test("THRU proposals fall back from malformed model output, expire, and accept edited confirmation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "forge-proposal-")); const registry = new SkillRegistry(directory); await registry.load(); let now = 1_000; const observation = async (url: string) => ({ url, title: "Observed", headings: ["Observed"], labels: ["Query"], inputs: [{ name: "query", type: "text", placeholder: "Search", id: "query", ariaLabel: "Query" }], buttons: ["Search"], tables: [] }); const malformed: THRUModel = { propose: async () => ({ nope: true }) }; const engine = new THRUEngine(registry, malformed, observation, 100, () => now); const proposal = await engine.propose({ goal_text: "Read public results", url: "https://example.org" }); assert.match(proposal.narration.join(" "), /Model proposal rejected/); assert.equal(registry.list().length, 0); const edited = { ...proposal.artifact, skill: { ...proposal.artifact.skill, name: "Edited proposal" } }; const saved = await engine.confirm(proposal.proposal_id, edited); assert.equal(saved.skill.name, "Edited proposal");
  const expiring = await engine.propose({ goal_text: "Read another page", url: "https://example.net" }); now += 101; await assert.rejects(engine.confirm(expiring.proposal_id), /expired/);
});

test("CLI uses stable usage, invalid-input, and declined-gate exit codes", () => {
  const cli = path.resolve("dist/cli.js"); const usage = spawnSync(process.execPath, [cli, "unknown"], { cwd: path.resolve("."), encoding: "utf8" }); assert.equal(usage.status, 2);
  const invalid = spawnSync(process.execPath, [cli, "run", "hell-check", "certificate=?"], { cwd: path.resolve("."), encoding: "utf8" }); assert.equal(invalid.status, 2); assert.match(invalid.stdout, /"status": "invalid_input"/);
  const declined = spawnSync(process.execPath, [cli, "run", "sensitive-submit", "certificate=DEMO-1"], { cwd: path.resolve("."), input: "NO\n", encoding: "utf8" }); assert.equal(declined.status, 3); assert.match(declined.stdout, /"status": "needs_human"/); assert.doesNotMatch(declined.stdout + declined.stderr, /password|otp value|cookie/i);
});

test("run queue is single-browser FIFO and exposes positions", async () => {
  const order: string[] = []; const fake = { runSkill: async (id: string) => { order.push(`start:${id}`); await new Promise((resolve) => setTimeout(resolve, 20)); order.push(`end:${id}`); return { skill: id, version: 1, status: "success", data: {}, healing: [], needs_human: null, timing_ms: 20 }; } } as unknown as SkillExecutor; const manager = new RunManager(fake); const first = manager.submit("one", {}, { surface: "rest" }); const second = manager.submit("two", {}, { surface: "rest" }); assert.ok(second.run.position >= 1); await Promise.all([first.completion, second.completion]); assert.deepEqual(order, ["start:one", "end:one", "start:two", "end:two"]); assert.equal(manager.get(second.run.id)?.state, "completed");
});

test("run queue enforces bounded backpressure and exposes operational metrics", async () => {
  const fake = { runSkill: async (id: string) => ({ skill: id, version: 1, status: "success", data: {}, healing: [], needs_human: null, timing_ms: 1 }) } as unknown as SkillExecutor;
  const manager = new RunManager(fake, undefined, 30, undefined, 1);
  const first = manager.submit("one", {}, { surface: "rest" });
  assert.throws(() => manager.submit("two", {}, { surface: "rest" }), RunQueueFullError);
  assert.equal(manager.metrics().limit, 1);
  assert.equal(manager.metrics().queue_depth, 1);
  await first.completion;
  assert.equal(manager.metrics().queue_depth, 0);
});

test("portal failures retry once with persisted attempt state", async () => {
  let attempts = 0;
  const fake = { runSkill: async () => { attempts += 1; return attempts === 1
    ? { skill: "one", version: 1, status: "portal_error", data: null, healing: [], needs_human: null, timing_ms: 1 }
    : { skill: "one", version: 1, status: "success", data: {}, healing: [], needs_human: null, timing_ms: 1 }; } } as unknown as SkillExecutor;
  const manager = new RunManager(fake);
  const submitted = manager.submit("one", {}, { surface: "rest" });
  const completed = await submitted.completion;
  assert.equal(attempts, 2);
  assert.equal(completed.state, "completed");
  assert.equal(completed.attempts, 2);
  assert.ok(completed.events.some((event) => event.type === "retry"));
});

test("durable queued runs are re-queued after a worker restart", async () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  let executed = 0;
  const fake = { runSkill: async (_id: string, inputs: unknown) => { executed += 1; assert.deepEqual(inputs, { certificate: "RECOVER" }); return { skill: "hell-check", version: 1, status: "success", data: {}, healing: [], needs_human: null, timing_ms: 1 }; } } as unknown as SkillExecutor;
  const pool = {
    query: async (sql: string) => {
      if (sql.startsWith("select id, skill_id")) return { rows: [{ id: runId, skill_id: "hell-check", idempotency_key: "restart-proof", state: "running", inputs: { certificate: "RECOVER" }, created_at: new Date(Date.now() - 1000), started_at: new Date(Date.now() - 900), completed_at: null, result: null, error: null }] };
      if (sql.startsWith("select run_id")) return { rows: [{ run_id: runId, type: "started", payload: {}, created_at: new Date(Date.now() - 900) }] };
      if (sql.startsWith("select pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (sql.startsWith("update runs set state = 'running'")) return { rows: [{ id: runId }] };
      return { rows: [] };
    },
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
  } as unknown as DatabaseRuntime["pool"];
  const database = { status: "ready", pool, close: async () => {} } as DatabaseRuntime;
  const manager = new RunManager(fake, undefined, 30, database);
  await manager.ready();
  for (let attempt = 0; attempt < 20 && manager.get(runId)?.state !== "completed"; attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(executed, 1);
  assert.equal(manager.get(runId)?.state, "completed");
  assert.ok(manager.get(runId)?.events.some((event) => event.message?.includes("worker restart")));
});

test("active cancellation remains cancelled after the browser step returns", async () => {
  const fake = { runSkill: async () => { await new Promise((resolve) => setTimeout(resolve, 30)); return { skill: "one", version: 1, status: "success", data: {}, healing: [], needs_human: null, timing_ms: 30 }; } } as unknown as SkillExecutor;
  const manager = new RunManager(fake);
  const submitted = manager.submit("one", {}, { surface: "rest" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await manager.cancel(submitted.run.id);
  const completed = await submitted.completion;
  assert.equal(completed.state, "cancelled");
  assert.match(completed.events.at(-1)?.message ?? "", /cancelled/i);
});

test("Azure OpenAI provider requests structured output and rejects malformed JSON", async () => {
  const original = globalThis.fetch; let requestBody: unknown;
  try {
    globalThis.fetch = async (_input, init) => { requestBody = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(await fixture()) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }); };
    const model = new AzureOpenAITHRUModel({ endpoint: "https://forge.openai.azure.com", apiKey: "test-key", deployment: "forge-model", apiVersion: "2024-10-21" }); const proposed = await model.propose({ goal_text: "read", url: "https://example.org", observation: {}, deterministic_artifact: {} }); assert.equal((proposed as SkillArtifact).forge_spec, 1); assert.equal((requestBody as { response_format: { type: string } }).response_format.type, "json_schema");
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200, headers: { "Content-Type": "application/json" } }); await assert.rejects(model.propose({ goal_text: "read", url: "https://example.org", observation: {}, deterministic_artifact: {} }), /malformed JSON/);
  } finally { globalThis.fetch = original; }
});

test("distribution contains exactly the five THRU artifacts", async () => {
  const files = (await readdir(path.resolve("skills"))).filter((name) => name.endsWith(".skill.json")).sort(); assert.deepEqual(files, ["cern-history.skill.json", "example-reference.skill.json", "hell-check.skill.json", "httpbin-document.skill.json", "sensitive-submit.skill.json"]);
});

test("API keys persist hashed values and revoke immediately", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "thru-keys-"));
  const store = new ApiKeyStore(path.join(directory, "keys.json")); await store.ready();
  const created = await store.create("integration"); assert.equal(store.list().length, 1); assert.ok(await store.authenticate(created.value));
  const raw = await readFile(path.join(directory, "keys.json"), "utf8"); assert.match(raw, /\"hash\"/); assert.doesNotMatch(raw, new RegExp(created.value));
  assert.equal(await store.revoke(created.key.id), true); assert.equal(await store.authenticate(created.value), null);
});

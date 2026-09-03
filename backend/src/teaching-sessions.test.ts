import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SkillRegistry } from "./registry.js";
import { THRUEngine } from "./forge-engine.js";
import { TeachingSessionStore } from "./teaching-sessions.js";

test("guided teaching actions become the replayed draft workflow", async () => {
  const registry = new SkillRegistry(await mkdtemp(path.join(tmpdir(), "thru-teaching-test-")));
  await registry.load();
  const engine = new THRUEngine(registry, null, async (url) => ({
    url,
    title: "Example",
    headings: ["Example"],
    labels: ["Query"],
    inputs: [],
    buttons: [],
    tables: [],
  }));
  const store = new TeachingSessionStore(engine, 60_000);
  const session = await store.create("Read a result", "https://example.org", { query: "demo" });
  await assert.rejects(() => store.validate(session.id), /at least one guided action/);
  await assert.rejects(() => store.addAction(session.id, { type: "navigate", target: "http://127.0.0.1/admin" }), /private networks/);
  await assert.rejects(() => store.addAction(session.id, { type: "navigate", target: "https://not-example.org/other" }), /teaching domain allowlist/);
  await store.addAction(session.id, { type: "fill", target: "#query", value: "query", evidence: { selector: "#query", text: "x".repeat(6000), screenshot_ref: "capture://step-1" } });
  await store.addAction(session.id, { type: "click", target: "text:Search" });
  await store.addAction(session.id, { type: "wait", value: "500" });
  await store.addAction(session.id, { type: "switch_frame", target: "iframe" });
  await store.addAction(session.id, { type: "switch_tab", target: "example.org" });
  const draft = store.get(session.id)!;
  assert.equal(draft.actions.length, 6);
  assert.deepEqual(draft.artifact?.workflow.steps.map((step) => step.action), ["navigate", "fill", "click", "wait", "switch_frame", "switch_tab", "extract"]);
  assert.equal(draft.artifact?.workflow.steps.length, 7);
  assert.deepEqual(draft.artifact?.contract.inputs.required, ["query"]);
  assert.equal(draft.actions[1]?.evidence?.screenshot_ref, "capture://step-1");
  assert.equal(draft.actions[1]?.evidence?.text?.length, 5000);
  const validated = await store.validate(session.id);
  assert.equal(validated.state, "validated");
  assert.equal(validated.validation_error, null);
  assert.deepEqual(validated.events.map((event) => event.type), ["created", "action", "action", "action", "action", "action", "validated"]);
  await store.delete(session.id);
});

test("live guided capture uses an isolated browser and records evidence", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "thru-live-teaching-test-"));
  const registry = new SkillRegistry(directory);
  await registry.load();
  const engine = new THRUEngine(registry, null, async (url) => ({ url, title: "Example", headings: ["Example"], labels: [], inputs: [], buttons: [], tables: [] }));
  const store = new TeachingSessionStore(engine, 60_000, path.join(directory, "teaching.json"));
  const session = await store.create("Read the example page", "https://example.com");
  const started = await store.startCapture(session.id, "00000000-0000-0000-0000-000000000001");
  assert.equal(started.capture?.status, "running");
  const captured = await store.captureAction(session.id, { type: "extract", target: "body" }, "00000000-0000-0000-0000-000000000001");
  assert.equal(captured.actions.at(-1)?.source, "user");
  assert.equal(captured.actions.at(-1)?.evidence?.url, "https://example.com/");
  assert.match(captured.actions.at(-1)?.evidence?.screenshot_ref ?? "", /^captures\//);
  const stopped = await store.stopCapture(session.id, "00000000-0000-0000-0000-000000000001");
  assert.equal(stopped?.capture?.status, "stopped");
  await store.delete(session.id);
});

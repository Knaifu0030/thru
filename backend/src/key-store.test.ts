import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { ApiKeyStore } from "./key-store.js";

test("scoped keys enforce capabilities and survive reload", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "thru-keys-")); const file = path.join(dir, "keys.json");
  try {
    const store = new ApiKeyStore(file); await store.ready(); const created = await store.create("runner", ["run"]);
    assert.deepEqual(created.key.scopes, ["run"]); assert.ok(await store.authenticate(created.value, "run")); assert.equal(await store.authenticate(created.value, "manage"), null);
    const reloaded = new ApiKeyStore(file); await reloaded.ready(); assert.ok(await reloaded.authenticate(created.value, "run"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("legacy records default to full compatibility scopes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "thru-keys-")); const file = path.join(dir, "keys.json");
  try { await writeFile(file, JSON.stringify([{ id: "legacy", name: "legacy", hash: "x", created_at: new Date().toISOString(), last_used_at: null, revoked_at: null }])); const store = new ApiKeyStore(file); await store.ready(); assert.deepEqual(store.list()[0]?.scopes, ["run", "manage"]); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test("new keys never gain management scope from an empty request", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "thru-keys-")); const file = path.join(dir, "keys.json");
  try { const store = new ApiKeyStore(file); await store.ready(); const created = await store.create("safe-default", []); assert.deepEqual(created.key.scopes, ["run"]); assert.equal(await store.authenticate(created.value, "manage"), null); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

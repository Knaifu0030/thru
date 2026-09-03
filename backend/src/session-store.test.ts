import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "./session-store.js";

test("sessions preserve scopes, survive reload, and revoke", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "thru-sessions-"));
  const file = path.join(dir, "sessions.json");
  try {
    const store = new SessionStore(file, undefined, 60_000);
    await store.ready();
    const created = await store.create(["manage"]);
    assert.deepEqual(created.session.scopes, ["manage"]);
    assert.ok(await store.authenticate(created.token, "manage"));
    assert.equal(await store.authenticate(created.token, "run"), null);
    const reloaded = new SessionStore(file, undefined, 60_000);
    await reloaded.ready();
    assert.ok(await reloaded.authenticate(created.token, "manage"));
    assert.equal(await reloaded.revoke(created.token), true);
    assert.equal(await reloaded.authenticate(created.token, "manage"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("expired sessions fail closed", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "thru-sessions-"));
  try {
    const store = new SessionStore(path.join(dir, "sessions.json"), undefined, 1);
    await store.ready();
    const created = await store.create(["run"]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(await store.authenticate(created.token, "run"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

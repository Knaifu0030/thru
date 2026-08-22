import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import { createForgeServer } from "./app.js";

const allowedOrigin = "https://forge.example.vercel.app";
const server = createForgeServer({
  port: 0,
  version: "test",
  allowedOrigins: new Set([allowedOrigin]),
});
let baseUrl = "";

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
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
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(
    response.headers.get("access-control-allow-headers"),
    "Content-Type, X-Forge-Admin-Key",
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


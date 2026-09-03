/**
 * Operator-only bootstrap utility. Run it through `az containerapp exec`.
 * The THRU_ADMIN_KEY stays inside the container; only the newly minted
 * management key is written to stdout, once.
 */
const port = process.env.PORT ?? "8080";
const adminKey = process.env.THRU_ADMIN_KEY;
if (!adminKey) throw new Error("THRU_ADMIN_KEY is not available in this container.");

const response = await fetch(`http://127.0.0.1:${port}/keys`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": adminKey },
  body: JSON.stringify({ name: process.env.THRU_BOOTSTRAP_KEY_NAME ?? "Initial operator key", scopes: ["run", "manage"] }),
});
const body = await response.json() as { value?: string; key?: { id: string }; error?: { message: string } };
if (!response.ok || !body.value || !body.key) throw new Error(body.error?.message ?? `Could not bootstrap key (${response.status}).`);
// Keep the bootstrap surface bounded: a repeated operator bootstrap should not
// leave an unknown pile of active management keys in the database.
const existing = await fetch(`http://127.0.0.1:${port}/keys`, { headers: { "X-THRU-Admin-Key": adminKey } });
if (existing.ok) {
  const listed = await existing.json() as { keys?: Array<{ id?: string; name?: string }> };
  for (const item of listed.keys ?? []) {
    if (item.id && item.id !== body.key.id && item.name === (process.env.THRU_BOOTSTRAP_KEY_NAME ?? "Initial operator key")) {
      await fetch(`http://127.0.0.1:${port}/keys/${encodeURIComponent(item.id)}`, { method: "DELETE", headers: { "X-THRU-Admin-Key": adminKey } }).catch(() => undefined);
    }
  }
}
console.log(JSON.stringify({ id: body.key.id, value: body.value }));

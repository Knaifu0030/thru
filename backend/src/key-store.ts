import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseRuntime } from "./database.js";
import { SYSTEM_USER_ID } from "./database.js";

export type ApiCapability = "run" | "manage";
export interface ApiKeyRecord { id: string; user_id?: string | null; name: string; hash: string; scopes?: ApiCapability[]; created_at: string; last_used_at: string | null; revoked_at: string | null }
export interface PublicApiKey { id: string; name: string; masked_value: string; scopes: ApiCapability[]; created_at: string; last_used_at: string | null }
export interface ApiKeyIdentity { id: string; user_id: string; scopes: ApiCapability[] }

export class ApiKeyStore {
  #records = new Map<string, ApiKeyRecord>();
  #persistence: Promise<void> = Promise.resolve();
  constructor(private readonly file: string, private readonly database?: DatabaseRuntime) {}
  async ready(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await this.#loadFile();
    if (!this.database?.pool) return;
    const result = await this.database.pool.query<{ id: string; user_id: string; name: string; hash: string; scopes: string[]; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }>("select id, user_id, name, hash, scopes, created_at, last_used_at, revoked_at from api_keys");
    for (const row of result.rows) this.#records.set(row.id, { id: row.id, user_id: row.user_id, name: row.name, hash: row.hash, scopes: this.scopes(row.scopes), created_at: row.created_at.toISOString(), last_used_at: row.last_used_at?.toISOString() ?? null, revoked_at: row.revoked_at?.toISOString() ?? null });
    if (!result.rows.length && this.#records.size) await this.#persist();
  }
  list(userId?: string | null): PublicApiKey[] { return [...this.#records.values()].filter((r) => !r.revoked_at && (userId === undefined || (r.user_id ?? SYSTEM_USER_ID) === userId)).map((r) => this.public(r, r.id.slice(-4))); }
  async create(name: string, requestedScopes?: unknown, userId = SYSTEM_USER_ID): Promise<{ key: PublicApiKey; value: string }> { const value = `sk_thru_${randomBytes(24).toString("hex")}`; const scopes = this.requestedScopes(requestedScopes); const record: ApiKeyRecord = { id: `key_${randomBytes(8).toString("hex")}`, user_id: userId, name: name.trim() || "Untitled key", hash: hash(value), scopes, created_at: new Date().toISOString(), last_used_at: null, revoked_at: null }; this.#records.set(record.id, record); await this.#persist(); return { key: this.public(record, value.slice(-4)), value }; }
  async revoke(id: string, userId?: string | null): Promise<boolean> {
    let record = this.#records.get(id);
    if (!record && this.database?.pool) {
      const result = await this.database.pool.query<{ id: string; user_id: string; name: string; hash: string; scopes: string[]; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }>("select id, user_id, name, hash, scopes, created_at, last_used_at, revoked_at from api_keys where id = $1 limit 1", [id]);
      const row = result.rows[0];
      if (row) { record = { id: row.id, user_id: row.user_id, name: row.name, hash: row.hash, scopes: this.scopes(row.scopes), created_at: row.created_at.toISOString(), last_used_at: row.last_used_at?.toISOString() ?? null, revoked_at: row.revoked_at?.toISOString() ?? null }; this.#records.set(record.id, record); }
    }
    if (!record || record.revoked_at || (userId !== undefined && (record.user_id ?? SYSTEM_USER_ID) !== userId)) return false;
    record.revoked_at = new Date().toISOString(); await this.#persist(); return true;
  }
  async authenticate(value: string, capability: ApiCapability = "run"): Promise<PublicApiKey | null> { const identity = await this.authenticateIdentity(value, capability); if (!identity) return null; return this.public(identity.record, value.slice(-4)); }
  async authenticateIdentity(value: string, capability: ApiCapability = "run"): Promise<(ApiKeyIdentity & { record: ApiKeyRecord }) | null> {
    const digest = hash(value);
    if (this.database?.pool) {
      const result = await this.database.pool.query<{ id: string; user_id: string; name: string; hash: string; scopes: string[]; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }>("select id, user_id, name, hash, scopes, created_at, last_used_at, revoked_at from api_keys where hash = $1 and revoked_at is null limit 1", [digest]);
      const row = result.rows[0];
      if (!row) return null;
      const scopes = this.scopes(row.scopes);
      if (!scopes.includes(capability)) return null;
      const lastUsed = new Date().toISOString();
      const record: ApiKeyRecord = { id: row.id, user_id: row.user_id, name: row.name, hash: row.hash, scopes, created_at: row.created_at.toISOString(), last_used_at: lastUsed, revoked_at: null };
      this.#records.set(record.id, record);
      await this.database.pool.query("update api_keys set last_used_at = $2 where id = $1 and revoked_at is null", [record.id, lastUsed]);
      return { id: record.id, user_id: record.user_id ?? SYSTEM_USER_ID, scopes, record };
    }
    for (const record of this.#records.values()) { const scopes = this.scopes(record.scopes); const a = Buffer.from(digest); const b = Buffer.from(record.hash); if (!record.revoked_at && scopes.includes(capability) && a.length === b.length && timingSafeEqual(a, b)) { record.last_used_at = new Date().toISOString(); await this.#persist(); return { id: record.id, user_id: record.user_id ?? SYSTEM_USER_ID, scopes, record }; } }
    return null;
  }
  private scopes(value: unknown): ApiCapability[] { const scopes = Array.isArray(value) ? value.filter((s): s is ApiCapability => s === "run" || s === "manage") : []; return scopes.length ? [...new Set(scopes)] : ["run", "manage"]; }
  private requestedScopes(value: unknown): ApiCapability[] { if (!Array.isArray(value)) return ["run"]; const scopes = value.filter((s): s is ApiCapability => s === "run" || s === "manage"); return scopes.length ? [...new Set(scopes)] : ["run"]; }
  private public(record: ApiKeyRecord, suffix: string): PublicApiKey { return { id: record.id, name: record.name, masked_value: `sk_thru_••••••••${suffix}`, scopes: this.scopes(record.scopes), created_at: record.created_at, last_used_at: record.last_used_at }; }
  async #loadFile(): Promise<void> { try { const records = JSON.parse(await readFile(this.file, "utf8")) as ApiKeyRecord[]; for (const record of records) this.#records.set(record.id, record); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  async #persist(): Promise<void> { this.#persistence = this.#persistence.catch(() => undefined).then(async () => { if (this.database?.pool) await this.#persistDatabase(); const temp = `${this.file}.${randomBytes(8).toString("hex")}.tmp`; await writeFile(temp, `${JSON.stringify([...this.#records.values()], null, 2)}\n`, "utf8"); await rename(temp, this.file); }); return this.#persistence; }
  async #persistDatabase(): Promise<void> { const pool = this.database?.pool; if (!pool) return; const client = await pool.connect(); try { await client.query("begin"); for (const record of this.#records.values()) await client.query("insert into api_keys (id, user_id, name, hash, scopes, created_at, last_used_at, revoked_at) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do update set user_id = excluded.user_id, name = excluded.name, hash = excluded.hash, scopes = excluded.scopes, last_used_at = excluded.last_used_at, revoked_at = excluded.revoked_at", [record.id, record.user_id ?? SYSTEM_USER_ID, record.name, record.hash, this.scopes(record.scopes), record.created_at, record.last_used_at, record.revoked_at]); await client.query("commit"); } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); } }
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

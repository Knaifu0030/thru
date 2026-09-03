import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseRuntime } from "./database.js";
import { SYSTEM_USER_ID } from "./database.js";
import type { ApiCapability } from "./key-store.js";

export interface SessionRecord { id: string; user_id?: string | null; hash: string; scopes: ApiCapability[]; created_at: string; last_used_at: string | null; expires_at: string; revoked_at: string | null }
export interface PublicSession { id: string; scopes: ApiCapability[]; created_at: string; last_used_at: string | null; expires_at: string }
export interface SessionIdentity { id: string; user_id: string; scopes: ApiCapability[]; session: PublicSession }

/** Short-lived browser sessions derived from a server-issued API key. Plaintext
 * tokens are returned only at creation; persistence stores only SHA-256 hashes. */
export class SessionStore {
  #records = new Map<string, SessionRecord>();
  #persistence: Promise<void> = Promise.resolve();
  constructor(private readonly file: string, private readonly database?: DatabaseRuntime, private readonly ttlMs = 8 * 60 * 60_000) {}

  async ready(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await this.loadFile();
    if (this.database?.pool) {
      const result = await this.database.pool.query<{ id: string; user_id: string; token_hash: string; scopes: string[]; created_at: Date; last_used_at: Date | null; expires_at: Date; revoked_at: Date | null }>("select id, user_id, token_hash, scopes, created_at, last_used_at, expires_at, revoked_at from sessions");
      for (const row of result.rows) this.#records.set(row.id, { id: row.id, user_id: row.user_id, hash: row.token_hash, scopes: this.scopes(row.scopes), created_at: row.created_at.toISOString(), last_used_at: row.last_used_at?.toISOString() ?? null, expires_at: row.expires_at.toISOString(), revoked_at: row.revoked_at?.toISOString() ?? null });
    }
    this.expire();
    await this.persist();
  }

  async create(scopes: readonly ApiCapability[] = ["run"], userId = SYSTEM_USER_ID): Promise<{ session: PublicSession; token: string }> {
    const token = `st_thru_${randomBytes(32).toString("hex")}`;
    const now = Date.now();
    const record: SessionRecord = { id: randomUUID(), user_id: userId, hash: hash(token), scopes: this.scopes(scopes), created_at: new Date(now).toISOString(), last_used_at: null, expires_at: new Date(now + this.ttlMs).toISOString(), revoked_at: null };
    this.#records.set(record.id, record);
    await this.persist();
    return { session: this.public(record), token };
  }

  list(): PublicSession[] { this.expire(); return [...this.#records.values()].filter((record) => !record.revoked_at).map((record) => this.public(record)); }

  async authenticate(token: string, capability: ApiCapability = "run"): Promise<PublicSession | null> { const identity = await this.authenticateIdentity(token, capability); return identity?.session ?? null; }

  async authenticateIdentity(token: string, capability: ApiCapability = "run"): Promise<SessionIdentity | null> {
    this.expire();
    const tokenHash = hash(token);
    if (this.database?.pool) {
      const result = await this.database.pool.query<{ id: string; user_id: string; token_hash: string; scopes: string[]; created_at: Date; last_used_at: Date | null; expires_at: Date; revoked_at: Date | null }>("select id, user_id, token_hash, scopes, created_at, last_used_at, expires_at, revoked_at from sessions where token_hash = $1 and revoked_at is null and expires_at > now() limit 1", [tokenHash]);
      const row = result.rows[0];
      if (!row) return null;
      const scopes = this.scopes(row.scopes);
      if (!scopes.includes(capability)) return null;
      const lastUsed = new Date().toISOString();
      const record: SessionRecord = { id: row.id, user_id: row.user_id, hash: row.token_hash, scopes, created_at: row.created_at.toISOString(), last_used_at: lastUsed, expires_at: row.expires_at.toISOString(), revoked_at: null };
      this.#records.set(record.id, record);
      await this.database.pool.query("update sessions set last_used_at = $2 where id = $1 and revoked_at is null", [record.id, lastUsed]);
      const session = this.public(record); return { id: record.id, user_id: record.user_id ?? SYSTEM_USER_ID, scopes: session.scopes, session };
    }
    const digest = Buffer.from(hash(token));
    for (const record of this.#records.values()) {
      const stored = Buffer.from(record.hash);
      if (!record.revoked_at && this.scopes(record.scopes).includes(capability) && digest.length === stored.length && timingSafeEqual(digest, stored)) {
        record.last_used_at = new Date().toISOString();
        await this.persist();
        const session = this.public(record); return { id: record.id, user_id: record.user_id ?? SYSTEM_USER_ID, scopes: session.scopes, session };
      }
    }
    return null;
  }

  async revoke(tokenOrId: string): Promise<boolean> {
    const digest = hash(tokenOrId);
    let record = this.#records.get(tokenOrId) ?? [...this.#records.values()].find((candidate) => candidate.hash === digest);
    if (!record && this.database?.pool) {
      const lookup = /^[0-9a-f-]{36}$/i.test(tokenOrId) ? { sql: "select id, user_id, token_hash, scopes, created_at, last_used_at, expires_at, revoked_at from sessions where id = $1 limit 1", value: tokenOrId } : { sql: "select id, user_id, token_hash, scopes, created_at, last_used_at, expires_at, revoked_at from sessions where token_hash = $1 limit 1", value: digest };
      const result = await this.database.pool.query<{ id: string; user_id: string; token_hash: string; scopes: string[]; created_at: Date; last_used_at: Date | null; expires_at: Date; revoked_at: Date | null }>(lookup.sql, [lookup.value]);
      const row = result.rows[0];
      if (row) { record = { id: row.id, user_id: row.user_id, hash: row.token_hash, scopes: this.scopes(row.scopes), created_at: row.created_at.toISOString(), last_used_at: row.last_used_at?.toISOString() ?? null, expires_at: row.expires_at.toISOString(), revoked_at: row.revoked_at?.toISOString() ?? null }; this.#records.set(record.id, record); }
    }
    if (!record || record.revoked_at) return false;
    record.revoked_at = new Date().toISOString();
    await this.persist();
    return true;
  }

  private scopes(value: unknown): ApiCapability[] { const scopes = Array.isArray(value) ? value.filter((item): item is ApiCapability => item === "run" || item === "manage") : []; return scopes.length ? [...new Set(scopes)] : ["run"]; }
  private public(record: SessionRecord): PublicSession { return { id: record.id, scopes: this.scopes(record.scopes), created_at: record.created_at, last_used_at: record.last_used_at, expires_at: record.expires_at }; }
  private expire(): void { const now = Date.now(); for (const record of this.#records.values()) if (Date.parse(record.expires_at) <= now && !record.revoked_at) record.revoked_at = new Date().toISOString(); }
  private async loadFile(): Promise<void> { try { const records = JSON.parse(await readFile(this.file, "utf8")) as SessionRecord[]; for (const record of records) this.#records.set(record.id, record); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  private async persist(): Promise<void> { this.#persistence = this.#persistence.catch(() => undefined).then(async () => { if (this.database?.pool) await this.persistDatabase(); const temp = `${this.file}.${randomBytes(8).toString("hex")}.tmp`; await writeFile(temp, `${JSON.stringify([...this.#records.values()], null, 2)}\n`, "utf8"); await rename(temp, this.file); }); return this.#persistence; }
  private async persistDatabase(): Promise<void> { const pool = this.database?.pool; if (!pool) return; const client = await pool.connect(); try { await client.query("begin"); for (const record of this.#records.values()) await client.query("insert into sessions (id, user_id, token_hash, scopes, created_at, last_used_at, expires_at, revoked_at) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do update set user_id = excluded.user_id, token_hash = excluded.token_hash, scopes = excluded.scopes, last_used_at = excluded.last_used_at, expires_at = excluded.expires_at, revoked_at = excluded.revoked_at", [record.id, record.user_id ?? SYSTEM_USER_ID, record.hash, this.scopes(record.scopes), record.created_at, record.last_used_at, record.expires_at, record.revoked_at]); await client.query("commit"); } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); } }
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillArtifact } from "./types.js";

export interface DatabaseRuntime { readonly status: "disabled" | "ready"; readonly pool: Pool | null; close(): Promise<void>; }
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function initializeDatabase(connectionString: string | null): Promise<DatabaseRuntime> {
  if (!connectionString) return { status: "disabled", pool: null, close: async () => {} };
  const pool = new Pool({ connectionString, max: 4, ssl: { rejectUnauthorized: true } });
  await pool.query("select 1");
  const migration = await readFile(path.resolve("migrations/001_initial.sql"), "utf8");
  await pool.query(migration);
  await pool.query("insert into users (id, email, display_name, role) values ($1, 'thru-local@system', 'THRU local team', 'operator') on conflict (id) do nothing", [SYSTEM_USER_ID]);
  return { status: "ready", pool, close: async () => { await pool.end(); } };
}

/** Mirrors immutable skill versions so durable run records can retain a database foreign key. */
export async function syncSkillCatalog(database: DatabaseRuntime, skills: readonly SkillArtifact[], ownerId?: string | null, state?: string): Promise<void> {
  if (!database.pool) return;
  const client = await database.pool.connect();
  try {
    await client.query("begin");
    for (const artifact of skills) {
      await client.query(
        "insert into skills (id, owner_id, visibility, state) values ($1, $2, 'public', coalesce($3, 'published')) on conflict (id) do update set owner_id = coalesce(skills.owner_id, excluded.owner_id), state = coalesce($3, skills.state)",
        [artifact.skill.id, ownerId ?? null, state ?? null],
      );
      await client.query(
        "insert into skill_versions (skill_id, version, artifact) values ($1, $2, $3::jsonb) on conflict (skill_id, version) do nothing",
        [artifact.skill.id, artifact.skill.version, JSON.stringify(artifact)],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

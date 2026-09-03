import { copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { validateArtifact } from "./skill-validation.js";
import type { SkillArtifact } from "./types.js";
import { enforceSensitivity } from "./execution-policy.js";
import type { DatabaseRuntime } from "./database.js";
import { syncSkillCatalog } from "./database.js";

export class SkillRegistry extends EventEmitter {
  readonly #directory: string;
  readonly #invalidDirectory: string;
  readonly #skills = new Map<string, SkillArtifact>();

  constructor(directory: string, private readonly database?: DatabaseRuntime) {
    super();
    this.#directory = directory;
    this.#invalidDirectory = path.join(directory, "_invalid");
  }

  async load(): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    await mkdir(this.#invalidDirectory, { recursive: true });
    this.#skills.clear();
    const entries = await readdir(this.#directory);
    for (const temp of entries.filter((name) => name.endsWith(".tmp"))) await rename(path.join(this.#directory, temp), path.join(this.#invalidDirectory, `${Date.now()}-${temp}`));
    const files = entries.filter((name) => name.endsWith(".skill.json"));
    for (const file of files) {
      const source = path.join(this.#directory, file);
      try {
        const safe = await this.#readValid(source);
        if (this.#skills.has(safe.skill.id)) { await this.#quarantine(source, `duplicate-${file}`); continue; }
        this.#skills.set(safe.skill.id, safe);
      } catch {
        const backup = `${source}.bak`;
        try {
          const restored = await this.#readValid(backup); if (this.#skills.has(restored.skill.id)) throw new Error("duplicate backup id"); await copyFile(backup, source); this.#skills.set(restored.skill.id, restored);
        } catch { await this.#quarantine(source, file); }
      }
    }
    if (this.database?.pool) {
      const rows = await this.database.pool.query<{ artifact: SkillArtifact }>("select distinct on (skill_id) artifact from skill_versions order by skill_id, version desc");
      for (const row of rows.rows) if (!this.#skills.has(row.artifact.skill.id)) this.#skills.set(row.artifact.skill.id, enforceSensitivity(row.artifact));
    }
  }

  list(): SkillArtifact[] {
    return [...this.#skills.values()].sort((a, b) => a.skill.name.localeCompare(b.skill.name));
  }

  get(id: string): SkillArtifact | undefined {
    return this.#skills.get(id);
  }

  async save(skill: SkillArtifact): Promise<void> {
    return this.saveWithOptions(skill);
  }

  private async saveWithOptions(skill: SkillArtifact, options: { ownerId?: string | null; state?: string } = {}): Promise<void> {
    const validation = validateArtifact(skill);
    if (!validation.ok) throw new Error(validation.errors.join("; "));
    const target = path.join(this.#directory, `${skill.skill.id}.skill.json`);
    const backup = `${target}.bak`;
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await copyFile(target, backup);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await writeFile(temp, `${JSON.stringify(skill, null, 2)}\n`, "utf8");
      const verified = validateArtifact(JSON.parse(await readFile(temp, "utf8"))); if (!verified.ok) throw new Error(`temp verification failed: ${verified.errors.join("; ")}`);
      await rename(temp, target);
    } catch (error) { await unlink(temp).catch(() => undefined); throw error; }
    this.#skills.set(skill.skill.id, skill);
    this.emit("change", skill.skill.id);
    await syncSkillCatalog(this.database ?? { status: "disabled", pool: null, close: async () => {} }, [skill], options.ownerId, options.state);
  }

  async import(raw: unknown, options: { ownerId?: string | null; state?: string } = {}): Promise<SkillArtifact> {
    const validation = validateArtifact(raw);
    if (!validation.ok) throw new Error(validation.errors.join("; "));
    let id = validation.skill.skill.id;
    let suffix = 2;
    while (this.#skills.has(id)) id = `${validation.skill.skill.id}-${suffix++}`;
    const safe = enforceSensitivity({
      ...validation.skill,
      skill: { ...validation.skill.skill, id },
    });
    await this.saveWithOptions(safe, { ...options, state: options.state ?? "published" });
    return safe;
  }

  async versions(id: string): Promise<Array<{ version: number; created_at: string }>> {
    if (!this.database?.pool) { const current = this.#skills.get(id); return current ? [{ version: current.skill.version, created_at: current.skill.forged_at }] : []; }
    const rows = await this.database.pool.query<{ version: number; created_at: Date }>("select version, created_at from skill_versions where skill_id = $1 order by version desc", [id]);
    return rows.rows.map((row) => ({ version: row.version, created_at: row.created_at.toISOString() }));
  }

  async state(id: string): Promise<"published" | "deprecated" | "quarantined"> {
    if (!this.database?.pool) return this.#skills.has(id) ? "published" : "quarantined";
    const rows = await this.database.pool.query<{ state: "published" | "deprecated" | "quarantined" }>("select state from skills where id = $1", [id]);
    return rows.rows[0]?.state ?? "quarantined";
  }

  async rollback(id: string, targetVersion: number, ownerId?: string | null): Promise<SkillArtifact> {
    const current = this.#skills.get(id);
    if (!current) throw new Error("Skill not found.");
    if (!Number.isInteger(targetVersion) || targetVersion < 1) throw new Error("A valid target version is required.");
    if (this.database?.pool) {
      const owner = await this.database.pool.query<{ owner_id: string | null }>("select owner_id from skills where id = $1", [id]);
      const ownerIdFromDb = owner.rows[0]?.owner_id ?? null;
      if (ownerId !== undefined && ownerIdFromDb && ownerIdFromDb !== ownerId) throw new Error("Skill belongs to another user.");
      const target = await this.database.pool.query<{ artifact: SkillArtifact }>("select artifact from skill_versions where skill_id = $1 and version = $2", [id, targetVersion]);
      if (!target.rows[0]) throw new Error("Target skill version not found.");
      const source = target.rows[0].artifact;
      const previousStep = current.workflow.steps[0];
      const restored: SkillArtifact = { ...source, skill: { ...source.skill, id, version: current.skill.version + 1, forged_at: new Date().toISOString() }, history: [...current.history, ...(previousStep ? [{ version: current.skill.version, changed_step: "workflow", reason: `rollback:${targetVersion}`, at: new Date().toISOString(), previous_step: previousStep }] : [])] };
      await this.saveWithOptions(restored, { ownerId: ownerId ?? ownerIdFromDb, state: "published" });
      return restored;
    }
    if (targetVersion !== current.skill.version) throw new Error("Historical versions require PostgreSQL persistence.");
    return current;
  }

  async setState(id: string, state: "published" | "deprecated" | "quarantined", ownerId?: string | null): Promise<void> {
    if (!this.#skills.has(id)) throw new Error("Skill not found.");
    if (!this.database?.pool) throw new Error("Skill lifecycle state requires PostgreSQL persistence.");
    const result = await this.database.pool.query("update skills set state = $2 where id = $1 and ($3::uuid is null or owner_id = $3::uuid)", [id, state, ownerId ?? null]);
    if (!result.rowCount) throw new Error("Skill belongs to another user or is not persisted.");
  }

  async #readValid(file: string): Promise<SkillArtifact> { const parsed: unknown = JSON.parse(await readFile(file, "utf8")); const validation = validateArtifact(parsed); if (!validation.ok) throw new Error(validation.errors.join("; ")); return enforceSensitivity(validation.skill); }
  async #quarantine(source: string, name: string): Promise<void> { await rename(source, path.join(this.#invalidDirectory, `${Date.now()}-${randomUUID()}-${name}`)); }
}

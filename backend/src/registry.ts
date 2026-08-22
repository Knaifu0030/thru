import { copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { validateArtifact } from "./skill-validation.js";
import type { SkillArtifact } from "./types.js";

export class SkillRegistry extends EventEmitter {
  readonly #directory: string;
  readonly #invalidDirectory: string;
  readonly #skills = new Map<string, SkillArtifact>();

  constructor(directory: string) {
    super();
    this.#directory = directory;
    this.#invalidDirectory = path.join(directory, "_invalid");
  }

  async load(): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    await mkdir(this.#invalidDirectory, { recursive: true });
    this.#skills.clear();
    const files = (await readdir(this.#directory)).filter((name) => name.endsWith(".skill.json"));
    for (const file of files) {
      const source = path.join(this.#directory, file);
      try {
        const parsed: unknown = JSON.parse(await readFile(source, "utf8"));
        const validation = validateArtifact(parsed);
        if (!validation.ok) throw new Error(validation.errors.join("; "));
        if (this.#skills.has(validation.skill.skill.id)) throw new Error("duplicate skill id");
        const safe = enforceSensitivity(validation.skill);
        this.#skills.set(safe.skill.id, safe);
      } catch {
        const backup = `${source}.bak`;
        try {
          const restored: unknown = JSON.parse(await readFile(backup, "utf8")); const valid = validateArtifact(restored); if (!valid.ok) throw new Error("invalid backup"); await copyFile(backup, source); this.#skills.set(valid.skill.skill.id, enforceSensitivity(valid.skill));
        } catch { await rename(source, path.join(this.#invalidDirectory, `${Date.now()}-${file}`)); }
      }
    }
  }

  list(): SkillArtifact[] {
    return [...this.#skills.values()].sort((a, b) => a.skill.name.localeCompare(b.skill.name));
  }

  get(id: string): SkillArtifact | undefined {
    return this.#skills.get(id);
  }

  async save(skill: SkillArtifact): Promise<void> {
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
  }

  async import(raw: unknown): Promise<SkillArtifact> {
    const validation = validateArtifact(raw);
    if (!validation.ok) throw new Error(validation.errors.join("; "));
    let id = validation.skill.skill.id;
    let suffix = 2;
    while (this.#skills.has(id)) id = `${validation.skill.skill.id}-${suffix++}`;
    const safe = enforceSensitivity({
      ...validation.skill,
      skill: { ...validation.skill.skill, id },
    });
    await this.save(safe);
    return safe;
  }
}

function enforceSensitivity(skill: SkillArtifact): SkillArtifact {
  const markers = /(password|login|otp|captcha|payment|pay|delete|send|submit)/i;
  const steps = skill.workflow.steps.map((step) => ({
    ...step,
    sensitive: step.sensitive || markers.test(`${step.action} ${step.target_description}`),
  }));
  return {
    ...skill,
    skill: { ...skill.skill, sensitive: steps.some((step) => step.sensitive) },
    workflow: { ...skill.workflow, steps },
  };
}

import { randomUUID } from "node:crypto";
import type { SkillExecutor } from "./executor.js";
import type { RunEnvelope, RunExecutionContext } from "./types.js";

export type RunState = "queued" | "running" | "completed" | "failed";
export interface ManagedRun { readonly id: string; readonly skill: string; state: RunState; position: number; readonly created_at: string; started_at: string | null; completed_at: string | null; result: RunEnvelope | null; error: string | null }
interface Pending { record: ManagedRun; inputs: unknown; context: RunExecutionContext; resolve: (run: ManagedRun) => void }

export class RunManager {
  readonly #runs = new Map<string, ManagedRun>(); readonly #queue: Pending[] = []; #active = false;
  constructor(private readonly executor: SkillExecutor) {}
  submit(skill: string, inputs: unknown, context: RunExecutionContext): { run: ManagedRun; completion: Promise<ManagedRun> } {
    const record: ManagedRun = { id: randomUUID(), skill, state: "queued", position: this.#queue.length + (this.#active ? 1 : 0), created_at: new Date().toISOString(), started_at: null, completed_at: null, result: null, error: null };
    this.#runs.set(record.id, record); let resolve!: (run: ManagedRun) => void; const completion = new Promise<ManagedRun>((done) => { resolve = done; }); this.#queue.push({ record, inputs, context, resolve }); void this.#drain(); return { run: record, completion };
  }
  get(id: string): ManagedRun | undefined { return this.#runs.get(id); }
  async #drain(): Promise<void> { if (this.#active) return; this.#active = true; try { while (this.#queue.length) { const pending = this.#queue.shift()!; this.#reposition(); pending.record.state = "running"; pending.record.position = 0; pending.record.started_at = new Date().toISOString(); try { const result = await this.executor.runSkill(pending.record.skill, pending.inputs, pending.context); if (!result) throw new Error("Skill not found."); pending.record.result = result; pending.record.state = "completed"; } catch (error) { pending.record.state = "failed"; pending.record.error = error instanceof Error ? error.message : "Run failed."; } pending.record.completed_at = new Date().toISOString(); pending.resolve(pending.record); } } finally { this.#active = false; } }
  #reposition(): void { this.#queue.forEach((item, index) => { item.record.position = index + 1; }); }
}

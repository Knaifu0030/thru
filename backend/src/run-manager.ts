import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import type { DatabaseRuntime } from "./database.js";
import type { SkillExecutor } from "./executor.js";
import type { RunEnvelope, RunExecutionContext } from "./types.js";

export type RunState = "queued" | "running" | "completed" | "failed" | "cancelled";
export interface RunEvent { type: "queued" | "started" | "retry" | "completed" | "failed" | "cancelled" | "gate" | "gate_approved" | "gate_denied"; at: string; message?: string }
export interface ManagedRun { readonly id: string; readonly skill: string; readonly idempotency_key?: string; readonly user_id?: string | null; state: RunState; position: number; readonly created_at: string; started_at: string | null; completed_at: string | null; result: RunEnvelope | null; error: string | null; attempts?: number; events: RunEvent[] }
interface Pending { record: ManagedRun; inputs: unknown; context: RunExecutionContext; resolve: (run: ManagedRun) => void }
export class RunQueueFullError extends Error { constructor(readonly limit: number) { super(`The execution queue is full (${limit} pending runs). Retry after capacity is available.`); this.name = "RunQueueFullError"; } }

export class RunManager {
  readonly #runs = new Map<string, ManagedRun>(); readonly #queue: Pending[] = []; #active = false;
  readonly #inputs = new Map<string, unknown>();
  readonly #cancelRequested = new Set<string>();
  readonly #workerId = `${process.pid}-${randomUUID()}`;
  #leaseHeld = false;
  #workerClient: PoolClient | null = null;
  #retryTimer: NodeJS.Timeout | null = null;
  #heartbeatTimer: NodeJS.Timeout | null = null;
  #queuePollTimer: NodeJS.Timeout | null = null;
  #persistence: Promise<void> = Promise.resolve();
  #storagePath: string | null;
  constructor(private readonly executor: SkillExecutor, storagePath?: string, private readonly retentionDays = 30, private readonly database?: DatabaseRuntime, private readonly queueMaxDepth = 100) { this.#storagePath = storagePath ?? null; }
  async ready(): Promise<void> {
    if (this.database?.pool) { await this.#loadDatabase(); this.#startQueuePoller(); return; }
    if (!this.#storagePath) return;
    await mkdir(path.dirname(this.#storagePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.#storagePath, "utf8")) as ManagedRun[];
      for (const run of parsed) if (run.state === "queued" || run.state === "running") { run.state = "failed"; run.error = "Recovered after worker restart."; run.completed_at = new Date().toISOString(); }
      const cutoff = Date.now() - this.retentionDays * 86_400_000;
      for (const run of parsed) { run.events ??= []; if (run.completed_at && Date.parse(run.completed_at) < cutoff && run.state !== "queued" && run.state !== "running") continue; this.#runs.set(run.id, run); }
      await this.#persist();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  submit(skill: string, inputs: unknown, context: RunExecutionContext, idempotencyKey?: string, userId?: string | null): { run: ManagedRun; completion: Promise<ManagedRun> } {
    const existing = idempotencyKey && [...this.#runs.values()].find((run) => run.skill === skill && run.idempotency_key === idempotencyKey && (run.user_id ?? null) === (userId ?? null));
    if (existing) return { run: existing, completion: Promise.resolve(existing) };
    if (this.#queue.length >= this.queueMaxDepth) throw new RunQueueFullError(this.queueMaxDepth);
    const record: ManagedRun = { id: randomUUID(), skill, ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}), ...(userId ? { user_id: userId } : {}), state: "queued", position: this.#queue.length + (this.#active ? 1 : 0), created_at: new Date().toISOString(), started_at: null, completed_at: null, result: null, error: null, attempts: 0, events: [{ type: "queued", at: new Date().toISOString() }] };
    this.#runs.set(record.id, record); this.#inputs.set(record.id, inputs); void this.#persist(); let resolve!: (run: ManagedRun) => void; const completion = new Promise<ManagedRun>((done) => { resolve = done; }); this.#queue.push({ record, inputs, context, resolve }); void this.#drain(); return { run: record, completion };
  }
  get(id: string): ManagedRun | undefined { return this.#runs.get(id); }
  async appendEvent(id: string, event: RunEvent): Promise<ManagedRun | undefined> { const run = this.#runs.get(id); if (!run) return undefined; run.events.push(event); await this.#persist(); return run; }
  async cancel(id: string): Promise<ManagedRun | undefined> {
    const run = this.#runs.get(id); if (!run || (run.state !== "queued" && run.state !== "running")) return run;
    if (run.state === "queued") { const index = this.#queue.findIndex((item) => item.record.id === id); if (index >= 0) { const [pending] = this.#queue.splice(index, 1); run.state = "cancelled"; run.error = "Cancelled by request."; run.completed_at = new Date().toISOString(); run.events.push({ type: "cancelled", at: run.completed_at, message: run.error }); pending?.resolve(run); this.#reposition(); await this.#persist(); } }
    else { this.#cancelRequested.add(id); run.error = "Cancellation requested; the active browser step will finish safely."; run.events.push({ type: "cancelled", at: new Date().toISOString(), message: run.error }); await this.#persist(); }
    return run;
  }
  /** Re-queues a gated run after the API has recorded an immutable approval. */
  async resume(id: string, approvalId: string): Promise<ManagedRun> {
    const run = this.#runs.get(id);
    if (!run) throw new Error("Run not found.");
    if (run.result?.status !== "needs_human" || run.state !== "completed") throw new Error("Run is not waiting for approval.");
    if (this.#queue.some((pending) => pending.record.id === id)) return run;
    run.state = "queued";
    run.position = this.#queue.length + (this.#active ? 1 : 0);
    run.started_at = null;
    run.completed_at = null;
    run.result = null;
    run.error = null;
    run.events.push({ type: "queued", at: new Date().toISOString(), message: "Approved gate queued for secure resume." });
    this.#queue.push({ record: run, inputs: this.#inputs.get(id), context: { surface: "local_human", timeBudgetMs: 55_000, approval: { runId: id, approvalId } }, resolve: () => undefined });
    await this.#persist();
    void this.#drain();
    return run;
  }
  list(limit = 200, userId?: string | null): ManagedRun[] { return [...this.#runs.values()].filter((run) => userId === undefined || (run.user_id ?? null) === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, Math.max(1, Math.min(limit, 1000))); }
  metrics(): { queue_depth: number; active: boolean; limit: number; oldest_queued_at: string | null; retry_count: number; gate_count: number; healing_count: number } {
    const queued = [...this.#runs.values()].filter((run) => run.state === "queued");
    return { queue_depth: queued.length, active: this.#active, limit: this.queueMaxDepth, oldest_queued_at: queued.sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.created_at ?? null, retry_count: [...this.#runs.values()].reduce((sum, run) => sum + (run.events.filter((event) => event.type === "retry").length), 0), gate_count: [...this.#runs.values()].reduce((sum, run) => sum + (run.events.filter((event) => event.type === "gate").length), 0), healing_count: [...this.#runs.values()].reduce((sum, run) => sum + (run.result?.healing.length ?? 0), 0) };
  }
  async #drain(): Promise<void> {
    if (this.#active) return;
    this.#active = true;
    let acquired = false;
    try { acquired = await this.#acquireWorkerLease(); } catch (error) { this.#active = false; throw error; }
    if (!acquired) {
      this.#active = false;
      if (!this.#retryTimer) {
        this.#retryTimer = setTimeout(() => { this.#retryTimer = null; void this.#drain(); }, 1_000);
        this.#retryTimer.unref?.();
      }
      return;
    }
    try {
      while (this.#queue.length) {
        const pending = this.#queue.shift()!;
        this.#reposition();
        await this.#persistence;
        if (!(await this.#claimRun(pending.record.id))) { pending.resolve(pending.record); continue; }
        pending.record.state = "running";
        pending.record.events.push({ type: "started", at: new Date().toISOString() });
        pending.record.position = 0;
        pending.record.started_at = new Date().toISOString();
        this.#startHeartbeat(pending.record.id);
        await this.#persist();
        try {
          let result: RunEnvelope | undefined;
          const maxAttempts = 2;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            pending.record.attempts = attempt;
            result = await this.executor.runSkill(pending.record.skill, pending.inputs, pending.context);
            if (!result) throw new Error("Skill not found.");
            if (result.status !== "portal_error" || attempt === maxAttempts) break;
            pending.record.events.push({ type: "retry", at: new Date().toISOString(), message: `Browser execution retry ${attempt + 1} of ${maxAttempts}.` });
            await this.#persist();
          }
          if (!result) throw new Error("Skill not found.");
          pending.record.result = result;
          if (result.status === "needs_human") pending.record.events.push({ type: "gate", at: new Date().toISOString(), message: result.needs_human?.reason ?? "Human approval is required before this workflow can continue." });
          if (this.#cancelRequested.delete(pending.record.id)) { pending.record.state = "cancelled"; pending.record.error = "Cancelled after the active browser step finished safely."; pending.record.events.push({ type: "cancelled", at: new Date().toISOString(), message: pending.record.error }); }
          else { pending.record.state = "completed"; pending.record.events.push({ type: "completed", at: new Date().toISOString() }); }
        } catch (error) {
          pending.record.state = this.#cancelRequested.delete(pending.record.id) ? "cancelled" : "failed";
          pending.record.error = error instanceof Error ? error.message : "Run failed.";
          pending.record.events.push({ type: pending.record.state, at: new Date().toISOString(), message: pending.record.error });
        }
        this.#stopHeartbeat();
        pending.record.completed_at = new Date().toISOString();
        await this.#persist();
        await this.#releaseRunLease(pending.record.id);
        pending.resolve(pending.record);
      }
    } finally {
      this.#stopHeartbeat();
      this.#active = false;
      await this.#releaseWorkerLease();
    }
  }
  async #acquireWorkerLease(): Promise<boolean> {
    if (!this.database?.pool) return true;
    const client = await this.database.pool.connect();
    try {
      const result = await client.query<{ locked: boolean }>("select pg_try_advisory_lock(hashtextextended($1, 0)) as locked", ["thru-browser-worker"]);
      if (result.rows?.[0]?.locked === false) { client.release(); return false; }
      this.#workerClient = client;
      this.#leaseHeld = true;
    } catch (error) { client.release(); throw error; }
    return true;
  }
  async #releaseWorkerLease(): Promise<void> {
    if (!this.#leaseHeld || !this.#workerClient) return;
    this.#leaseHeld = false;
    const client = this.#workerClient; this.#workerClient = null;
    await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", ["thru-browser-worker"]).catch(() => undefined);
    client.release();
  }
  async #claimRun(id: string): Promise<boolean> {
    if (!this.database?.pool) return true;
    const result = await this.database.pool.query("update runs set state = 'running', lease_owner = $2, lease_expires_at = now() + interval '2 minutes', heartbeat_at = now() where id = $1 and state = 'queued' returning id", [id, this.#workerId]);
    return result.rows?.length !== 0;
  }
  #startHeartbeat(id: string): void {
    this.#stopHeartbeat();
    if (!this.database?.pool) return;
    this.#heartbeatTimer = setInterval(() => { void this.database?.pool?.query("update runs set heartbeat_at = now(), lease_expires_at = now() + interval '2 minutes' where id = $1 and lease_owner = $2", [id, this.#workerId]).catch(() => undefined); }, 30_000);
    this.#heartbeatTimer.unref?.();
  }
  #stopHeartbeat(): void { if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer); this.#heartbeatTimer = null; }
  async #releaseRunLease(id: string): Promise<void> { if (this.database?.pool) await this.database.pool.query("update runs set lease_owner = null, lease_expires_at = null, heartbeat_at = null where id = $1 and lease_owner = $2", [id, this.#workerId]).catch(() => undefined); }
  #startQueuePoller(): void {
    if (!this.database?.pool || this.#queuePollTimer) return;
    this.#queuePollTimer = setInterval(() => { void this.#pollDatabaseQueue().catch(() => undefined); }, 5_000);
    this.#queuePollTimer.unref?.();
  }
  async #pollDatabaseQueue(): Promise<void> {
    const pool = this.database?.pool;
    if (!pool) return;
    // Requeue work whose owner stopped heartbeating. The claim in #drain is
    // atomic, so another replica can observe and execute it safely.
    await pool.query("update runs set state = 'queued', lease_owner = null, lease_expires_at = null, heartbeat_at = null where state = 'running' and lease_expires_at < now()");
    const rows = await pool.query<{ id: string; skill_id: string; idempotency_key: string | null; user_id: string | null; state: RunState; inputs: unknown; created_at: Date; started_at: Date | null; completed_at: Date | null; result: RunEnvelope | null; error: string | null; attempt_count: number }>("select id, skill_id, idempotency_key, user_id, state, inputs, created_at, started_at, completed_at, result, error, attempt_count from runs where state = 'queued' order by created_at limit 100");
    const candidates = rows.rows.filter((row) => !this.#queue.some((pending) => pending.record.id === row.id) && this.#runs.get(row.id)?.state !== "running");
    if (!candidates.length) return;
    const events = await pool.query<{ run_id: string; type: RunEvent["type"]; payload: { message?: string } | null; created_at: Date }>("select run_id, type, payload, created_at from run_events where run_id = any($1::uuid[]) order by created_at", [candidates.map((row) => row.id)]);
    const byRun = new Map<string, RunEvent[]>();
    for (const event of events.rows) { const list = byRun.get(event.run_id) ?? []; list.push({ type: event.type, at: event.created_at.toISOString(), ...(event.payload?.message ? { message: event.payload.message } : {}) }); byRun.set(event.run_id, list); }
    for (const row of candidates) {
      const existing = this.#runs.get(row.id);
      const record: ManagedRun = existing ?? { id: row.id, skill: row.skill_id, ...(row.idempotency_key ? { idempotency_key: row.idempotency_key } : {}), ...(row.user_id ? { user_id: row.user_id } : {}), state: "queued", position: 0, created_at: row.created_at.toISOString(), started_at: null, completed_at: null, result: null, error: null, attempts: row.attempt_count ?? 0, events: byRun.get(row.id) ?? [{ type: "queued", at: new Date().toISOString(), message: "Recovered by queue poller." }] };
      record.state = "queued"; record.position = this.#queue.length + (this.#active ? 1 : 0); record.started_at = null; record.completed_at = null; record.result = null; record.error = null;
      this.#runs.set(row.id, record); this.#inputs.set(row.id, row.inputs);
      this.#queue.push({ record, inputs: row.inputs, context: { surface: "rest", timeBudgetMs: 55_000 }, resolve: () => undefined });
    }
    void this.#drain();
  }
  #reposition(): void { this.#queue.forEach((item, index) => { item.record.position = index + 1; }); void this.#persist(); }
  async #loadDatabase(): Promise<void> {
    const pool = this.database?.pool;
    if (!pool) return;
    const cutoff = new Date(Date.now() - this.retentionDays * 86_400_000).toISOString();
    await pool.query("delete from runs where completed_at is not null and completed_at < $1", [cutoff]);
    await pool.query("update runs set state = 'queued', lease_owner = null, lease_expires_at = null, heartbeat_at = null where state = 'running' and (lease_expires_at is null or lease_expires_at < now())");
    const rows = await pool.query<{ id: string; skill_id: string; idempotency_key: string | null; user_id: string | null; state: RunState; inputs: unknown; created_at: Date; started_at: Date | null; completed_at: Date | null; result: RunEnvelope | null; error: string | null; attempt_count: number }>("select id, skill_id, idempotency_key, user_id, state, inputs, created_at, started_at, completed_at, result, error, attempt_count from runs where completed_at is null or completed_at >= $1 order by created_at", [cutoff]);
    const events = await pool.query<{ run_id: string; type: RunEvent["type"]; payload: { message?: string } | null; created_at: Date }>("select run_id, type, payload, created_at from run_events where run_id = any($1::uuid[]) order by created_at", [rows.rows.map((row) => row.id)]);
    const byRun = new Map<string, RunEvent[]>();
    for (const event of events.rows) { const list = byRun.get(event.run_id) ?? []; list.push({ type: event.type, at: event.created_at.toISOString(), ...(event.payload?.message ? { message: event.payload.message } : {}) }); byRun.set(event.run_id, list); }
    for (const row of rows.rows) {
      const recovering = row.state === "queued" || row.state === "running";
      const events = byRun.get(row.id) ?? [];
      if (recovering) events.push({ type: "queued", at: new Date().toISOString(), message: "Recovered after worker restart." });
      const record: ManagedRun = { id: row.id, skill: row.skill_id, ...(row.idempotency_key ? { idempotency_key: row.idempotency_key } : {}), ...(row.user_id ? { user_id: row.user_id } : {}), state: recovering ? "queued" : row.state, position: 0, created_at: row.created_at.toISOString(), started_at: recovering ? null : row.started_at?.toISOString() ?? null, completed_at: recovering ? null : row.completed_at?.toISOString() ?? null, result: row.result, error: recovering ? null : row.error, attempts: row.attempt_count ?? 0, events };
      this.#runs.set(row.id, record);
      this.#inputs.set(row.id, row.inputs);
      if (recovering) this.#queue.push({ record, inputs: row.inputs, context: { surface: "rest", timeBudgetMs: 55_000 }, resolve: () => {} });
    }
    if (this.#queue.length) void this.#drain();
  }
  async #persist(): Promise<void> {
    this.#persistence = this.#persistence.catch(() => undefined).then(async () => {
      if (this.database?.pool) { await this.#persistDatabase(); return; }
      if (!this.#storagePath) return;
      const temp = `${this.#storagePath}.${randomUUID()}.tmp`; await writeFile(temp, `${JSON.stringify([...this.#runs.values()])}\n`, "utf8"); await rename(temp, this.#storagePath);
    });
    return this.#persistence;
  }
  async #persistDatabase(): Promise<void> {
    const pool = this.database?.pool;
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const run of this.#runs.values()) {
        await client.query("insert into runs (id, skill_id, version, user_id, state, idempotency_key, inputs, result, error, attempt_count, created_at, started_at, completed_at) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13) on conflict (id) do update set version = excluded.version, user_id = excluded.user_id, state = excluded.state, inputs = excluded.inputs, result = excluded.result, error = excluded.error, attempt_count = excluded.attempt_count, started_at = excluded.started_at, completed_at = excluded.completed_at", [run.id, run.skill, run.result?.version ?? 1, run.user_id ?? null, run.state, run.idempotency_key ?? null, JSON.stringify(this.#inputs.get(run.id) ?? null), JSON.stringify(run.result), run.error, run.attempts ?? 0, run.created_at, run.started_at, run.completed_at]);
        await client.query("delete from run_events where run_id = $1", [run.id]);
        for (const event of run.events) await client.query("insert into run_events (run_id, type, payload, created_at) values ($1, $2, $3::jsonb, $4)", [run.id, event.type, JSON.stringify(event.message ? { message: event.message } : {}), event.at]);
        await client.query("delete from healing_attempts where run_id = $1", [run.id]);
        for (const healing of run.result?.healing ?? []) {
          const step = run.result?.steps?.find((candidate) => candidate.step === healing.step);
          await client.query("insert into healing_attempts (id, run_id, skill_id, from_version, to_version, evidence, outcome, created_at) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)", [randomUUID(), run.id, run.skill, Math.max(1, (run.result?.version ?? 1) - 1), run.result?.version ?? 1, JSON.stringify({ step: healing.step, rung: healing.rung, note: healing.note, selected_locator: step?.selected_locator ?? null, expectation_met: step?.expectation_met ?? null }), healing.rung, healing.at ?? new Date().toISOString()]);
        }
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }
}

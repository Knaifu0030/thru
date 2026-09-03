import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseRuntime } from "./database.js";
import { SYSTEM_USER_ID } from "./database.js";

export type ApprovalDecision = "approved" | "denied";

export interface ApprovalRecord {
  id: string;
  run_id: string;
  approver_id: string;
  decision: ApprovalDecision;
  note: string | null;
  created_at: string;
}

/** Durable, append-only approval audit trail. Approved records are consumed by
 * the server-side run manager for a bounded, auditable local-human resume. */
export class ApprovalStore {
  #records: ApprovalRecord[] = [];
  #persistence: Promise<void> = Promise.resolve();

  constructor(private readonly file: string, private readonly database?: DatabaseRuntime) {}

  async ready(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      const rows = JSON.parse(await readFile(this.file, "utf8")) as ApprovalRecord[];
      if (Array.isArray(rows)) this.#records = rows.filter((row) => row && typeof row.run_id === "string");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (this.database?.pool) {
      const result = await this.database.pool.query<{ id: string; run_id: string; approver_id: string; decision: ApprovalDecision; note: string | null; created_at: Date }>(
        "select id, run_id, approver_id, decision, note, created_at from approvals order by created_at",
      );
      this.#records = result.rows.map((row) => ({ id: row.id, run_id: row.run_id, approver_id: row.approver_id, decision: row.decision, note: row.note, created_at: row.created_at.toISOString() }));
    }
  }

  list(runId?: string): ApprovalRecord[] {
    return this.#records.filter((record) => !runId || record.run_id === runId).map((record) => ({ ...record }));
  }

  async record(runId: string, decision: ApprovalDecision, note?: string, approverId = SYSTEM_USER_ID): Promise<ApprovalRecord> {
    const record: ApprovalRecord = {
      id: randomUUID(),
      run_id: runId,
      approver_id: approverId,
      decision,
      note: note?.trim().slice(0, 500) || null,
      created_at: new Date().toISOString(),
    };
    this.#records.push(record);
    await this.#persist(record);
    return { ...record };
  }

  async #persist(record: ApprovalRecord): Promise<void> {
    this.#persistence = this.#persistence.catch(() => undefined).then(async () => {
      if (this.database?.pool) {
        await this.database.pool.query(
          "insert into approvals (id, run_id, approver_id, decision, note, created_at) values ($1, $2, $3, $4, $5, $6)",
          [record.id, record.run_id, record.approver_id, record.decision, record.note, record.created_at],
        );
      }
      const temp = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temp, `${JSON.stringify(this.#records, null, 2)}\n`, "utf8");
      await rename(temp, this.file);
    });
    return this.#persistence;
  }
}

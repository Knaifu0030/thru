import type { RunEnvelope, RunTelemetry } from "../types";

export const API_BASE = (import.meta.env.VITE_THRU_API_BASE || "https://forge-backend.mangosmoke-65ea4a06.centralindia.azurecontainerapps.io").replace(/\/$/, "");
const FIXTURE_MODE = import.meta.env.DEV && import.meta.env.VITE_THRU_FIXTURE_MODE === "true";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function health(signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/health`, { signal });
  if (!response.ok) throw new Error(`THRU health returned ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function runSkill(skillId: string, input: Record<string, unknown>, onTelemetry: (value: RunTelemetry) => void): Promise<RunEnvelope> {
  const startedAt = Date.now();
  const base: RunTelemetry = { runId: null, queueState: "requesting", skillId, input, envelope: null, error: null, startedAt };
  onTelemetry(base);
  if (FIXTURE_MODE) { const fixture = fixtureEnvelope(skillId); onTelemetry({ ...base, queueState: "completed", envelope: fixture }); return fixture; }
  try {
    const response = await fetch(`${API_BASE}/skills/${skillId}`, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "respond-async" }, body: JSON.stringify(input) });
    const body = await response.json() as RunEnvelope | { id: string; state: string; position?: number; result?: RunEnvelope };
    if (response.status !== 202) { if (!response.ok) throw new Error(errorMessage(body)); const envelope = body as RunEnvelope; onTelemetry({ ...base, queueState: "completed", envelope }); return envelope; }
    let run = body as { id: string; state: string; position?: number; result?: RunEnvelope };
    onTelemetry({ ...base, runId: run.id, queueState: run.state });
    for (let attempt = 0; attempt < 120; attempt++) {
      await wait(500);
      const poll = await fetch(`${API_BASE}/runs/${run.id}`);
      if (!poll.ok) throw new Error(`Run polling returned ${poll.status}`);
      run = await poll.json() as typeof run;
      onTelemetry({ ...base, runId: run.id, queueState: run.state, envelope: run.result ?? null });
      if (run.state === "completed" && run.result) return run.result;
      if (run.state === "failed") throw new Error(run.result ? errorMessage(run.result) : "THRU run failed");
    }
    throw new Error("THRU run timed out after 60 seconds");
  } catch (error) {
    const message = error instanceof Error ? error.message : "THRU request failed";
    onTelemetry({ ...base, queueState: "failed", error: message });
    throw error;
  }
}

function errorMessage(value: unknown): string {
  if (value && typeof value === "object" && "error" in value) { const error = (value as { error?: { message?: string } }).error; return error?.message ?? "THRU request failed"; }
  if (value && typeof value === "object" && "status" in value) return `THRU returned ${(value as { status: string }).status}`;
  return "THRU request failed";
}

function fixtureEnvelope(skillId: string): RunEnvelope {
  const status = skillId.includes("check-status") ? { reference: "INC-KA-48291", status: "certificate_issued", certificate_number: "INC-KA-2026-48291", issued_on: "2026-08-22" } : { reference: "INC-KA-48291", status: "ready_for_submission", prepared_at: "2026-08-22T10:30:00+05:30", next_action: "Review the prepared details and simulate submission in NammaDocs." };
  return { skill: skillId, version: 1, status: "success", data: status, healing: [], needs_human: null, timing_ms: 840, narration: ["Development fixture mode is explicitly enabled."], steps: [] };
}

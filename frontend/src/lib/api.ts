/**
 * The single data-access module. Every component in the app calls through
 * here — no inline fetches, no mock objects anywhere in the frontend.
 *
 * The gateway base URL comes from VITE_THRU_API_BASE and defaults to the
 * public THRU gateway. Local development requires an explicit override;
 * public builds never fall back to localhost.
 *
 * The implementations match backend/src/app.ts exactly:
 *  - error envelope { error: { code, message } }
 *  - POST /skills/{id} can return a RunEnvelope OR a queued ManagedRun
 *    (202 / 55s auto-degrade) — detected via "status" vs "state" in body,
 *    then polled at GET /runs/{id}
 *  - /teaching-sessions is a replay-gated proposal → publish flow behind a
 *    management-scoped API key
 *
 * Dashboard analytics and activity are derived from the gateway's persisted
 * run history until dedicated aggregation endpoints exist. Key management is
 * always performed by the gateway; no secret is generated in the browser.
 */

import type {
  ActivityEvent,
  ApiKey,
  DashboardSummary,
  THRUController,
  THRUHandlers,
  GatewayInfo,
  HealthInfo,
  ManagedRun,
  RunEnvelope,
  SeriesPoint,
  SkillArtifact,
  TeachingActionInput,
} from "./types";

const API_BASE =
  (import.meta.env.VITE_THRU_API_BASE ?? "")
    .trim()
    .replace(/\/+$/, "") ||
  "https://forge-backend.mangosmoke-65ea4a06.centralindia.azurecontainerapps.io";
const OPERATOR_TOKEN_STORAGE = "thru.operatorToken";

export const GATEWAY_BASE = API_BASE;

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function normalizeToken(value: string): string { return value.trim().replace(/^Bearer\s+/i, ""); }
function operatorToken(): string { return normalizeToken(sessionStorage.getItem(OPERATOR_TOKEN_STORAGE) ?? ""); }
function operatorHeaders(extra: HeadersInit = {}): HeadersInit { const token = operatorToken(); if (!token) throw new ApiError("auth_required", "Enter a management THRU API key in Settings before teaching or managing keys."); return { ...extra, Authorization: `Bearer ${token}` }; }

/* ── HTTP plumbing ────────────────────────────────────────────────────── */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError("network", "The public THRU gateway could not be reached. Please try again.");
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { code: string; message: string } })
    | null;
  if (body && typeof body === "object" && "error" in body && body.error) {
    throw new ApiError(body.error.code, body.error.message);
  }
  // Non-2xx bodies that are still contract shapes (invalid_input envelope,
  // failed ManagedRun) pass through; anything else is a hard error.
  if (!res.ok && !(body && typeof body === "object" && ("status" in body || "state" in body))) {
    throw new ApiError(`http_${res.status}`, `The gateway returned ${res.status}.`);
  }
  return body as T;
}

/* ── Core contract ────────────────────────────────────────────────────── */

async function health(): Promise<HealthInfo> {
  const h = await request<{ status: string; version: string; skills: number }>("/health");
  return { status: h.status, version: h.version, skills: h.skills };
}

async function getRegistry(): Promise<SkillArtifact[]> {
  const body = await request<{ skills: SkillArtifact[] }>("/registry");
  return body.skills;
}

async function getSkill(id: string): Promise<SkillArtifact | null> {
  const all = await getRegistry();
  return all.find((s) => s.skill.id === id) ?? null;
}

async function runSkill(
  id: string,
  inputs: Record<string, unknown>,
  onStatus?: (line: string) => void,
): Promise<RunEnvelope> {
  onStatus?.("Sent to the gateway…");
  const body = await request<RunEnvelope | ManagedRun>(`/skills/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });
  if ("status" in body) return body;

  // Queued: poll /runs/{id}. Cross-origin we can't read Location — use body.id.
  let run = body;
  while (run.state === "queued" || run.state === "running") {
    onStatus?.(
      run.state === "queued"
        ? run.position > 0
          ? `Queued — ${run.position} run${run.position === 1 ? "" : "s"} ahead of it…`
          : "Queued at the gateway…"
        : "A browser is working through the steps…",
    );
    await sleep(1200);
    run = await request<ManagedRun>(`/runs/${run.id}`);
  }
  if (run.state === "completed" && run.result) return run.result;
  return {
    skill: id,
    version: 0,
    status: "portal_error",
    data: null,
    healing: [],
    needs_human: null,
    timing_ms: 0,
    narration: run.error ? [run.error] : ["The run failed before producing a result."],
  };
}

function teachSkill(goal: string, url: string, sampleInputs: Record<string, unknown> | undefined, guidedActions: TeachingActionInput[] | undefined, h: THRUHandlers): THRUController {
  let cancelled = false;
  let proposalId: string | null = null;
  let questionResolve: ((choice: string) => void) | null = null;
  let editTail: Promise<void> = Promise.resolve();

  const run = async () => {
    if (!operatorToken()) {
      h.onError("Teaching needs a management THRU API key. Add one in Settings first.");
      return;
    }
    let proposal: { id: string; artifact: SkillArtifact; questions?: string[] };
    try {
      proposal = await request(`/teaching-sessions`, {
        method: "POST",
        headers: operatorHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ goal_text: goal, url, ...(sampleInputs ? { sample_inputs: sampleInputs } : {}) }),
      });
    } catch (e) {
      if (!cancelled) h.onError(e instanceof Error ? e.message : "THRU couldn't learn that workflow.");
      return;
    }
    if (cancelled) return;
    proposalId = proposal.id;

    // Keep the teaching browser isolated from execution browsers. The
    // capture endpoint records bounded DOM/screenshot evidence while actions
    // are performed; fill values are sent ephemerally and are never stored.
    try {
      await request(`/teaching-sessions/${proposalId}/capture`, {
        method: "POST",
        headers: operatorHeaders({ "Content-Type": "application/json" }),
      });
    } catch (e) {
      if (!cancelled) h.onError(e instanceof Error ? e.message : "The isolated teaching browser could not start.");
      return;
    }

    // The gateway returns narration in one piece; pace it out so the
    // stream reads at a human rhythm.
    for (const line of ["Opened a guided teaching session.", "Observed the starting page and created a review draft."]) {
      if (cancelled) return;
      h.onLine(line);
      await sleep(900);
    }

    for (const q of proposal.questions ?? []) {
      if (cancelled) return;
      h.onQuestion({ text: q, options: ["Sounds right", "Note it — refine later"] });
      await new Promise<string>((resolve) => {
        questionResolve = resolve;
      });
      if (cancelled) return;
      h.onLine("Noted.");
    }

    try {
      for (const action of guidedActions ?? []) {
        const runtimeValue = action.type === "fill" && action.value && sampleInputs?.[action.value] !== undefined ? String(sampleInputs[action.value]) : undefined;
        await request(`/teaching-sessions/${proposalId}/capture/actions`, { method: "POST", headers: operatorHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ ...action, ...(runtimeValue === undefined ? {} : { runtime_value: runtimeValue }) }) });
      }
      // The session store folds recorded actions into its draft artifact. Do
      // not overwrite that draft with the initial reconnaissance artifact.
      const reviewed = await request<{ artifact: SkillArtifact }>(`/teaching-sessions/${proposalId}/review`, { method: "POST", headers: operatorHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({}) });
      h.onDraft(reviewed.artifact);
      h.onQuestion({ text: "Review the generated workflow, then continue to replay validation.", options: ["Validate draft", "Discard draft"] });
      const reviewDecision = await new Promise<string>((resolve) => { questionResolve = resolve; });
      questionResolve = null;
      if (cancelled || reviewDecision !== "Validate draft") { await request(`/teaching-sessions/${proposalId}`, { method: "DELETE", headers: operatorHeaders() }).catch(() => undefined); if (!cancelled) h.onError("Draft discarded; nothing was published."); return; }
      await editTail;
      await request(`/teaching-sessions/${proposalId}/capture`, { method: "DELETE", headers: operatorHeaders() }).catch(() => undefined);
      const sensitiveDraft = Boolean(reviewed.artifact.skill.sensitive || reviewed.artifact.workflow.steps.some((step) => step.sensitive));
      await request(`/teaching-sessions/${proposalId}/validate`, { method: "POST", headers: operatorHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ approve_sensitive: sensitiveDraft }) });
      if (cancelled) return;
      h.onQuestion({ text: "Replay passed. Publish this workflow to the THRU catalog?", options: ["Publish", "Keep as draft"] });
      const decision = await new Promise<string>((resolve) => { questionResolve = resolve; });
      questionResolve = null;
      if (cancelled || decision !== "Publish") { await request(`/teaching-sessions/${proposalId}`, { method: "DELETE", headers: operatorHeaders() }).catch(() => undefined); if (!cancelled) h.onError("Draft kept private; nothing was published."); return; }
      const confirmed = await request<{ status: string; skill: SkillArtifact }>(
        `/teaching-sessions/${proposalId}/publish`,
        {
          method: "POST",
          headers: operatorHeaders({ "Content-Type": "application/json" }),
        },
      );
      if (!cancelled) h.onDone(confirmed.skill);
    } catch (e) {
      if (!cancelled) h.onError(e instanceof Error ? e.message : "Saving the learned workflow failed.");
    }
  };

  void run();

  return {
    answer(choice: string) {
      questionResolve?.(choice);
      questionResolve = null;
    },
    editDraft(artifact: SkillArtifact) {
      if (!proposalId || cancelled) return;
      editTail = editTail.then(async () => { await request(`/teaching-sessions/${proposalId}/review`, { method: "POST", headers: operatorHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ artifact }) }); }).catch((error) => { if (!cancelled) h.onError(error instanceof Error ? error.message : "Saving the draft review failed."); });
    },
    cancel() {
      cancelled = true;
      questionResolve?.("__cancelled__");
      if (proposalId) {
        void request(`/teaching-sessions/${proposalId}`, {
          method: "DELETE",
          headers: operatorHeaders(),
        }).catch(() => undefined);
      }
    },
  };
}

/* ── Derived views (no analytics endpoints on the gateway yet) ────────── */

const WEEK_MS = 7 * 24 * 3600_000;

async function getDashboardSummary(): Promise<DashboardSummary> {
  const skills = await getRegistry();
  let durableRuns: ManagedRun[] = [];
  try { durableRuns = (await request<{ runs: ManagedRun[] }>("/runs?limit=1000")).runs; } catch { /* older gateway */ }
  const totalRuns = durableRuns.length;
  const healEventsThisWeek = durableRuns.reduce((n, run) => n + (run.result?.healing?.length ?? 0), 0) + skills.reduce(
    (n, s) =>
      n +
      s.history.filter(
        (e) => e.reason.startsWith("heal:") && Date.now() - new Date(e.at).getTime() < WEEK_MS,
      ).length,
    0,
  );
  const now = Date.now();
  const thisWeek = durableRuns.filter((run) => now - new Date(run.created_at).getTime() < WEEK_MS).length;
  const previousWeek = durableRuns.filter((run) => { const age = now - new Date(run.created_at).getTime(); return age >= WEEK_MS && age < WEEK_MS * 2; }).length;
  const recent = [...skills]
    .filter((s) => s.vitals.last_run)
    .sort((a, b) => new Date(b.vitals.last_run!).getTime() - new Date(a.vitals.last_run!).getTime())
    .slice(0, 4)
    .map((s) => s.skill.id);

  const dayLabel = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toLocaleDateString("en-GB", { weekday: "short" });
  const dateLabel = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  const monthLabel = (back: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - back);
    return d.toLocaleDateString("en-GB", { month: "short" });
  };
  const hourLabel = (back: number) =>
    new Date(Date.now() - back * 3_600_000).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const actualSeries = (hours: number, bucketMs = 3_600_000): SeriesPoint[] => {
    return Array.from({ length: hours }, (_, index) => {
      const start = now - (hours - index) * bucketMs;
      const end = start + bucketMs;
      return { label: new Date(start).toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false }), runs: durableRuns.filter((run) => { const at = new Date(run.created_at).getTime(); return at >= start && at < end; }).length };
    });
  };
  return {
    totalRuns,
    trendPct: previousWeek ? Math.round(((thisWeek - previousWeek) / previousWeek) * 100) : null,
    totalSkills: skills.length,
    healEventsThisWeek,
    timeSavedHrs: null,
    estimatedSeries: false,
    series: {
      "1D": actualSeries(24),
      "1W": actualSeries(7, 86_400_000),
      "1M": actualSeries(30, 86_400_000),
      "6M": actualSeries(26, 7 * 86_400_000),
      "1Y": actualSeries(12, 30 * 86_400_000),
    },
    recentSkillIds: recent,
  };
}

async function getActivityLog(): Promise<ActivityEvent[]> {
  try {
    const body = await request<{ events: Array<{ run_id: string; skill: string; type: string; at: string; message?: string; step?: string; rung?: string }> }>("/events?limit=500");
    if (body.events.some((event) => event.type.startsWith("teaching_") || event.type === "gate")) { const decided = new Set(body.events.filter((event) => event.type === "gate_approved" || event.type === "gate_denied").map((event) => event.run_id)); return body.events.map((event): ActivityEvent => ({ id: `${event.run_id}-${event.type}-${event.at}`, at: event.at, kind: event.type.startsWith("teaching_") ? "teaching" : event.type === "healing" ? "heal" : event.type === "gate" || event.type === "failed" || event.type === "gate_approved" || event.type === "gate_denied" ? "gate" : "run", skillId: event.skill, skillName: event.skill, runId: event.run_id, gatePending: event.type === "gate" && !decided.has(event.run_id), summary: event.message ?? `${event.type} event` })); }
    if (body.events.length) return body.events.map((event): ActivityEvent => ({ id: `${event.run_id}-${event.type}-${event.at}`, at: event.at, kind: event.type === "healing" ? "heal" : event.type === "failed" || event.type === "gate_approved" || event.type === "gate_denied" ? "gate" : "run", skillId: event.skill, skillName: event.skill, runId: event.run_id, gatePending: event.type === "gate", summary: event.type === "healing" ? `Healing ${event.rung ?? "repair"} on ${event.step ?? "a workflow step"} — ${event.run_id.slice(0, 8)}${event.message ? `: ${event.message}` : ""}.` : `${event.type} run — ${event.run_id.slice(0, 8)}${event.message ? `: ${event.message}` : ""}.` }));
    const runsBody = await request<{ runs: ManagedRun[] }>("/runs?limit=200");
    const runEvents = runsBody.runs.map((run): ActivityEvent => ({
      id: `${run.id}-run`,
      at: run.completed_at ?? run.created_at,
      kind: run.result?.status === "needs_human" ? "gate" : run.result?.healing?.length ? "heal" : "run",
      skillId: run.skill,
      skillName: run.skill,
      runId: run.id,
      gatePending: run.result?.status === "needs_human",
      summary: run.state === "completed"
        ? `Run ${run.result?.status ?? "completed"} — ${run.id.slice(0, 8)}.`
        : `Run ${run.state} — ${run.id.slice(0, 8)}${run.error ? `: ${run.error}` : ""}.`,
    }));
    if (runEvents.length) return runEvents;
  } catch {
    // Fall back to registry history while older gateways are upgraded.
  }
  const skills = await getRegistry();
  const events: ActivityEvent[] = [];
  for (const s of skills) {
    for (const e of s.history) {
      const isGate = e.reason === "runtime:sensitivity-added";
      events.push({
        id: `${s.skill.id}-h${e.version}`,
        at: e.at,
        kind: isGate ? "gate" : "heal",
        skillId: s.skill.id,
        skillName: s.skill.name,
        summary: isGate
          ? `Step '${e.previous_step.target_description}' was marked sensitive — it now waits for approval.`
          : e.reason === "heal:reforge"
            ? `Re-explored '${e.previous_step.target_description}' from scratch — v${e.version} → v${e.version + 1}.`
            : `Relocated '${e.previous_step.target_description}' after the site changed — v${e.version} → v${e.version + 1}.`,
      });
    }
    if (s.vitals.last_run && s.vitals.runs > 0) {
      const rate = Math.round((s.vitals.successes / s.vitals.runs) * 100);
      events.push({
        id: `${s.skill.id}-lastrun`,
        at: s.vitals.last_run,
        kind: "run",
        skillId: s.skill.id,
        skillName: s.skill.name,
        summary: `Most recent run — ${s.vitals.runs} lifetime runs at ${rate}% success.`,
      });
    }
    events.push({
      id: `${s.skill.id}-forged`,
      at: s.skill.forged_at,
      kind: "forged",
      skillId: s.skill.id,
      skillName: s.skill.name,
      summary: `Created for ${s.skill.site.domain} — ${s.workflow.steps.length} steps.`,
    });
  }
  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

async function getGatewayInfo(): Promise<GatewayInfo> {
  return { restBase: API_BASE, mcpEndpoint: `${API_BASE}/mcp`, connectedAgents: [] };
}

/* ── API key management ───────────────────────────────────────────────────
 * API keys are created, stored, and revoked by the gateway. The browser only
 * retains the operator token in session storage for the current session. */

async function getApiKeys(token: string): Promise<ApiKey[]> {
  const body = await request<{ keys: Array<{ id: string; name: string; masked_value: string; scopes?: string[]; created_at: string; last_used_at: string | null }> }>("/keys", { headers: { Authorization: `Bearer ${normalizeToken(token)}` } });
  return body.keys.map((key) => ({ id: key.id, name: key.name, maskedValue: key.masked_value, scopes: key.scopes, createdAt: key.created_at, lastUsedAt: key.last_used_at }));
}

async function generateApiKey(token: string, name: string, scopes: string[] = ["run"]): Promise<{ id: string; value: string; createdAt: string }> {
  const remote = await request<{ key: { id: string; created_at: string }; value: string }>("/keys", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${normalizeToken(token)}` }, body: JSON.stringify({ name, scopes }) });
  return { id: remote.key.id, value: remote.value, createdAt: remote.key.created_at };
}
async function revokeApiKey(token: string, id: string): Promise<void> {
  await request(`/keys/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${normalizeToken(token)}` } });
}

async function createBrowserSession(token: string): Promise<{ token: string; expiresAt: string; scopes: string[] }> {
  const body = await request<{ token: string; session: { expires_at: string; scopes: string[] } }>("/auth/session", { method: "POST", headers: { Authorization: `Bearer ${normalizeToken(token)}` } });
  return { token: body.token, expiresAt: body.session.expires_at, scopes: body.session.scopes };
}

async function revokeBrowserSession(token: string): Promise<void> {
  await request("/auth/session", { method: "DELETE", headers: { Authorization: `Bearer ${normalizeToken(token)}` } });
}

async function recordGateApproval(runId: string, decision: "approved" | "denied", note?: string): Promise<void> {
  await request(`/runs/${encodeURIComponent(runId)}/approval`, { method: "POST", headers: operatorHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ decision, ...(note ? { note } : {}) }) });
}

/* ── The exported surface ─────────────────────────────────────────────── */

export const api = {
  health,
  getRegistry,
  getSkill,
  runSkill,
  teachSkill,
  getDashboardSummary,
  getActivityLog,
  getGatewayInfo,
  getApiKeys,
  generateApiKey,
  revokeApiKey,
  createBrowserSession,
  revokeBrowserSession,
  recordGateApproval,
};

/** MCP tool name for a skill, matching backend/src/mcp.ts. */
export function mcpToolName(skillId: string): string {
  return `thru_${skillId.replaceAll("-", "_")}`;
}

/** A ready-to-paste curl for the API tab, with schema-derived sample inputs. */
export function curlFor(skill: SkillArtifact): string {
  const props = skill.contract.inputs.properties ?? {};
  const sample: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(props)) {
    sample[key] = sampleValue(key, schema.type, schema.pattern);
  }
  const body = JSON.stringify(sample);
  return [
    `curl -X POST ${API_BASE}/skills/${skill.skill.id} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${body}'`,
  ].join("\n");
}

function sampleValue(key: string, type: string, pattern?: string): unknown {
  if (type === "integer" || type === "number") return 2999;
  if (type === "boolean") return true;
  if (pattern) {
    if (pattern.includes("^[0-9]{10}$")) return "8524617390";
    if (pattern.includes("^[0-9]{12}$")) return "100234567890";
    if (pattern.includes("[A-Z0-9-]{4,12}")) return "THRU-2026";
    const digits = pattern.match(/\[0-9\]\{(\d+)\}/);
    if (digits) return "8524617390852461".slice(0, Number(digits[1]));
  }
  if (key.toLowerCase().includes("url")) return "https://example.com/item";
  return "example";
}

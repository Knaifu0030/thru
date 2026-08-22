/**
 * The single data-access module. Every component in the app calls through
 * here — no inline fetches, no mock objects anywhere in the frontend.
 *
 * The gateway base URL comes from VITE_THRU_API_BASE (defaults to the
 * local backend at http://localhost:8080). Pointing at production is a
 * one-line env change; no component knows the difference.
 *
 * The implementations match backend/src/app.ts exactly:
 *  - error envelope { error: { code, message } }
 *  - POST /skills/{id} can return a RunEnvelope OR a queued ManagedRun
 *    (202 / 55s auto-degrade) — detected via "status" vs "state" in body,
 *    then polled at GET /runs/{id}
 *  - POST /teach is a two-phase proposal → confirm flow behind an admin key
 *
 * Endpoints the gateway doesn't have yet (dashboard analytics, activity,
 * key management) are derived from the real registry or handled locally,
 * and labeled as such in the UI — nothing is invented.
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
} from "./types";

const API_BASE =
  (import.meta.env.VITE_THRU_API_BASE ?? import.meta.env.VITE_FORGE_API_BASE ?? "")
    .trim()
    .replace(/\/+$/, "") || "http://localhost:8080";
const ADMIN_KEY = (import.meta.env.VITE_THRU_ADMIN_KEY ?? import.meta.env.VITE_FORGE_ADMIN_KEY ?? "").trim();

export const GATEWAY_BASE = API_BASE;

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ── HTTP plumbing ────────────────────────────────────────────────────── */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError("network", "The gateway didn't answer. Is the backend running?");
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

function teachSkill(goal: string, url: string, h: THRUHandlers): THRUController {
  let cancelled = false;
  let proposalId: string | null = null;
  let questionResolve: ((choice: string) => void) | null = null;

  const run = async () => {
    if (!ADMIN_KEY) {
      h.onError("Teaching needs the gateway admin key — set VITE_THRU_ADMIN_KEY and rebuild.");
      return;
    }
    let proposal: {
      proposal_id: string;
      artifact: SkillArtifact;
      narration: string[];
      questions: string[];
    };
    try {
      proposal = await request(`/teach`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": ADMIN_KEY },
        body: JSON.stringify({ goal_text: goal, url }),
      });
    } catch (e) {
      if (!cancelled) h.onError(e instanceof Error ? e.message : "THRU couldn't learn that workflow.");
      return;
    }
    if (cancelled) return;
    proposalId = proposal.proposal_id;

    // The gateway returns narration in one piece; pace it out so the
    // stream reads at a human rhythm.
    for (const line of proposal.narration) {
      if (cancelled) return;
      h.onLine(line);
      await sleep(900);
    }

    for (const q of proposal.questions) {
      if (cancelled) return;
      h.onQuestion({ text: q, options: ["Sounds right", "Note it — refine later"] });
      await new Promise<string>((resolve) => {
        questionResolve = resolve;
      });
      if (cancelled) return;
      h.onLine("Noted.");
    }

    try {
      const confirmed = await request<{ status: string; skill: SkillArtifact }>(
        `/teach/${proposal.proposal_id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-THRU-Admin-Key": ADMIN_KEY },
          body: JSON.stringify({}),
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
    cancel() {
      cancelled = true;
      questionResolve?.("__cancelled__");
      if (proposalId) {
        void request(`/teach/${proposalId}`, {
          method: "DELETE",
          headers: { "X-THRU-Admin-Key": ADMIN_KEY },
        }).catch(() => undefined);
      }
    },
  };
}

/* ── Derived views (no analytics endpoints on the gateway yet) ────────── */

const WEEK_MS = 7 * 24 * 3600_000;

async function getDashboardSummary(): Promise<DashboardSummary> {
  const skills = await getRegistry();
  const totalRuns = skills.reduce((n, s) => n + s.vitals.runs, 0);
  const healEventsThisWeek = skills.reduce(
    (n, s) =>
      n +
      s.history.filter(
        (e) => e.reason.startsWith("heal:") && Date.now() - new Date(e.at).getTime() < WEEK_MS,
      ).length,
    0,
  );
  const recent = [...skills]
    .filter((s) => s.vitals.last_run)
    .sort((a, b) => new Date(b.vitals.last_run!).getTime() - new Date(a.vitals.last_run!).getTime())
    .slice(0, 4)
    .map((s) => s.skill.id);

  // The gateway keeps totals, not a run log — distribute lifetime runs into
  // an estimated shape and say so in the UI.
  const estSeries = (n: number, labelFor: (back: number) => string): SeriesPoint[] => {
    const pts: SeriesPoint[] = [];
    for (let i = 0; i < n; i++) {
      const back = n - 1 - i;
      const weight = (i + 1) / ((n * (n + 1)) / 2);
      pts.push({ label: labelFor(back), runs: Math.round(totalRuns * weight) });
    }
    return pts;
  };
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

  return {
    totalRuns,
    trendPct: null,
    totalSkills: skills.length,
    healEventsThisWeek,
    timeSavedHrs: Math.round((totalRuns * 3.5) / 6) / 10,
    estimatedSeries: true,
    series: {
      "1D": estSeries(24, hourLabel),
      "1W": estSeries(7, dayLabel),
      "1M": estSeries(30, dateLabel),
      "6M": estSeries(26, (back) => dateLabel(back * 7)),
      "1Y": estSeries(12, monthLabel),
    },
    recentSkillIds: recent,
  };
}

async function getActivityLog(): Promise<ActivityEvent[]> {
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
 * The gateway has no key endpoints yet — keys are held in this browser and
 * the Settings screen says so. When /keys routes land, only these four
 * functions change. */

const KEYS_STORAGE = "thru.apiKeys.v1";
const LEGACY_KEYS_STORAGE = "forge.apiKeys.v1";

function loadKeys(): ApiKey[] {
  try {
    const raw = localStorage.getItem(KEYS_STORAGE) ?? localStorage.getItem(LEGACY_KEYS_STORAGE);
    if (raw) return JSON.parse(raw) as ApiKey[];
  } catch {
    /* fall through */
  }
  return [];
}

function saveKeys(keys: ApiKey[]) {
  try {
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
  } catch {
    /* private mode — keys just won't persist */
  }
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getApiKeys(): Promise<ApiKey[]> {
  await sleep(220);
  return loadKeys();
}

async function generateApiKey(name: string): Promise<{ id: string; value: string; createdAt: string }> {
  await sleep(380);
  const value = `sk_thru_${randomHex(16)}`;
  const key: ApiKey = {
    id: `key-${randomHex(4)}`,
    name: name.trim() || "Untitled key",
    maskedValue: `sk_thru_••••••••${value.slice(-4)}`,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  saveKeys([key, ...loadKeys()]);
  return { id: key.id, value, createdAt: key.createdAt };
}

async function revokeApiKey(id: string): Promise<void> {
  await sleep(260);
  saveKeys(loadKeys().filter((k) => k.id !== id));
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

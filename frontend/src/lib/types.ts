/**
 * Contract types. The first block mirrors backend/src/types.ts verbatim —
 * these are the shapes the REST gateway and MCP server actually return.
 * The second block is app-level view data assembled from gateway endpoints
 * (dashboard summary, activity, gateway info, and key-management views).
 */

/* ── Backend contract ─────────────────────────────────────────────────── */

export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  pattern?: string;
  format?: string;
  items?: JsonSchema;
  description?: string;
  additionalProperties?: boolean;
}

export interface HealingEvent {
  step: string;
  rung: "retry" | "relocate" | "reforge";
  note: string;
  at?: string;
}

export interface Expectation {
  contains?: string[];
  not_contains?: string[];
  url_contains?: string;
  element_present?: string;
  field_value_equals?: string;
  min_items?: { path: string; count: number };
}

export interface WorkflowStep {
  id: string;
  action: "navigate" | "fill" | "click" | "extract" | "wait" | "switch_tab" | "switch_frame";
  target_description: string;
  url?: string;
  selector_primary?: string;
  selector_fallbacks?: string[];
  wait_ms?: number;
  value_from?: string;
  extraction?: { strategy: "header_map" | "json_element"; map_to: string; selector?: string };
  expect: Expectation;
  timeout_ms: number;
  sensitive: boolean;
}

export interface HistoryEntry {
  version: number; // the version this change replaced
  changed_step: string;
  reason: string; // "heal:relocate" | "heal:reforge" | "runtime:sensitivity-added"
  at: string;
  previous_step: WorkflowStep;
}

export interface SkillArtifact {
  forge_spec: 1;
  skill: {
    id: string;
    name: string;
    description: string;
    site: { domain: string; display: string };
    version: number;
    forged_at: string;
    author: { name: string; id: string };
    tags: string[];
    sensitive: boolean;
  };
  contract: {
    inputs: JsonSchema;
    outputs: JsonSchema;
    render_hint?: string; // "text" | "keyvalue" | "table:<path>" | "raw"
  };
  workflow: { engine: "webcmd"; steps: WorkflowStep[] };
  vitals: {
    runs: number;
    successes: number;
    healed_runs: number;
    avg_ms: number;
    last_run: string | null;
    last_heal: HealingEvent | null;
  };
  history: HistoryEntry[];
}

export type RunStatus =
  | "success"
  | "healed_success"
  | "invalid_input"
  | "portal_error"
  | "needs_human";

export interface StepResult {
  step: string;
  action: string;
  narration: string;
  selected_locator: string | null;
  expectation_met: boolean;
  drift: string;
  timing_ms: number;
}

export interface RunEnvelope {
  skill: string;
  version: number;
  status: RunStatus;
  data: unknown;
  healing: HealingEvent[];
  needs_human: { reason: string; how: string } | null;
  timing_ms: number;
  narration?: string[];
  warnings?: string[];
  steps?: StepResult[];
}

export interface ManagedRun {
  id: string;
  skill: string;
  state: "queued" | "running" | "completed" | "failed" | "cancelled";
  position: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: RunEnvelope | null;
  error: string | null;
}

export interface HealthInfo {
  status: string;
  version: string;
  skills: number;
}

/* ── App-level data ───────────────────────────────────────────────────── */

export type ActivityKind = "run" | "heal" | "gate" | "forged" | "teaching";

export interface ActivityEvent {
  id: string;
  at: string;
  kind: ActivityKind;
  skillId: string;
  skillName: string;
  summary: string;
  runId?: string;
  gatePending?: boolean;
}

export interface ConnectedAgent {
  name: string;
  transport: "MCP" | "REST";
  lastActive: string;
}

export interface GatewayInfo {
  restBase: string;
  mcpEndpoint: string;
  connectedAgents: ConnectedAgent[];
}

export interface ApiKey {
  id: string;
  name: string;
  maskedValue: string;
  createdAt: string;
  lastUsedAt: string | null;
  scopes?: string[];
}

export type ChartRange = "1D" | "1W" | "1M" | "6M" | "1Y";

export interface SeriesPoint {
  label: string;
  runs: number;
}

export interface DashboardSummary {
  totalRuns: number;
  trendPct: number | null;
  totalSkills: number;
  healEventsThisWeek: number;
  timeSavedHrs: number | null;
  /** true only when the gateway cannot provide a real event series */
  estimatedSeries: boolean;
  series: Record<ChartRange, SeriesPoint[]>;
  recentSkillIds: string[];
}

/* ── Teaching session ──────────────────────────────────────────────────── */

export interface THRUQuestion {
  text: string;
  options: string[];
}

export interface THRUHandlers {
  onLine: (line: string) => void;
  onQuestion: (q: THRUQuestion) => void;
  onDraft: (artifact: SkillArtifact) => void;
  onDone: (skill: SkillArtifact) => void;
  onError: (message: string) => void;
}

export interface THRUController {
  answer: (choice: string) => void;
  editDraft: (artifact: SkillArtifact) => void;
  cancel: () => void;
}

export type TeachingActionType = "navigate" | "fill" | "click" | "extract" | "wait" | "switch_tab" | "switch_frame";

export interface TeachingActionInput {
  type: TeachingActionType;
  target: string;
  value?: string;
  evidence?: {
    url?: string;
    title?: string;
    selector?: string;
    text?: string;
    screenshot_ref?: string;
  };
}

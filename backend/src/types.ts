export type RunContext = "local_human" | "rest" | "mcp";
export type RunStatus =
  | "success"
  | "healed_success"
  | "invalid_input"
  | "portal_error"
  | "needs_human";

export interface JsonSchema {
  readonly type: string;
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly pattern?: string;
  readonly format?: string;
  readonly items?: JsonSchema;
  readonly description?: string;
  readonly additionalProperties?: boolean;
}

export interface Expectation {
  readonly contains?: readonly string[];
  readonly not_contains?: readonly string[];
  readonly url_contains?: string;
  readonly element_present?: string;
  readonly field_value_equals?: string;
  readonly min_items?: { readonly path: string; readonly count: number };
}

export interface WorkflowStep {
  readonly id: string;
  readonly action: "navigate" | "fill" | "click" | "extract";
  readonly target_description: string;
  readonly url?: string;
  readonly selector_primary?: string;
  readonly selector_fallbacks?: readonly string[];
  readonly value_from?: string;
  readonly extraction?: {
    readonly strategy: "header_map" | "json_element";
    readonly map_to: string;
    readonly selector?: string;
  };
  readonly expect: Expectation;
  readonly timeout_ms: number;
  readonly sensitive: boolean;
}

export interface SkillArtifact {
  readonly forge_spec: 1;
  readonly skill: {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly site: { readonly domain: string; readonly display: string };
    readonly version: number;
    readonly forged_at: string;
    readonly author: { readonly name: string; readonly id: string };
    readonly tags: readonly string[];
    readonly sensitive: boolean;
  };
  readonly contract: {
    readonly inputs: JsonSchema;
    readonly outputs: JsonSchema;
    readonly render_hint?: string;
  };
  readonly workflow: {
    readonly engine: "webcmd";
    readonly steps: readonly WorkflowStep[];
  };
  readonly vitals: {
    readonly runs: number;
    readonly successes: number;
    readonly healed_runs: number;
    readonly avg_ms: number;
    readonly last_run: string | null;
    readonly last_heal: HealingEvent | null;
  };
  readonly history: readonly HistoryEntry[];
}

export interface HealingEvent {
  readonly step: string;
  readonly rung: "retry" | "relocate" | "reforge";
  readonly note: string;
  readonly at?: string;
}

export interface HistoryEntry {
  readonly version: number;
  readonly changed_step: string;
  readonly reason: string;
  readonly at: string;
  readonly previous_step: WorkflowStep;
}

export interface RunEnvelope {
  readonly skill: string;
  readonly version: number;
  readonly status: RunStatus;
  readonly data: unknown;
  readonly healing: readonly HealingEvent[];
  readonly needs_human: { readonly reason: string; readonly how: string } | null;
  readonly timing_ms: number;
  readonly narration?: readonly string[];
  readonly warnings?: readonly string[];
}


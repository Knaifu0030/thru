export type Locale = "en" | "kn";
export type ApplicationStatus = "draft" | "prepared" | "under_review" | "certificate_issued";
export interface Applicant { name: string; dob: string; district: string; taluk: string; income: string; purpose: string }
export interface DemoApplication { reference: string | null; status: ApplicationStatus; documents: Record<string, boolean>; applicant: Applicant; certificateNumber?: string; issuedOn?: string }
export interface StepEvidence { step: string; action: string; narration: string; selected_locator: string | null; expectation_met: boolean; drift: string; timing_ms: number }
export interface RunEnvelope { skill: string; version: number; status: "success" | "healed_success" | "invalid_input" | "portal_error" | "needs_human"; data: Record<string, unknown> | null; healing: Array<{ step: string; rung: string; note: string }>; needs_human: { reason: string; how: string } | null; timing_ms: number; narration?: string[]; warnings?: string[]; steps?: StepEvidence[] }
export interface RunTelemetry { runId: string | null; queueState: string; skillId: string | null; input: Record<string, unknown> | null; envelope: RunEnvelope | null; error: string | null; startedAt: number | null }

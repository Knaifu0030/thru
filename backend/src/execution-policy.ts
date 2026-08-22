import type { SkillArtifact, WorkflowStep } from "./types.js";

export const GLOBAL_RUN_BUDGET_MS = 90_000;
export const REST_RUN_BUDGET_MS = 55_000;
export const REFORGE_BUDGET_MS = 45_000;
export const RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;
export const MAX_NARRATION_LENGTH = 160;

const SENSITIVE_MARKERS = /\b(password|passcode|login|log in|sign in|otp|one[- ]time|captcha|payment|pay|purchase|checkout|delete|remove|send|submit|publish|transfer)\b/i;
const MANUAL_MARKERS = /\b(login|log in|sign in|otp|one[- ]time|captcha)\b/i;

export function isSensitiveStep(step: Pick<WorkflowStep, "action" | "target_description" | "sensitive">): boolean {
  return step.sensitive || SENSITIVE_MARKERS.test(`${step.action} ${step.target_description}`);
}

export function isManualGate(step: Pick<WorkflowStep, "target_description">): boolean {
  return MANUAL_MARKERS.test(step.target_description);
}

export function enforceSensitivity(skill: SkillArtifact, previous?: SkillArtifact): SkillArtifact {
  const priorById = new Map(previous?.workflow.steps.map((step) => [step.id, step.sensitive]) ?? []);
  const steps = skill.workflow.steps.map((step) => ({ ...step, sensitive: Boolean(priorById.get(step.id)) || isSensitiveStep(step) }));
  return { ...skill, skill: { ...skill.skill, sensitive: Boolean(previous?.skill.sensitive) || steps.some((step) => step.sensitive) }, workflow: { ...skill.workflow, steps } };
}

export function semanticSimilarity(left: string, right: string): number {
  const tokenize = (value: string) => [...new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))];
  const a = tokenize(left), b = tokenize(right), union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : [...union].filter((word) => a.includes(word) && b.includes(word)).length / union.size;
}

export function boundedNarration(message: string): string { return message.trim().slice(0, MAX_NARRATION_LENGTH); }

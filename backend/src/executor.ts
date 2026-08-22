import type { SkillRegistry } from "./registry.js";
import { validateInputs } from "./skill-validation.js";
import { runWithWebcmd } from "./webcmd-runner.js";
import type { HealingEvent, RunExecutionContext, RunEnvelope, SkillArtifact, WorkflowStep } from "./types.js";

export class SkillExecutor {
  readonly #registry: SkillRegistry;
  #internalBaseUrl: string | undefined;
  #tail: Promise<void> = Promise.resolve();

  constructor(registry: SkillRegistry, internalBaseUrl?: string) { this.#registry = registry; this.#internalBaseUrl = internalBaseUrl; }

  setInternalBaseUrl(url: string): void { this.#internalBaseUrl = url.replace(/\/$/, ""); }

  async runSkill(id: string, rawInputs: unknown, context: RunExecutionContext): Promise<RunEnvelope | undefined> {
    const previous = this.#tail; let release = (): void => undefined;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await this.#run(id, rawInputs, context); } finally { release(); }
  }

  async #run(id: string, rawInputs: unknown, context: RunExecutionContext): Promise<RunEnvelope | undefined> {
    const started = performance.now(); const skill = this.#registry.get(id); if (!skill) return undefined;
    const validation = validateInputs(skill, rawInputs);
    if (!validation.ok) return envelope(skill, "invalid_input", null, [], null, started, validation.errors);
    const sensitiveStep = skill.workflow.steps.find((step) => step.sensitive);
    if (sensitiveStep && context.surface !== "local_human") return envelope(skill, "needs_human", null, [], { reason: sensitiveStep.target_description, how: `Run locally: forge run ${id}; a human must approve this step.` }, started, validation.warnings);
    if (sensitiveStep) {
      const manual = /(captcha|login|log in|otp)/i.test(sensitiveStep.target_description);
      const approved = await context.humanGate?.({ kind: manual ? "manual" : "approval", step: sensitiveStep, reason: sensitiveStep.target_description, ...(manual ? {} : { approvalWord: "APPROVE" as const }) });
      if (!approved) return envelope(skill, "needs_human", null, [], { reason: sensitiveStep.target_description, how: manual ? "Complete the browser step manually, then resume." : "Type exactly APPROVE to continue." }, started, validation.warnings);
    }
    const executed = await runWithWebcmd(skill, validation.inputs, context, this.#internalBaseUrl);
    let updated = skill;
    if (executed.status === "success" || executed.status === "healed_success") {
      for (const patch of executed.patches) { const prior = updated.workflow.steps.find((step) => step.id === patch.step); if (prior) updated = healSkill(updated, prior, patch.selector, patch.rung, patch.note); }
    }
    const duration = Math.max(1, Math.round(performance.now() - started));
    updated = updateVitals(updated, duration, executed.status === "success" || executed.status === "healed_success", executed.healing[0] ?? null);
    await this.#registry.save(updated);
    return { ...envelope(updated, executed.status, executed.data, executed.healing, executed.needsHuman ? { reason: executed.needsHuman, how: `Run locally: forge run ${id}; a human must complete this step.` } : null, started, validation.warnings, executed.narration), timing_ms: duration, steps: executed.steps };
  }
}

function healSkill(skill: SkillArtifact, previous: WorkflowStep, selector: string, rung: "relocate" | "reforge", note: string): SkillArtifact {
  const changed: WorkflowStep = { ...previous, selector_primary: selector, selector_fallbacks: [...new Set([...(previous.selector_fallbacks ?? []), previous.selector_primary].filter(Boolean) as string[])] };
  return { ...skill, skill: { ...skill.skill, version: skill.skill.version + 1 }, workflow: { ...skill.workflow, steps: skill.workflow.steps.map((step) => step.id === previous.id ? changed : step) }, history: [...skill.history, { version: skill.skill.version, changed_step: previous.id, reason: `heal:${rung}`, at: new Date().toISOString(), previous_step: previous }].slice(-10), vitals: { ...skill.vitals, last_heal: { step: previous.id, rung, note, at: new Date().toISOString() } } };
}

function updateVitals(skill: SkillArtifact, duration: number, succeeded: boolean, healing: HealingEvent | null): SkillArtifact {
  const runs = skill.vitals.runs + 1;
  return { ...skill, vitals: { ...skill.vitals, runs, successes: skill.vitals.successes + (succeeded ? 1 : 0), healed_runs: skill.vitals.healed_runs + (healing ? 1 : 0), avg_ms: Math.round(((skill.vitals.avg_ms * skill.vitals.runs) + duration) / runs), last_run: new Date().toISOString(), last_heal: healing ?? skill.vitals.last_heal } };
}

function envelope(skill: SkillArtifact, status: RunEnvelope["status"], data: unknown, healing: HealingEvent[], needsHuman: RunEnvelope["needs_human"], started: number, warnings: readonly string[] = [], narration: readonly string[] = []): RunEnvelope {
  return { skill: skill.skill.id, version: skill.skill.version, status, data, healing, needs_human: needsHuman, timing_ms: Math.max(0, Math.round(performance.now() - started)), narration, warnings };
}

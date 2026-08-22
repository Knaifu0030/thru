import type { MockPortal } from "./mock-portal.js";
import type { SkillRegistry } from "./registry.js";
import { validateInputs } from "./skill-validation.js";
import { runWithWebcmd } from "./webcmd-runner.js";
import type { HealingEvent, RunContext, RunEnvelope, SkillArtifact, WorkflowStep } from "./types.js";

export class SkillExecutor {
  readonly #registry: SkillRegistry;
  readonly #mockPortal: MockPortal;
  #tail: Promise<void> = Promise.resolve();

  constructor(registry: SkillRegistry, mockPortal: MockPortal) {
    this.#registry = registry;
    this.#mockPortal = mockPortal;
  }

  async runSkill(id: string, rawInputs: unknown, context: RunContext): Promise<RunEnvelope | undefined> {
    const previous = this.#tail;
    let release = (): void => undefined;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await this.#run(id, rawInputs, context);
    } finally {
      release();
    }
  }

  async #run(id: string, rawInputs: unknown, context: RunContext): Promise<RunEnvelope | undefined> {
    const started = performance.now();
    const skill = this.#registry.get(id);
    if (!skill) return undefined;
    const validation = validateInputs(skill, rawInputs);
    if (!validation.ok) {
      return envelope(skill, "invalid_input", null, [], null, started, validation.errors);
    }

    const sensitiveStep = skill.workflow.steps.find((step) => step.sensitive);
    if (sensitiveStep && context !== "local_human") {
      return envelope(skill, "needs_human", null, [], {
        reason: sensitiveStep.target_description,
        how: `Run locally: forge run ${id} — a human must approve this step.`,
      }, started, validation.warnings);
    }

    if (skill.skill.site.domain === "forge-internal") {
      return this.#runMock(skill, validation.inputs, started, validation.warnings);
    }

    const executed = await runWithWebcmd(skill, validation.inputs);
    let updated = skill;
    for (const patch of executed.patches) {
      const previous = updated.workflow.steps.find((step) => step.id === patch.step);
      if (previous) updated = healSkill(updated, previous, patch.selector, patch.rung, patch.note);
    }
    const duration = Math.max(1, Math.round(performance.now() - started));
    updated = updateVitals(updated, duration, executed.status === "success" || executed.status === "healed_success", executed.healing[0] ?? null);
    await this.#registry.save(updated);
    return { ...envelope(updated, executed.status, executed.data, executed.healing, executed.needsHuman ? {
      reason: executed.needsHuman,
      how: `Run locally: forge run ${id} — a human must complete this step.`,
    } : null, started, validation.warnings, executed.narration), timing_ms: duration };
  }

  async #runMock(skill: SkillArtifact, inputs: Record<string, unknown>, started: number, warnings: string[]): Promise<RunEnvelope> {
    const narration = ["Opening the Demoland certificate portal…"];
    const healing: HealingEvent[] = [];
    let updated = skill;
    const variant = this.#mockPortal.variant;
    const button = skill.workflow.steps.find((step) => step.id === "s3");
    const expectedSelector = variant === "v1" ? "#check-status" : variant === "v2" ? "#verify-now" : "#find-record";

    if (button && button.selector_primary !== expectedSelector) {
      narration.push(`'${button.selector_primary}' is missing. Scanning by meaning…`);
      const isFallback = button.selector_fallbacks?.includes(expectedSelector) ?? false;
      const rung = isFallback ? "relocate" : "reforge";
      const note = isFallback
        ? `Found ${expectedSelector} by fallback. Learned.`
        : `Re-forged the changed button as ${expectedSelector}.`;
      healing.push({ step: button.id, rung, note, at: new Date().toISOString() });
      narration.push(rung === "relocate" ? "Found the renamed button. Learning the repair…" : "Re-forging only the changed step…");
      updated = healSkill(skill, button, expectedSelector, rung, note);
    }

    narration.push("Reading the verified certificate result…");
    const certificate = String(inputs.certificate ?? "");
    const data = {
      certificate,
      status: certificate === "DEMO-404" ? "not_found" : "verified",
      holder: "Demo Citizen",
      issued_on: "2026-08-22",
    };
    const duration = Math.max(1, Math.round(performance.now() - started));
    updated = updateVitals(updated, duration, true, healing[0] ?? null);
    await this.#registry.save(updated);
    narration.push("Certificate status is ready.");
    return {
      ...envelope(updated, healing.length ? "healed_success" : "success", data, healing, null, started, warnings, narration),
      timing_ms: duration,
    };
  }
}

function healSkill(skill: SkillArtifact, previous: WorkflowStep, selector: string, rung: "relocate" | "reforge", note: string): SkillArtifact {
  const changed: WorkflowStep = {
    ...previous,
    selector_primary: selector,
    selector_fallbacks: [...new Set([...(previous.selector_fallbacks ?? []), previous.selector_primary].filter(Boolean) as string[])],
  };
  return {
    ...skill,
    skill: { ...skill.skill, version: skill.skill.version + 1 },
    workflow: { ...skill.workflow, steps: skill.workflow.steps.map((step) => step.id === previous.id ? changed : step) },
    history: [
      ...skill.history,
      { version: skill.skill.version, changed_step: previous.id, reason: `heal:${rung}`, at: new Date().toISOString(), previous_step: previous },
    ].slice(-10),
    vitals: { ...skill.vitals, last_heal: { step: previous.id, rung, note, at: new Date().toISOString() } },
  };
}

function updateVitals(skill: SkillArtifact, duration: number, succeeded: boolean, healing: HealingEvent | null): SkillArtifact {
  const runs = skill.vitals.runs + 1;
  return {
    ...skill,
    vitals: {
      ...skill.vitals,
      runs,
      successes: skill.vitals.successes + (succeeded ? 1 : 0),
      healed_runs: skill.vitals.healed_runs + (healing ? 1 : 0),
      avg_ms: Math.round(((skill.vitals.avg_ms * skill.vitals.runs) + duration) / runs),
      last_run: new Date().toISOString(),
      last_heal: healing ?? skill.vitals.last_heal,
    },
  };
}

function envelope(
  skill: SkillArtifact,
  status: RunEnvelope["status"],
  data: unknown,
  healing: HealingEvent[],
  needsHuman: RunEnvelope["needs_human"],
  started: number,
  warnings: readonly string[] = [],
  narration: readonly string[] = [],
): RunEnvelope {
  return {
    skill: skill.skill.id,
    version: skill.skill.version,
    status,
    data,
    healing,
    needs_human: needsHuman,
    timing_ms: Math.max(0, Math.round(performance.now() - started)),
    narration,
    warnings,
  };
}

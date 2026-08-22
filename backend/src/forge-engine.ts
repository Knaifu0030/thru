import { randomUUID } from "node:crypto";
import { inspectWithWebcmd, type PageObservation } from "./webcmd-runner.js";
import type { ForgeModel } from "./forge-model.js";
import type { SkillRegistry } from "./registry.js";
import { validateArtifact } from "./skill-validation.js";
import type { JsonSchema, SkillArtifact, WorkflowStep } from "./types.js";

export interface ForgeRequest { readonly goal_text: string; readonly url: string; readonly sample_inputs?: Record<string, unknown> }
interface Proposal { readonly id: string; readonly artifact: SkillArtifact; readonly narration: string[]; readonly questions: string[]; readonly expiresAt: number }

export class ForgeEngine {
  readonly #proposals = new Map<string, Proposal>();
  constructor(private readonly registry: SkillRegistry, private readonly model: ForgeModel | null = null, private readonly inspect = inspectWithWebcmd) {}
  async propose(request: ForgeRequest): Promise<{ proposal_id: string; artifact: SkillArtifact; narration: string[]; questions: string[]; expires_at: string }> {
    if (!request.goal_text?.trim()) throw new Error("goal_text is required"); const parsed = new URL(request.url); if (!/^https?:$/.test(parsed.protocol)) throw new Error("url must use http or https");
    const narration = ["Opening a dedicated Webcmd reconnaissance session."]; const observation = await this.inspect(parsed.href); narration.push(`Observed ${observation.inputs.length} inputs and ${observation.buttons.length} buttons without persisting a draft.`);
    const fallback = deterministicArtifact(request, observation); let artifact = fallback.artifact; const questions = [...fallback.questions];
    if (this.model) { try { const raw = await this.model.propose({ ...request, observation, deterministic_artifact: artifact }); const validation = validateArtifact(raw); if (!validation.ok) throw new Error(validation.errors.join("; ")); artifact = validation.skill; narration.push("Validated an Azure OpenAI structured proposal against the Forge contract."); } catch (error) { narration.push(`Model proposal rejected; deterministic inference retained: ${(error as Error).message.slice(0, 160)}`); } }
    const id = randomUUID(), expiresAt = Date.now() + 15 * 60_000; this.#proposals.set(id, { id, artifact, narration, questions, expiresAt }); this.#purge();
    return { proposal_id: id, artifact, narration, questions, expires_at: new Date(expiresAt).toISOString() };
  }
  async confirm(id: string, edited?: unknown): Promise<SkillArtifact> { this.#purge(); const proposal = this.#proposals.get(id); if (!proposal) throw new Error("Proposal not found or expired."); const validation = validateArtifact(edited ?? proposal.artifact); if (!validation.ok) throw new Error(validation.errors.join("; ")); const saved = await this.registry.import(validation.skill); this.#proposals.delete(id); return saved; }
  discard(id: string): boolean { return this.#proposals.delete(id); }
  #purge(): void { const now = Date.now(); for (const [id, proposal] of this.#proposals) if (proposal.expiresAt <= now) this.#proposals.delete(id); }
}

function deterministicArtifact(request: ForgeRequest, observation: PageObservation): { artifact: SkillArtifact; questions: string[] } {
  const host = new URL(request.url).hostname; const id = slug(`${host.split(".")[0]}-${request.goal_text}`).slice(0, 60) || `skill-${Date.now()}`; const properties: Record<string, JsonSchema> = {}; const required: string[] = []; const steps: WorkflowStep[] = [{ id: "s1", action: "navigate", target_description: request.goal_text, url: request.url, expect: { contains: [observation.headings[0] ?? observation.title], not_contains: ["captcha", "access denied"] }, timeout_ms: 15_000, sensitive: false }];
  for (const [index, input] of observation.inputs.entries()) { const key = slug(input.name || input.placeholder || `input-${index + 1}`).replaceAll("-", "_"); properties[key] = { type: "string", description: input.placeholder || input.name || "Observed form value" }; required.push(key); steps.push({ id: `s${steps.length + 1}`, action: "fill", target_description: input.placeholder || input.name || `Form input ${index + 1}`, selector_primary: input.name ? `[name="${cssEscape(input.name)}"]` : "input", selector_fallbacks: [input.placeholder ? `input[placeholder="${cssEscape(input.placeholder)}"]` : "input"], value_from: `inputs.${key}`, expect: { field_value_equals: `inputs.${key}`, not_contains: ["captcha", "password"] }, timeout_ms: 8_000, sensitive: /password|otp|card/i.test(`${input.name} ${input.type} ${input.placeholder}`) }); }
  steps.push({ id: `s${steps.length + 1}`, action: "extract", target_description: "Read the resulting page content", selector_primary: "main", selector_fallbacks: ["article", "body"], extraction: { strategy: "header_map", map_to: "outputs", selector: "main" }, expect: { element_present: "body", not_contains: ["access denied"] }, timeout_ms: 8_000, sensitive: false });
  const sensitive = steps.some((step) => step.sensitive); const questions = observation.buttons.length > 1 ? ["Which observed button should trigger the read-only result?"] : observation.inputs.length && !request.sample_inputs ? ["Provide sample input values before confirming locator behavior."] : [];
  return { questions, artifact: { forge_spec: 1, skill: { id, name: request.goal_text.trim().slice(0, 80), description: `Forged read-only workflow for ${host}.`, site: { domain: host, display: observation.title || host }, version: 1, forged_at: new Date().toISOString(), author: { name: "Forge", id: "local" }, tags: ["forged", "read-only"], sensitive }, contract: { inputs: { type: "object", properties, required, additionalProperties: false }, outputs: { type: "object", properties: { text: { type: "string" } } }, render_hint: "text" }, workflow: { engine: "webcmd", steps }, vitals: { runs: 0, successes: 0, healed_runs: 0, avg_ms: 0, last_run: null, last_heal: null }, history: [] } };
}
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function cssEscape(value: string): string { return value.replace(/["\\]/g, "\\$&"); }

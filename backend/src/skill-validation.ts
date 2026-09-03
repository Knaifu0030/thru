import { createRequire } from "node:module";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { SkillArtifact } from "./types.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as new (options?: Record<string, unknown>) => {
  compile(schema: unknown): ValidateFunction;
};
const ajv = new Ajv({ allErrors: true, strict: false });
const addFormats = require("ajv-formats") as (instance: unknown) => void;
addFormats(ajv);
const inputValidators = new Map<string, ValidateFunction>();
const outputValidators = new Map<string, ValidateFunction>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateArtifact(value: unknown): { ok: true; skill: SkillArtifact } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value) || value.forge_spec !== 1) errors.push("forge_spec must equal 1");
  const skill = isRecord(value) && isRecord(value.skill) ? value.skill : null;
  if (!skill) errors.push("skill is required");
  if (skill && (typeof skill.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.id))) {
    errors.push("skill.id must be unique kebab-case");
  }
  if (skill && (typeof skill.name !== "string" || typeof skill.description !== "string")) {
    errors.push("skill name and description are required");
  }
  if (skill && (!isRecord(skill.site) || typeof skill.site.domain !== "string" || typeof skill.site.display !== "string" || !Number.isInteger(skill.version) || Number(skill.version) < 1 || typeof skill.forged_at !== "string" || Number.isNaN(Date.parse(String(skill.forged_at))) || !isRecord(skill.author) || typeof skill.author.name !== "string" || typeof skill.author.id !== "string" || !Array.isArray(skill.tags) || !skill.tags.every((tag) => typeof tag === "string") || typeof skill.sensitive !== "boolean")) errors.push("skill metadata is incomplete");
  const contract = isRecord(value) && isRecord(value.contract) ? value.contract : null;
  if (!contract || !isRecord(contract.inputs) || !isRecord(contract.outputs)) {
    errors.push("contract inputs and outputs are required JSON Schemas");
  }
  const workflow = isRecord(value) && isRecord(value.workflow) ? value.workflow : null;
  const steps = workflow && Array.isArray(workflow.steps) ? workflow.steps : null;
  if (!steps || steps.length === 0) errors.push("workflow.steps must not be empty");
  if (workflow?.engine !== "webcmd") errors.push("workflow.engine must equal webcmd");
  for (const [index, raw] of (steps ?? []).entries()) {
    if (!isRecord(raw)) {
      errors.push(`workflow.steps[${index}] must be an object`);
      continue;
    }
    if (typeof raw.id !== "string" || !["navigate", "fill", "click", "extract", "wait", "switch_tab", "switch_frame"].includes(String(raw.action)) || typeof raw.target_description !== "string" || !Number.isInteger(raw.timeout_ms) || Number(raw.timeout_ms) < 1) errors.push(`workflow.steps[${index}] has unsupported or missing fields`);
    if (raw.action === "navigate" && typeof raw.url !== "string") errors.push(`workflow.steps[${index}].url is required for navigate`);
    if (["fill", "click", "extract", "switch_frame"].includes(String(raw.action)) && typeof raw.selector_primary !== "string") errors.push(`workflow.steps[${index}].selector_primary is required`);
    if (raw.action === "wait" && (!Number.isInteger(raw.wait_ms) || Number(raw.wait_ms) < 100 || Number(raw.wait_ms) > 30_000)) errors.push(`workflow.steps[${index}].wait_ms must be between 100 and 30000`);
    if (raw.selector_fallbacks !== undefined && (!Array.isArray(raw.selector_fallbacks) || !raw.selector_fallbacks.every((item) => typeof item === "string"))) errors.push(`workflow.steps[${index}].selector_fallbacks must be strings`);
    if (raw.action === "fill" && typeof raw.value_from !== "string") errors.push(`workflow.steps[${index}].value_from is required for fill`);
    if (raw.action === "extract" && (!isRecord(raw.extraction) || !["header_map", "json_element"].includes(String(raw.extraction.strategy)) || typeof raw.extraction.map_to !== "string")) errors.push(`workflow.steps[${index}].extraction is invalid`);
    const positiveKeys = ["contains", "url_contains", "element_present", "field_value_equals", "min_items"];
    const expectation = isRecord(raw.expect) ? raw.expect : null;
    if (!expectation || !positiveKeys.some((key) => key in expectation) || !("not_contains" in expectation)) {
      errors.push(`workflow.steps[${index}].expect needs positive and negative checks`);
    }
    if (typeof raw.sensitive !== "boolean") errors.push(`workflow.steps[${index}].sensitive is required`);
  }
  const history = isRecord(value) && Array.isArray(value.history) ? value.history : null;
  if (!history || history.length > 10) errors.push("history must be an array capped at ten entries");
  const vitals = isRecord(value) && isRecord(value.vitals) ? value.vitals : null;
  if (!vitals) errors.push("vitals are required");
  else if (!["runs", "successes", "healed_runs", "avg_ms"].every((key) => Number.isFinite(vitals[key]) && Number(vitals[key]) >= 0) || !(vitals.last_run === null || typeof vitals.last_run === "string") || !(vitals.last_heal === null || isRecord(vitals.last_heal))) errors.push("vitals are invalid");
  const serialized = JSON.stringify(value).toLowerCase();
  if (/"(password|api_key|apikey|cookie|otp|captcha_answer|credit_card)"\s*:/.test(serialized)) errors.push("artifacts must not contain credentials or sensitive values");
  if (contract && isRecord(contract.inputs) && isRecord(contract.outputs)) { validateSchema(contract.inputs, "contract.inputs", errors); validateSchema(contract.outputs, "contract.outputs", errors); }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, skill: value as unknown as SkillArtifact };
}

function validateSchema(schema: Record<string, unknown>, path: string, errors: string[]): void {
  const allowed = new Set(["type", "properties", "required", "pattern", "format", "items", "description", "additionalProperties"]);
  for (const key of Object.keys(schema)) if (!allowed.has(key)) errors.push(`${path}.${key} is outside the supported schema subset`);
  if (!["object", "string", "integer", "number", "boolean", "array"].includes(String(schema.type))) errors.push(`${path}.type is unsupported`);
  if (schema.type === "object" && schema.properties !== undefined && !isRecord(schema.properties)) errors.push(`${path}.properties must be an object`);
  if (isRecord(schema.properties)) for (const [key, child] of Object.entries(schema.properties)) { if (!isRecord(child)) errors.push(`${path}.properties.${key} must be a schema`); else validateSchema(child, `${path}.properties.${key}`, errors); }
  if (schema.type === "array" && !isRecord(schema.items)) errors.push(`${path}.items is required for arrays`);
  if (isRecord(schema.items)) validateSchema(schema.items, `${path}.items`, errors);
  if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every((item) => typeof item === "string"))) errors.push(`${path}.required must contain strings`);
  if (schema.pattern !== undefined) { if (typeof schema.pattern !== "string") errors.push(`${path}.pattern must be a string`); else try { new RegExp(schema.pattern); } catch { errors.push(`${path}.pattern is invalid`); } }
}

export function validateInputs(skill: SkillArtifact, inputs: unknown): { ok: true; inputs: Record<string, unknown>; warnings: string[] } | { ok: false; errors: string[] } {
  if (!isRecord(inputs)) return { ok: false, errors: ["inputs must be an object"] };
  const known = skill.contract.inputs.properties ?? {};
  const filtered = Object.fromEntries(Object.entries(inputs).filter(([key]) => key in known));
  const warnings = Object.keys(inputs)
    .filter((key) => !(key in known))
    .map((key) => `Ignored unknown input: ${key}`);
  const validator = inputValidators.get(skill.skill.id) ?? ajv.compile({ ...skill.contract.inputs, additionalProperties: false });
  inputValidators.set(skill.skill.id, validator);
  if (!validator(filtered)) return { ok: false, errors: formatErrors(validator.errors) };
  return { ok: true, inputs: filtered, warnings };
}

export function validateOutputs(skill: SkillArtifact, output: unknown): { ok: true } | { ok: false; errors: string[] } {
  const key = `${skill.skill.id}@${skill.skill.version}`;
  const validator = outputValidators.get(key) ?? ajv.compile(skill.contract.outputs);
  outputValidators.set(key, validator);
  return validator(output) ? { ok: true } : { ok: false, errors: formatErrors(validator.errors).map((error) => `outputs ${error}`) };
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || "inputs"} ${error.message ?? "is invalid"}`);
}

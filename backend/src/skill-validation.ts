import { createRequire } from "node:module";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { SkillArtifact } from "./types.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as new (options?: Record<string, unknown>) => {
  compile(schema: unknown): ValidateFunction;
};
const ajv = new Ajv({ allErrors: true, strict: false });
const inputValidators = new Map<string, ValidateFunction>();

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
  if (skill && (!isRecord(skill.site) || typeof skill.site.domain !== "string" || typeof skill.site.display !== "string" || typeof skill.version !== "number" || typeof skill.forged_at !== "string" || !isRecord(skill.author) || !Array.isArray(skill.tags) || typeof skill.sensitive !== "boolean")) errors.push("skill metadata is incomplete");
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
    if (typeof raw.id !== "string" || !["navigate", "fill", "click", "extract"].includes(String(raw.action)) || typeof raw.target_description !== "string" || !Number.isInteger(raw.timeout_ms) || Number(raw.timeout_ms) < 1) errors.push(`workflow.steps[${index}] has unsupported or missing fields`);
    const positiveKeys = ["contains", "url_contains", "element_present", "field_value_equals", "min_items"];
    const expectation = isRecord(raw.expect) ? raw.expect : null;
    if (!expectation || !positiveKeys.some((key) => key in expectation) || !("not_contains" in expectation)) {
      errors.push(`workflow.steps[${index}].expect needs positive and negative checks`);
    }
    if (typeof raw.sensitive !== "boolean") errors.push(`workflow.steps[${index}].sensitive is required`);
  }
  const history = isRecord(value) && Array.isArray(value.history) ? value.history : null;
  if (!history || history.length > 10) errors.push("history must be an array capped at ten entries");
  if (!isRecord(value) || !isRecord(value.vitals)) errors.push("vitals are required");
  const serialized = JSON.stringify(value).toLowerCase();
  if (/"(password|api_key|apikey|cookie|otp|captcha_answer|credit_card)"\s*:/.test(serialized)) errors.push("artifacts must not contain credentials or sensitive values");
  if (contract && isRecord(contract.inputs) && isRecord(contract.outputs)) { validateSchema(contract.inputs, "contract.inputs", errors); validateSchema(contract.outputs, "contract.outputs", errors); }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, skill: value as unknown as SkillArtifact };
}

function validateSchema(schema: Record<string, unknown>, path: string, errors: string[]): void {
  if (!["object", "string", "integer", "number", "boolean", "array"].includes(String(schema.type))) errors.push(`${path}.type is unsupported`);
  if (schema.type === "object" && schema.properties !== undefined && !isRecord(schema.properties)) errors.push(`${path}.properties must be an object`);
  if (isRecord(schema.properties)) for (const [key, child] of Object.entries(schema.properties)) { if (!isRecord(child)) errors.push(`${path}.properties.${key} must be a schema`); else validateSchema(child, `${path}.properties.${key}`, errors); }
  if (schema.type === "array" && !isRecord(schema.items)) errors.push(`${path}.items is required for arrays`);
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

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || "inputs"} ${error.message ?? "is invalid"}`);
}

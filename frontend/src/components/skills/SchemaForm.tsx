import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import type { JsonSchema } from "@/lib/types";
import { Field, inputClass } from "@/components/ui/Field";
import { PillButton } from "@/components/ui/PillButton";

interface Props {
  schema: JsonSchema;
  running: boolean;
  statusText: string | null;
  onRun: (values: Record<string, unknown>) => void;
}

function labelFor(key: string): string {
  return key.replaceAll("_", " ");
}

function validate(key: string, schema: JsonSchema, required: boolean, raw: string): string | null {
  const value = raw.trim();
  if (value === "") {
    return required ? (schema.description ? `Required — ${schema.description}.` : "This field is required.") : null;
  }
  if ((schema.type === "integer" || schema.type === "number") && Number.isNaN(Number(value))) {
    return "Numbers only here.";
  }
  if (schema.type === "integer" && !/^-?\d+$/.test(value)) {
    return "Whole numbers only here.";
  }
  if (schema.pattern) {
    try {
      if (!new RegExp(schema.pattern).test(value)) {
        return schema.description
          ? `That doesn't look right — expected ${schema.description}.`
          : "That doesn't match the expected format.";
      }
    } catch {
      /* unanchorable pattern — let the gateway decide */
    }
  }
  return null;
}

/**
 * The Use tab's form, generated from the skill's input contract. Inline
 * validation fires on blur first, then live once a field has been touched —
 * never aggressively mid-first-keystroke.
 */
export function SchemaForm({ schema, running, statusText, onRun }: Props) {
  const fields = useMemo(() => Object.entries(schema.properties ?? {}), [schema]);
  const required = useMemo(() => new Set(schema.required ?? []), [schema]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors: Record<string, string | null> = {};
  for (const [key, fieldSchema] of fields) {
    errors[key] = validate(key, fieldSchema, required.has(key), values[key] ?? "");
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (running) return;
    const allTouched: Record<string, boolean> = {};
    for (const [key] of fields) allTouched[key] = true;
    setTouched(allTouched);
    if (fields.some(([key]) => errors[key])) return;

    const out: Record<string, unknown> = {};
    for (const [key, fieldSchema] of fields) {
      const raw = (values[key] ?? "").trim();
      if (raw === "") continue;
      out[key] =
        fieldSchema.type === "integer" || fieldSchema.type === "number" ? Number(raw) : raw;
    }
    onRun(out);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {fields.length === 0 && (
        <p className="text-sm text-muted">No inputs needed — just run it.</p>
      )}
      {fields.map(([key, fieldSchema]) => (
        <Field
          key={key}
          label={labelFor(key)}
          htmlFor={`field-${key}`}
          error={touched[key] ? errors[key] : null}
          hint={!touched[key] || !errors[key] ? fieldSchema.description : undefined}
        >
          <input
            id={`field-${key}`}
            type="text"
            inputMode={fieldSchema.type === "integer" || fieldSchema.type === "number" ? "numeric" : "text"}
            value={values[key] ?? ""}
            disabled={running}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
            className={`${inputClass} ${touched[key] && errors[key] ? "border-rose/50" : ""}`}
          />
        </Field>
      ))}

      <PillButton type="submit" variant="accent" disabled={running} className="w-full">
        {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bg" />}
        <motion.span
          key={running ? (statusText ?? "working") : "idle"}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {running ? (statusText ?? "Working…") : "Run skill"}
        </motion.span>
      </PillButton>
    </form>
  );
}

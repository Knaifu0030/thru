import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import type { RunEnvelope } from "@/lib/types";
import { fmtMs } from "@/lib/format";
import { HealPulse } from "@/components/ui/HealPulse";
import { Badge } from "@/components/ui/Badge";

interface Props {
  envelope: RunEnvelope;
  renderHint?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function KeyValue({ data }: { data: Record<string, unknown> }) {
  const rows = Object.entries(data).filter(([, v]) => typeof v !== "object" || v === null);
  if (rows.length === 0) return null;
  return (
    <dl className="space-y-0.5">
      {rows.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[130px_1fr] gap-3 py-1.5">
          <dt className="label pt-0.5 normal-case">{key.replaceAll("_", " ")}</dt>
          <dd className="break-words text-sm text-ink">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function DataTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} className="label px-3 py-2.5 text-left normal-case">
                {col.replaceAll("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-white/[0.06]">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2.5 text-ink">
                  {String(row[col] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RenderedData({ data, hint }: { data: unknown; hint?: string }) {
  if (data === null || data === undefined) return null;

  if (hint === "text" && isRecord(data) && typeof data.text === "string") {
    return (
      <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {data.text}
      </p>
    );
  }

  if (hint?.startsWith("table:") && isRecord(data)) {
    const path = hint.slice("table:".length);
    const rows = data[path];
    if (Array.isArray(rows)) {
      const scalars = Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== path),
      );
      return (
        <div className="space-y-3">
          <KeyValue data={scalars} />
          <DataTable rows={rows as Array<Record<string, unknown>>} />
        </div>
      );
    }
  }

  if ((hint === "keyvalue" || hint === undefined) && isRecord(data)) {
    return <KeyValue data={data} />;
  }

  return (
    <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/25 p-4 font-mono text-xs text-ink/90">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

/** A run's outcome, rendered per the skill's render_hint — never a wall of JSON. */
export function ResultView({ envelope, renderHint }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5"
    >
      {envelope.status === "success" && (
        <p className="flex items-center gap-2 text-sm text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          Ran in {fmtMs(envelope.timing_ms)}
        </p>
      )}

      {envelope.status === "healed_success" && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-ink">
            <HealPulse />
            Healed itself mid-run — finished in {fmtMs(envelope.timing_ms)}
            <Badge tone="sage">now v{envelope.version}</Badge>
          </p>
          {envelope.healing.map((h, i) => (
            <p key={i} className="border-l-2 border-sage/50 pl-3 text-xs text-muted">
              {h.note}
            </p>
          ))}
        </div>
      )}

      {envelope.status === "needs_human" && envelope.needs_human && (
        <div className="flex gap-3">
          <Lock size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="text-sm text-ink">Paused for your approval</p>
            <p className="mt-1 text-sm text-muted">{envelope.needs_human.reason}</p>
            <p className="mt-2 text-xs text-faint">{envelope.needs_human.how}</p>
          </div>
        </div>
      )}

      {envelope.status === "portal_error" && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-rose" />
            The portal didn't cooperate this time
          </p>
          {envelope.healing.map((h, i) => (
            <p key={i} className="border-l-2 border-rose/40 pl-3 text-xs text-muted">
              Tried {h.rung}: {h.note}
            </p>
          ))}
        </div>
      )}

      {envelope.status === "invalid_input" && (
        <p className="flex items-center gap-2 text-sm text-rose">
          <span className="h-1.5 w-1.5 rounded-full bg-rose" />
          The gateway rejected those inputs — check the formats above.
        </p>
      )}

      <RenderedData data={envelope.data} hint={renderHint} />

      {envelope.warnings && envelope.warnings.length > 0 && (
        <div className="space-y-1">
          {envelope.warnings.map((w, i) => (
            <p key={i} className="text-xs text-faint">
              {w}
            </p>
          ))}
        </div>
      )}

      {envelope.narration && envelope.narration.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-faint transition-colors duration-200 hover:text-muted">
            What it did · {envelope.narration.length} steps
          </summary>
          <div className="mt-2 space-y-1.5 border-l border-white/10 pl-3">
            {envelope.narration.map((line, i) => (
              <p key={i} className="text-xs text-muted">
                {line}
              </p>
            ))}
          </div>
        </details>
      )}
    </motion.div>
  );
}

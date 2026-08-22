import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, X } from "lucide-react";
import type { RunEnvelope, SkillArtifact } from "@/lib/types";
import { api, curlFor, GATEWAY_BASE, mcpToolName } from "@/lib/api";
import { fmtDate, stamp } from "@/lib/format";
import { useRegistry, useUI } from "@/lib/store";
import { useFocusTrap } from "@/lib/hooks";
import { TabGroup } from "@/components/ui/TabGroup";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { SchemaForm } from "./SchemaForm";
import { ResultView } from "./ResultView";

/* ── Use tab ──────────────────────────────────────────────────────────── */

function UseTab({ artifact }: { artifact: SkillArtifact }) {
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [result, setResult] = useState<RunEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (values: Record<string, unknown>) => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const envelope = await api.runSkill(artifact.skill.id, values, setStatusText);
      setResult(envelope);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The run failed before it started.");
    } finally {
      setRunning(false);
      setStatusText(null);
    }
  };

  return (
    <div className="space-y-5">
      <SchemaForm
        schema={artifact.contract.inputs}
        running={running}
        statusText={statusText}
        onRun={run}
      />
      {error && <p className="text-sm text-rose">{error}</p>}
      {result && <ResultView envelope={result} renderHint={artifact.contract.render_hint} />}
    </div>
  );
}

/* ── API + Agent tabs ─────────────────────────────────────────────────── */

function GatedNote() {
  return (
    <p className="text-xs text-faint">
      This skill is gated — calls return <span className="font-mono">needs_human</span> until someone
      approves the sensitive step on screen.
    </p>
  );
}

function ApiTab({ artifact }: { artifact: SkillArtifact }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="label mb-2">REST</p>
        <CopyBlock text={curlFor(artifact)} ariaLabel="Copy curl command" />
      </div>
      <p className="text-xs text-muted">
        Every surface returns the same envelope — status, data, and the healing trail.
      </p>
      {artifact.skill.sensitive && <GatedNote />}
    </div>
  );
}

function AgentTab({ artifact }: { artifact: SkillArtifact }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="label mb-2">MCP tool</p>
        <CopyBlock text={mcpToolName(artifact.skill.id)} ariaLabel="Copy MCP tool name" />
      </div>
      <div>
        <p className="label mb-2">Endpoint</p>
        <CopyBlock text={`${GATEWAY_BASE}/mcp`} ariaLabel="Copy MCP endpoint" />
      </div>
      <p className="text-xs text-muted">
        Add the endpoint to your MCP client's server list — the tool registers itself.
      </p>
      {artifact.skill.sensitive && <GatedNote />}
    </div>
  );
}

/* ── Version timeline ─────────────────────────────────────────────────── */

function changeSummary(artifact: SkillArtifact, version: number): string {
  if (version === 1) return `Created ${fmtDate(artifact.skill.forged_at)}`;
  const entry = artifact.history.find((h) => h.version === version - 1);
  if (!entry) return "Updated";
  const target = entry.previous_step.target_description;
  const when = stamp(entry.at);
  switch (entry.reason) {
    case "heal:relocate":
      return `Relocated '${target}' after the site changed — ${when}`;
    case "heal:reforge":
      return `Re-explored '${target}' from scratch — ${when}`;
    case "runtime:sensitivity-added":
      return `Marked '${target}' sensitive — now waits for approval — ${when}`;
    default:
      return `${entry.reason} — ${when}`;
  }
}

function VersionTimeline({ artifact }: { artifact: SkillArtifact }) {
  const current = artifact.skill.version;
  const [selected, setSelected] = useState(current);
  useEffect(() => setSelected(current), [current, artifact.skill.id]);

  const versions = Array.from({ length: current }, (_, i) => i + 1);

  return (
    <div>
      <p className="label mb-3">Version history</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {versions.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setSelected(v)}
            aria-pressed={selected === v}
            className={`shrink-0 rounded-[2px] border px-3 py-1.5 font-mono text-xs transition-colors duration-200 ${
              v === current
                ? "border-accent/50 bg-accent/10 text-accent"
                : selected === v
                  ? "border-white/30 text-ink"
                  : "border-white/10 text-muted hover:border-white/25 hover:text-ink"
            }`}
          >
            v{v}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{changeSummary(artifact, selected)}</p>
    </div>
  );
}

/* ── The drawer ───────────────────────────────────────────────────────── */

const TABS = [
  { id: "use", label: "Use" },
  { id: "api", label: "API" },
  { id: "agent", label: "Agent" },
];

export function SkillDrawer() {
  const { drawerId, closeDrawer } = useUI();
  const { skills } = useRegistry();
  const [tab, setTab] = useState("use");

  const artifact = skills?.find((s) => s.skill.id === drawerId) ?? null;
  const open = drawerId !== null;
  const ref = useFocusTrap<HTMLDivElement>(open, closeDrawer);

  useEffect(() => setTab("use"), [drawerId]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          className="fixed inset-0 z-50 bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={closeDrawer}
        />
      )}
      {open && (
        <motion.div
          key="panel"
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={artifact?.skill.name ?? "Skill detail"}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-white/15 bg-surface sm:w-[480px]"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 330, damping: 36 }}
        >
            {artifact ? (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] p-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{artifact.skill.name}</h2>
                      {artifact.skill.sensitive && (
                        <Lock size={15} strokeWidth={1.5} className="text-muted" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-faint">{artifact.skill.site.domain}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    aria-label="Close"
                    className="rounded-[2px] border border-white/10 p-2 text-muted transition-colors duration-200 hover:border-white/25 hover:text-ink"
                  >
                    <X size={15} strokeWidth={1.5} />
                  </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                  {artifact.skill.sensitive && (
                    <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <Lock size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
                      <div>
                        <p className="text-sm text-ink">Requires human approval</p>
                        <p className="mt-1 text-xs text-muted">
                          Sensitive steps — sign-ins, OTPs, payments — always pause for a person.
                          THRU never stores credentials for this site.
                        </p>
                      </div>
                    </div>
                  )}

                  <TabGroup name="skill-detail" tabs={TABS} active={tab} onChange={setTab} />

                  {/* keyed mount fade — no nested AnimatePresence inside an
                      exiting overlay (it deadlocks the drawer's unmount) */}
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    {tab === "use" && <UseTab key={artifact.skill.id} artifact={artifact} />}
                    {tab === "api" && <ApiTab artifact={artifact} />}
                    {tab === "agent" && <AgentTab artifact={artifact} />}
                  </motion.div>

                  <div className="border-t border-white/[0.06] pt-5">
                    <VersionTimeline artifact={artifact} />
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6">
                <p className="text-sm text-muted">This skill isn't in the registry anymore.</p>
              </div>
            )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

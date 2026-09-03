import { useEffect, useState } from "react";
import type { ActivityEvent, ActivityKind } from "@/lib/types";
import { api } from "@/lib/api";
import { stamp } from "@/lib/format";
import { useRegistry, useUI } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { SkeletonRow } from "@/components/ui/Skeleton";

const FILTERS: Array<{ id: "all" | ActivityKind; label: string }> = [
  { id: "all", label: "All" },
  { id: "run", label: "Runs" },
  { id: "heal", label: "Heals" },
  { id: "gate", label: "Gates fired" },
  { id: "teaching", label: "Teaching" },
];

const KIND_BADGE: Record<ActivityKind, { tone: "neutral" | "sage" | "rose" | "accent"; label: string }> = {
  run: { tone: "neutral", label: "Run" },
  heal: { tone: "sage", label: "Heal" },
  gate: { tone: "rose", label: "Gate" },
  forged: { tone: "accent", label: "Created" },
  teaching: { tone: "accent", label: "Teaching" },
};

/** Left border marks the event class without shouting — heals sage, gates rose. */
function rowEdge(kind: ActivityKind): string {
  if (kind === "heal") return "border-l-sage/60";
  if (kind === "gate") return "border-l-rose/50";
  return "border-l-transparent";
}

export function Activity() {
  const { skills } = useRegistry();
  const { openSkill } = useUI();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [filter, setFilter] = useState<"all" | ActivityKind>("all");
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  useEffect(() => {
    let stale = false;
    api
      .getActivityLog()
      .then((e) => !stale && setEvents(e))
      .catch(() => !stale && setEvents([]));
    return () => {
      stale = true;
    };
  }, [skills]);

  const filtered = (events ?? []).filter((e) => filter === "all" || e.kind === filter);
  const decide = async (event: ActivityEvent, decision: "approved" | "denied") => {
    if (!event.runId) return;
    try { await api.recordGateApproval(event.runId, decision, "Recorded from THRU activity."); setDecisions((current) => ({ ...current, [event.id]: decision })); }
    catch (error) { setDecisions((current) => ({ ...current, [event.id]: error instanceof Error ? error.message : "Approval failed." })); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-raised">
        {events === null ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {filter === "gate"
              ? "No gates have fired — nothing sensitive has been touched."
              : filter === "heal"
                ? "No heals yet — the sites are holding still."
                : "Nothing recorded here yet."}
          </p>
        ) : (
          filtered.map((event) => {
            const badge = KIND_BADGE[event.kind];
            return (
              <div
                key={event.id}
                className={`flex items-start gap-4 border-b border-white/[0.06] border-l-2 px-4 py-3.5 last:border-b-0 ${rowEdge(event.kind)}`}
              >
                <span className="w-28 shrink-0 pt-0.5 font-mono text-xs text-faint">
                  {stamp(event.at)}
                </span>
                <span className="w-16 shrink-0">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </span>
                <div className="min-w-0 flex-1 text-sm text-muted">
                  {event.skillId === "teaching" ? <span className="text-ink">Teaching session</span> : <button type="button" onClick={() => openSkill(event.skillId)} className="text-ink transition-colors duration-200 hover:text-accent">{event.skillName}</button>}
                  <span className="mx-1.5 text-faint">·</span>
                  {event.summary}
                  {event.gatePending && event.runId && !decisions[event.id] && <div className="mt-2 flex gap-2"><button type="button" onClick={() => void decide(event, "approved")} className="rounded border border-emerald/30 px-2 py-1 text-[11px] text-emerald hover:bg-emerald/10">Record approval</button><button type="button" onClick={() => void decide(event, "denied")} className="rounded border border-rose/30 px-2 py-1 text-[11px] text-rose hover:bg-rose/10">Record denial</button></div>}
                  {decisions[event.id] && <p className="mt-1 text-[11px] text-faint">{decisions[event.id] === "approved" || decisions[event.id] === "denied" ? `Decision recorded: ${decisions[event.id]}.` : decisions[event.id]}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

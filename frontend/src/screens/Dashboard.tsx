import { useEffect, useState } from "react";
import type { DashboardSummary, SkillArtifact } from "@/lib/types";
import { api } from "@/lib/api";
import { timeAgo, successRatio } from "@/lib/format";
import { useRegistry, useUI } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { CountUp } from "@/components/ui/CountUp";
import { PillButton } from "@/components/ui/PillButton";
import { Skeleton, SkeletonStat } from "@/components/ui/Skeleton";
import { RunsChart } from "@/components/dashboard/RunsChart";

function StatCard({ label, value, sub, decimals, render }: {
  label: string;
  value: number | null;
  sub: string;
  decimals?: number;
  render?: (n: number) => string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-raised p-5">
      <p className="label">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.01em]">
        {value === null ? "Unavailable" : <CountUp value={value} decimals={decimals} render={render} />}
      </p>
      <p className="mt-1 text-xs text-faint">{sub}</p>
    </div>
  );
}

function successDot(artifact: SkillArtifact): string {
  const ratio = successRatio(artifact.vitals.successes, artifact.vitals.runs);
  if (ratio === null) return "bg-faint";
  if (ratio >= 0.9) return "bg-sage";
  if (ratio >= 0.7) return "bg-muted";
  return "bg-rose";
}

export function Dashboard() {
  const { skills } = useRegistry();
  const { openSkill, openTeaching } = useUI();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    let stale = false;
    api
      .getDashboardSummary()
      .then((s) => !stale && setSummary(s))
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [skills]);

  if (!summary) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-raised p-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-10 w-36" />
          </div>
          <div className="rounded-3xl border border-white/10 bg-raised p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-6 h-8 w-36 rounded-full" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </div>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-raised p-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-5 h-52 w-full rounded-xl" />
          </div>
          <div className="rounded-3xl border border-white/10 bg-raised p-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-3 h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  const recent = summary.recentSkillIds
    .map((id) => (skills ?? []).find((s) => s.skill.id === id))
    .filter((s): s is SkillArtifact => !!s);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Hero stat */}
        <div className="rounded-3xl border border-white/10 bg-raised p-6">
          <p className="label">Total runs</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-semibold tracking-[-0.02em]">
              <CountUp value={summary.totalRuns} />
            </span>
            {summary.trendPct !== null && (
              <Badge tone={summary.trendPct >= 0 ? "sage" : "rose"}>
                {summary.trendPct >= 0 ? "+" : ""}
                {summary.trendPct}% vs last week
              </Badge>
            )}
          </div>
          <p className="mt-3 text-sm text-muted">
            Across {summary.totalSkills} skill{summary.totalSkills === 1 ? "" : "s"} — every run a
            button press, an API call, or an agent at work.
          </p>
        </div>

        {/* Teach promo */}
        <div className="flex flex-col justify-between rounded-3xl border border-accent/25 bg-raised p-6">
          <div>
            <h3 className="text-base font-semibold">
              Teach it once. <span className="text-accent">Use it three ways.</span>
            </h3>
            <p className="mt-2 text-sm text-muted">
              Show THRU a workflow in plain English — it comes back as a button, a REST call, and
              an MCP tool.
            </p>
          </div>
          <PillButton variant="accent" className="mt-4 self-start" onClick={openTeaching}>
            Teach a new skill
          </PillButton>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Skills taught" value={summary.totalSkills} sub="live on all three surfaces" />
        <StatCard
          label="Heal events"
          value={summary.healEventsThisWeek}
          sub="self-repairs this week"
        />
        <StatCard
          label="Time saved"
          value={summary.timeSavedHrs}
          decimals={1}
          render={(n) => `${n} hrs`}
          sub="available when instrumented"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <RunsChart series={summary.series} estimated={summary.estimatedSeries} />

        <div className="rounded-3xl border border-white/10 bg-raised p-4">
          <p className="label px-2 pt-2">Recently used</p>
          <div className="mt-2 space-y-1">
            {recent.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted">No runs yet — teach a skill and try it.</p>
            )}
            {recent.map((artifact) => (
              <button
                key={artifact.skill.id}
                type="button"
                onClick={() => openSkill(artifact.skill.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.04]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${successDot(artifact)}`} />
                  <span className="truncate text-sm text-ink">{artifact.skill.name}</span>
                </span>
                <span className="shrink-0 text-xs text-faint">{timeAgo(artifact.vitals.last_run)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

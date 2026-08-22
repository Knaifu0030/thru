import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import type { SkillArtifact } from "@/lib/types";
import { fmtMs, pct, timeAgo } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { HealPulse } from "@/components/ui/HealPulse";

const HEAL_RECENT_MS = 7 * 24 * 3600_000;

export function healRecently(artifact: SkillArtifact): boolean {
  const at = artifact.vitals.last_heal?.at;
  return !!at && Date.now() - new Date(at).getTime() < HEAL_RECENT_MS;
}

/** Card content, shared by the grid card and the teaching stub's settled state. */
export function SkillCardBody({ artifact }: { artifact: SkillArtifact }) {
  const { skill, vitals } = artifact;
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug">{skill.name}</h3>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {skill.sensitive && (
            <Lock size={14} strokeWidth={1.5} className="text-muted" aria-label="Requires human approval" />
          )}
          <Badge>v{skill.version}</Badge>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{skill.description}</p>
      <p className="mt-2 text-xs text-faint">{skill.site.domain}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {vitals.runs === 0
            ? "No runs yet"
            : `${vitals.runs.toLocaleString("en-IN")} runs · ${pct(vitals.successes, vitals.runs)} · ${fmtMs(vitals.avg_ms)} avg`}
        </span>
        {healRecently(artifact) && <HealPulse label={`healed ${timeAgo(artifact.vitals.last_heal!.at ?? null)}`} />}
      </div>
    </>
  );
}

interface Props {
  artifact: SkillArtifact;
  onOpen: (id: string) => void;
}

export function SkillCard({ artifact, onOpen }: Props) {
  return (
    <motion.button
      layout
      type="button"
      onClick={() => onOpen(artifact.skill.id)}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="w-full rounded-2xl border border-white/10 bg-raised p-5 text-left transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-white/30"
    >
      <SkillCardBody artifact={artifact} />
    </motion.button>
  );
}

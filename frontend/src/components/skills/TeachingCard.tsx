import { useEffect } from "react";
import { motion } from "framer-motion";
import { useTHRU, useUI } from "@/lib/store";
import { Spark } from "@/components/shell/Wordmark";
import { NarrationStream, QuestionPills } from "./NarrationStream";
import { SkillCardBody } from "./SkillCard";

/**
 * The live stub that appears in the grid the instant teaching starts.
 * It pulses while teaching, streams narration, and then — same element,
 * no swap — settles into the finished card with one quiet accent pulse.
 */
export function TeachingCard({ onOpen }: { onOpen: (id: string) => void }) {
  const { session, answer, finish } = useTHRU();
  const { teachOpen } = useUI();

  const settled = session?.stage === "done" && session.skill;

  // Once settled, hold the morphed card briefly, then hand over to the grid.
  // While the teaching modal is open, its success state owns the session —
  // don't clear it out from under the modal.
  useEffect(() => {
    if (!settled || teachOpen) return;
    const t = setTimeout(finish, 2400);
    return () => clearTimeout(t);
  }, [settled, teachOpen, finish]);

  if (!session) return null;

  if (settled && session.skill) {
    const skill = session.skill;
    return (
      <motion.button
        layout
        type="button"
        onClick={() => onOpen(skill.skill.id)}
        className="settle-pulse w-full rounded-2xl border border-white/10 bg-raised p-5 text-left"
      >
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut" }}>
          <SkillCardBody artifact={skill} />
        </motion.div>
      </motion.button>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`w-full rounded-2xl border bg-raised p-5 text-left ${
        session.stage === "error" ? "border-rose/40" : "teach-pulse border-accent/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <Spark size={14} className="text-accent" />
        <span className="label text-accent">{session.stage === "error" ? "THRU paused" : "Teaching"}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug">{session.draft.name}</h3>
      <p className="mt-0.5 text-xs text-faint">{session.draft.domain}</p>

      <div className="mt-3 min-h-[56px]">
        {session.stage === "error" ? (
          <p className="text-sm text-rose">{session.error}</p>
        ) : (
          <>
            <NarrationStream lines={session.lines} tail={2} />
            {session.question && <QuestionPills question={session.question} onAnswer={answer} />}
          </>
        )}
      </div>
    </motion.div>
  );
}

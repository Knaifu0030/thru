import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useTHRU, useUI } from "@/lib/store";
import { useFocusTrap } from "@/lib/hooks";
import { Field, inputClass, textareaClass } from "@/components/ui/Field";
import { PillButton } from "@/components/ui/PillButton";
import { NarrationStream, QuestionPills } from "@/components/skills/NarrationStream";

function validUrl(raw: string): boolean {
  try {
    new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return raw.trim().length > 3 && raw.includes(".");
  } catch {
    return false;
  }
}

/**
 * Teaching a skill: two calm inputs, then the same view becomes a live
 * narration stream. Questions land inline as pills. Closing mid-teach keeps
 * the workflow running — the teaching card on the Marketplace carries it on.
 */
export function THRUModal() {
  const { teachOpen, closeTeaching, openSkill } = useUI();
  const teaching = useTHRU();

  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [touched, setTouched] = useState<{ url?: boolean; goal?: boolean }>({});

  const ref = useFocusTrap<HTMLDivElement>(teachOpen, closeTeaching);

  const urlError =
    touched.url && !validUrl(url) ? "That doesn't look like a site address — try something like irctc.co.in." : null;
  const goalError =
    touched.goal && goal.trim().length < 8 ? "Give it a full sentence — what should this skill do?" : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ url: true, goal: true });
    if (!validUrl(url) || goal.trim().length < 8) return;
    teaching.start(goal.trim(), url.trim());
  };

  const session = teaching.session;

  const viewSkill = () => {
    const id = session?.skill?.skill.id;
    teaching.finish();
    closeTeaching();
    if (id) openSkill(id);
    setUrl("");
    setGoal("");
    setTouched({});
  };

  const reset = () => {
    setUrl("");
    setGoal("");
    setTouched({});
  };

  return (
    <AnimatePresence>
      {teachOpen && (
        <motion.div
          key="scrim"
          className="fixed inset-0 z-50 bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={closeTeaching}
        />
      )}
      {teachOpen && (
        <motion.div
          key="panel"
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label="Teach a new skill"
            className="pointer-events-auto w-full max-w-lg border border-white/15 bg-surface p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">
                {session ? (
                  <>
                    Teaching <span className="text-accent">{session.draft.name}</span>
                  </>
                ) : (
                  <>
                    Teach a <span className="text-accent">new skill</span>
                  </>
                )}
              </h2>
              <button
                type="button"
                onClick={closeTeaching}
                aria-label="Close"
                className="rounded-[2px] border border-white/10 p-2 text-muted transition-colors duration-200 hover:border-white/25 hover:text-ink"
              >
                <X size={15} strokeWidth={1.5} />
              </button>
            </div>

            <div className="mt-5">
              {!session && (
                <form onSubmit={submit} noValidate className="space-y-5">
                  <Field label="Website" htmlFor="teach-url" error={urlError}>
                    <input
                      id="teach-url"
                      data-autofocus
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, url: true }))}
                      placeholder="irctc.co.in"
                      className={`${inputClass} ${urlError ? "border-rose/50" : ""}`}
                    />
                  </Field>
                  <Field label="What should it do?" htmlFor="teach-goal" error={goalError}>
                    <textarea
                      id="teach-goal"
                      rows={3}
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, goal: true }))}
                      placeholder="Check the status of a train PNR and tell me the coach and berth."
                      className={`${textareaClass} ${goalError ? "border-rose/50" : ""}`}
                    />
                  </Field>
                  <PillButton type="submit" variant="accent" className="w-full">
                    Start teaching
                  </PillButton>
                  <p className="text-xs text-faint">
                    THRU watches the site, not your keystrokes. Anything sensitive — sign-ins,
                    OTPs, payments — gets gated behind your approval automatically.
                  </p>
                </form>
              )}

              {session && (session.stage === "narrating" || session.stage === "question") && (
                <div>
                  <div className="max-h-72 overflow-y-auto pr-1">
                    <NarrationStream lines={session.lines} />
                    {session.question && (
                      <QuestionPills question={session.question} onAnswer={teaching.answer} />
                    )}
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                    <PillButton variant="ghost" size="sm" onClick={closeTeaching}>
                      Continue in background
                    </PillButton>
                    <PillButton
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        teaching.cancel();
                        reset();
                      }}
                    >
                      Discard
                    </PillButton>
                  </div>
                </div>
              )}

              {session?.stage === "done" && session.skill && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <p className="flex items-center gap-2.5 text-sm text-ink">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-sage/15 text-sage">
                      <Check size={13} strokeWidth={1.5} />
                    </span>
                    Skill ready.
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {session.skill.skill.name} is live — a button here, a REST endpoint, and an MCP
                    tool, all at once.
                  </p>
                  <div className="mt-5 flex gap-3">
                    <PillButton variant="accent" onClick={viewSkill}>
                      View skill
                    </PillButton>
                    <PillButton
                      variant="ghost"
                      onClick={() => {
                        closeTeaching();
                        reset();
                      }}
                    >
                      Done
                    </PillButton>
                  </div>
                </motion.div>
              )}

              {session?.stage === "error" && (
                <div>
                  <p className="text-sm text-rose">{session.error}</p>
                  <PillButton
                    variant="ghost"
                    className="mt-4"
                    onClick={() => {
                      teaching.cancel();
                      reset();
                    }}
                  >
                    Close
                  </PillButton>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, Trash2, X } from "lucide-react";
import { useTHRU, useUI } from "@/lib/store";
import { useFocusTrap } from "@/lib/hooks";
import { Field, inputClass, textareaClass } from "@/components/ui/Field";
import { PillButton } from "@/components/ui/PillButton";
import { NarrationStream, QuestionPills } from "@/components/skills/NarrationStream";
import type { SkillArtifact, TeachingActionInput, TeachingActionType } from "@/lib/types";

type GuidedStepDraft = TeachingActionInput;

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
  const [sampleInputs, setSampleInputs] = useState("");
  const [guidedSteps, setGuidedSteps] = useState<GuidedStepDraft[]>([]);
  const [reviewArtifact, setReviewArtifact] = useState<SkillArtifact | null>(null);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [touched, setTouched] = useState<{ url?: boolean; goal?: boolean }>({});
  const session = teaching.session;

  const ref = useFocusTrap<HTMLDivElement>(teachOpen, closeTeaching);

  useEffect(() => {
    if (session?.draftArtifact) { setReviewArtifact(session.draftArtifact); setReviewSaved(false); }
  }, [session?.draftArtifact]);

  const urlError =
    touched.url && !validUrl(url) ? "That doesn't look like a site address — try something like irctc.co.in." : null;
  const goalError =
    touched.goal && goal.trim().length < 8 ? "Give it a full sentence — what should this skill do?" : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ url: true, goal: true });
    if (!validUrl(url) || goal.trim().length < 8) return;
    let parsed: Record<string, unknown> | undefined;
    if (sampleInputs.trim()) {
      try { const value: unknown = JSON.parse(sampleInputs); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); parsed = value as Record<string, unknown>; }
      catch { return; }
    }
    if (guidedSteps.some((step) => (step.type !== "wait" && !step.target.trim()) || (step.type === "fill" && !step.value?.trim()) || (step.type === "wait" && step.value && (!/^\d+$/.test(step.value) || Number(step.value) < 100 || Number(step.value) > 30000)))) {
      setStepError("Finish every guided step; fill steps need an input key and waits must be 100–30000 ms.");
      return;
    }
    setStepError(null);
    teaching.start(goal.trim(), url.trim(), parsed, guidedSteps);
  };

  const viewSkill = () => {
    const id = session?.skill?.skill.id;
    teaching.finish();
    closeTeaching();
    if (id) openSkill(id);
    setUrl("");
    setGoal("");
    setSampleInputs("");
    setGuidedSteps([]);
    setReviewArtifact(null);
    setReviewSaved(false);
    setStepError(null);
    setTouched({});
  };

  const reset = () => {
    setUrl("");
    setGoal("");
    setSampleInputs("");
    setGuidedSteps([]);
    setReviewArtifact(null);
    setReviewSaved(false);
    setStepError(null);
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
                  <Field label="Sample inputs (optional JSON)" htmlFor="teach-samples">
                    <textarea
                      id="teach-samples"
                      rows={2}
                      value={sampleInputs}
                      onChange={(e) => setSampleInputs(e.target.value)}
                      placeholder={'{"query":"demo"}'}
                      className={textareaClass}
                    />
                  </Field>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="label" htmlFor="guided-step-0">Guided steps (optional)</label>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-accent hover:text-ink"
                        onClick={() => setGuidedSteps((steps) => [...steps, { type: "click", target: "" }])}
                      >
                        <Plus size={13} /> Add step
                      </button>
                    </div>
                    <p className="text-xs leading-5 text-faint">Describe the ordered browser actions to replay. Use CSS selectors, <code>label:Text</code>, or <code>text:Button</code> targets.</p>
                    {guidedSteps.map((step, index) => (
                      <div key={`${index}-${step.type}`} className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded border border-white/10 bg-black/15 p-2">
                        <select
                          aria-label={`Guided step ${index + 1} action`}
                          value={step.type}
                          onChange={(event) => setGuidedSteps((steps) => steps.map((item, i) => i === index ? { ...item, type: event.target.value as TeachingActionType } : item))}
                          className="rounded border border-white/10 bg-black/30 px-2 py-2 text-xs text-ink"
                        >
                          <option value="navigate">Navigate</option>
                          <option value="fill">Fill</option>
                          <option value="click">Click</option>
                          <option value="extract">Extract</option>
                          <option value="wait">Wait</option>
                          <option value="switch_tab">Switch tab</option>
                          <option value="switch_frame">Switch frame</option>
                        </select>
                        <div className="space-y-2">
                          <input
                            id={index === 0 ? "guided-step-0" : undefined}
                            aria-label={`Guided step ${index + 1} target`}
                            value={step.target}
                            onChange={(event) => setGuidedSteps((steps) => steps.map((item, i) => i === index ? { ...item, target: event.target.value } : item))}
                            placeholder={step.type === "navigate" ? "https://example.com/next" : step.type === "extract" ? "main or article" : step.type === "wait" ? "Optional: let the page settle" : step.type === "switch_tab" ? "URL fragment or tab title" : step.type === "switch_frame" ? "Frame URL fragment or name" : "#search or label:Search"}
                            className={`${inputClass} py-2 text-xs`}
                          />
                          {(step.type === "fill" || step.type === "wait") && (
                            <input
                              aria-label={step.type === "wait" ? `Guided step ${index + 1} wait milliseconds` : `Guided step ${index + 1} input key`}
                              value={step.value ?? ""}
                              onChange={(event) => setGuidedSteps((steps) => steps.map((item, i) => i === index ? { ...item, value: event.target.value } : item))}
                              placeholder={step.type === "wait" ? "Milliseconds (default 1000)" : "Input key (for example, query)"}
                              className={`${inputClass} py-2 text-xs`}
                            />
                          )}
                        </div>
                        <button type="button" aria-label={`Remove guided step ${index + 1}`} onClick={() => setGuidedSteps((steps) => steps.filter((_, i) => i !== index))} className="p-2 text-muted hover:text-rose"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    {stepError && <p className="text-xs text-rose">{stepError}</p>}
                  </div>
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
                    {reviewArtifact && (
                      <div className="mt-4 space-y-3 rounded border border-white/10 bg-black/15 p-3">
                        <div>
                          <p className="label">Review draft</p>
                          <p className="mt-1 text-xs leading-5 text-faint">Edit the generated contract and locators before replay. THRU will re-check every expectation.</p>
                        </div>
                        <input aria-label="Draft skill name" value={reviewArtifact.skill.name} onChange={(event) => setReviewArtifact((draft) => draft ? { ...draft, skill: { ...draft.skill, name: event.target.value } } : draft)} className={`${inputClass} py-2 text-xs`} placeholder="Skill name" />
                        <textarea aria-label="Draft skill description" value={reviewArtifact.skill.description} onChange={(event) => setReviewArtifact((draft) => draft ? { ...draft, skill: { ...draft.skill, description: event.target.value } } : draft)} className={`${textareaClass} py-2 text-xs`} rows={2} placeholder="Skill description" />
                        <div className="space-y-2">
                          {reviewArtifact.workflow.steps.map((step, index) => (
                            <div key={step.id} className="space-y-2 rounded border border-white/10 p-2">
                              <div className="flex items-center justify-between gap-2"><span className="text-xs text-ink">{index + 1}. {step.action}</span>{step.sensitive && <span className="text-[10px] text-rose">gated</span>}</div>
                              <input aria-label={`Review step ${index + 1} description`} value={step.target_description} onChange={(event) => setReviewArtifact((draft) => draft ? { ...draft, workflow: { ...draft.workflow, steps: draft.workflow.steps.map((item, i) => i === index ? { ...item, target_description: event.target.value } : item) } } : draft)} className={`${inputClass} py-2 text-xs`} placeholder="What this step does" />
                              {step.action === "navigate" && <input aria-label={`Review step ${index + 1} URL`} value={step.url ?? ""} onChange={(event) => setReviewArtifact((draft) => draft ? { ...draft, workflow: { ...draft.workflow, steps: draft.workflow.steps.map((item, i) => i === index ? { ...item, url: event.target.value } : item) } } : draft)} className={`${inputClass} py-2 text-xs`} placeholder="https://example.com" />}
                              {step.action !== "navigate" && step.action !== "wait" && <input aria-label={`Review step ${index + 1} selector`} value={step.selector_primary ?? ""} onChange={(event) => setReviewArtifact((draft) => draft ? { ...draft, workflow: { ...draft.workflow, steps: draft.workflow.steps.map((item, i) => i === index ? { ...item, selector_primary: event.target.value } : item) } } : draft)} className={`${inputClass} py-2 text-xs`} placeholder="CSS selector, label:Text, or frame URL" />}
                              <input aria-label={`Review step ${index + 1} expected text`} value={(step.expect.contains ?? []).join(", ")} onChange={(event) => setReviewArtifact((draft) => draft ? { ...draft, workflow: { ...draft.workflow, steps: draft.workflow.steps.map((item, i) => i === index ? { ...item, expect: { ...item.expect, contains: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } } : item) } } : draft)} className={`${inputClass} py-2 text-xs`} placeholder="Expected text (comma separated)" />
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <button type="button" className="text-xs text-accent hover:text-ink" onClick={() => { if (reviewArtifact) { teaching.editDraft(reviewArtifact); setReviewSaved(true); } }}>{reviewSaved ? "Edits saved" : "Save edits"}</button>
                          <span className="text-[10px] text-faint">{reviewArtifact.workflow.steps.length} steps · output checked on replay</span>
                        </div>
                      </div>
                    )}
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

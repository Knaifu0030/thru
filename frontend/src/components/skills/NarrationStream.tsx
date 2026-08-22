import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { THRUQuestion } from "@/lib/types";

interface StreamProps {
  lines: string[];
  /** Show only the last N lines (for compact contexts like the stub card). */
  tail?: number;
  className?: string;
}

/** Narration lines arrive one at a time with a soft fade+slide — never a typewriter. */
export function NarrationStream({ lines, tail, className = "" }: StreamProps) {
  const shown = tail ? lines.slice(-tail) : lines;
  const offset = tail ? lines.length - shown.length : 0;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length]);

  return (
    <div className={className} aria-live="polite">
      {shown.map((line, i) => {
        const isLatest = offset + i === lines.length - 1;
        return (
          <motion.p
            key={offset + i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className={`py-1 text-sm ${isLatest ? "text-ink" : "text-muted"}`}
          >
            {line}
          </motion.p>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

interface QuestionProps {
  question: THRUQuestion;
  onAnswer: (choice: string) => void;
}

/** Clarifying questions land inline as pill choices — never a nested modal. */
export function QuestionPills({ question, onAnswer }: QuestionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="py-1.5"
    >
      <p className="text-sm text-ink">{question.text}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {question.options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onAnswer(opt)}
            className="rounded-[2px] border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors duration-200 hover:bg-accent/20"
          >
            {opt}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

import type { ReactNode } from "react";

type Tone = "neutral" | "sage" | "rose" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-white/[0.05] text-muted",
  sage: "bg-sage/15 text-sage",
  rose: "bg-rose/15 text-rose",
  accent: "bg-accent/15 text-accent",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-[2px] px-2 py-0.5 font-mono text-xs ${TONES[tone]}`}>
      {children}
    </span>
  );
}

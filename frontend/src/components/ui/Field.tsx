import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-[2px] border border-white/10 bg-black/25 px-4 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-colors duration-200 focus:border-accent/60";

export const textareaClass =
  "w-full rounded-[2px] border border-white/10 bg-black/25 px-4 py-3 text-sm text-ink placeholder:text-faint outline-none transition-colors duration-200 focus:border-accent/60 resize-none";

interface Props {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: Props) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label mb-2 block">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-rose">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

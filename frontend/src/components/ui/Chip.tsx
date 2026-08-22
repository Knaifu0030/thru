import type { ReactNode } from "react";

interface Props {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

/** Filter/selector chip — the small sibling of PillButton. */
export function Chip({ selected = false, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-[2px] border px-3 py-1.5 text-xs transition-colors duration-200 ${
        selected
          ? "border-ink bg-ink font-medium text-bg"
          : "border-white/10 text-muted hover:border-white/25 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

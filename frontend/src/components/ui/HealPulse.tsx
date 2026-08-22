interface Props {
  label?: string;
}

/**
 * The heal indicator: a sage dot that rings twice on mount, then settles.
 * Drawn, not an emoji — per the iconography rules.
 */
export function HealPulse({ label }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label ?? "self-healed"}>
      <span className="relative flex h-2 w-2">
        <span className="heal-ring absolute inline-flex h-full w-full rounded-full bg-sage/50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-sage" />
      </span>
      {label && <span className="text-xs text-sage">{label}</span>}
    </span>
  );
}

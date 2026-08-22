/** Small state glyph used away from the primary THRU wordmark. */
export function Spark({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
    >
      <path d="M10 1.5l1.9 6.6L18.5 10l-6.6 1.9L10 18.5l-1.9-6.6L1.5 10l6.6-1.9z" fill="currentColor" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex h-8 items-center px-1">
      <img
        src="/thru-logo.png"
        alt="THRU"
        className="h-8 w-auto max-w-[132px] object-contain object-left [filter:invert(1)_grayscale(1)_brightness(1.35)]"
      />
    </div>
  );
}

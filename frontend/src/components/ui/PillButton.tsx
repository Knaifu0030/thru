import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

type Variant = "accent" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md";

interface Props extends HTMLMotionProps<"button"> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  accent: "bg-accent font-medium text-bg hover:bg-accent-bright",
  ghost: "border border-white/10 text-ink hover:border-white/25",
  subtle: "bg-white/[0.06] text-ink hover:bg-white/[0.1]",
  danger: "border border-rose/40 text-rose hover:bg-rose/10",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export const PillButton = forwardRef<HTMLButtonElement, Props>(function PillButton(
  { variant = "ghost", size = "md", className = "", children, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[2px] transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

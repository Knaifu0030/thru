import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";

interface Props {
  text: string;
  ariaLabel?: string;
  className?: string;
}

/** Monospace block with a copy affordance — a quiet checkmark, no toasts. */
export function CopyBlock({ text, ariaLabel = "Copy to clipboard", className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — selection still works */
    }
  };

  return (
    <div className={`relative rounded-xl border border-white/10 bg-black/25 ${className}`}>
      <pre className="overflow-x-auto whitespace-pre p-4 pr-12 font-mono text-sm text-ink/90">{text}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label={ariaLabel}
        className="absolute right-2 top-2 rounded-[2px] p-2 text-muted transition-colors duration-200 hover:bg-white/[0.06] hover:text-ink"
      >
        <motion.span
          key={copied ? "check" : "copy"}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={`block ${copied ? "text-sage" : ""}`}
        >
          {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
        </motion.span>
      </button>
    </div>
  );
}

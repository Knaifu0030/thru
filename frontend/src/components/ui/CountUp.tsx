import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

interface Props {
  value: number;
  decimals?: number;
  render?: (n: number) => string;
}

/** Numbers glide to their value instead of snapping. Honors reduced motion. */
export function CountUp({ value, decimals = 0, render }: Props) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  const shown = Number(display.toFixed(decimals));
  return <span>{render ? render(shown) : shown.toLocaleString("en-IN")}</span>;
}

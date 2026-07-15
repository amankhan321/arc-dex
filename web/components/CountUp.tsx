"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

/**
 * Counts from 0 to `value` once, when it first scrolls into view.
 *
 * Preserves the exact string formatting the caller would otherwise render
 * (decimals, separators) by taking a `format` function — so a virtual price
 * animates as 0.000000 -> 1.000056 and a reserve as 0.00 -> 10.80, each with
 * their own precision. Reduced-motion jumps straight to the final value.
 */
export function CountUp({
  value,
  format,
  duration = 1100,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const still = useReducedMotion();
  const [shown, setShown] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (!inView || done.current) return;
    if (still || value === 0) {
      setShown(value);
      done.current = true;
      return;
    }
    done.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutExpo — fast then settling, matches the reveal feel.
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, still]);

  return (
    <span ref={ref} className={className}>
      {format(shown)}
    </span>
  );
}

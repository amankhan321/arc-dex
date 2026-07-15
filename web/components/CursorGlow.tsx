"use client";

import { useEffect, useRef } from "react";

/**
 * A light source that follows the cursor.
 *
 * One fixed element, moved with translate3d inside requestAnimationFrame with
 * gentle lerp — the glow trails the pointer slightly, which reads as light with
 * mass rather than a div glued to the mouse. No React re-renders, no listeners
 * per card, nothing on the main thread beyond one rAF.
 *
 * Skipped entirely on touch devices (no cursor to follow) and for
 * prefers-reduced-motion.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tx = innerWidth / 2, ty = innerHeight / 3;
    let x = tx, y = ty;
    let raf = 0;

    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      el.style.opacity = "1";
    };
    const leave = () => { el.style.opacity = "0"; };

    const tick = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.transform = `translate3d(${x - 350}px, ${y - 350}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    raf = requestAnimationFrame(tick);

    return () => {
      removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 h-[700px] w-[700px] opacity-0 transition-opacity duration-500"
      style={{
        zIndex: -1,
        background:
          "radial-gradient(circle, rgba(94,106,210,0.10) 0%, rgba(46,211,167,0.05) 35%, transparent 65%)",
      }}
    />
  );
}

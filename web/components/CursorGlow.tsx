"use client";

import { useEffect, useRef } from "react";

/**
 * A light source that follows the cursor — sized to the screen, not a constant.
 * min(380px, 34vw) so it reads as a soft local glow on any display instead of a
 * floodlight on smaller ones. Moved with translate3d inside one rAF with lerp,
 * so it trails slightly: light with mass, not a div glued to the mouse.
 * No React re-renders. Skipped on touch devices and reduced-motion.
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
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      // Center on the cursor whatever the current rendered size is.
      const half = el.offsetWidth / 2;
      el.style.transform = `translate3d(${x - half}px, ${y - half}px, 0)`;
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
      className="pointer-events-none fixed left-0 top-0 opacity-0 transition-opacity duration-500"
      style={{
        zIndex: -1,
        width: "min(380px, 34vw)",
        height: "min(380px, 34vw)",
        background:
          "radial-gradient(circle, rgba(94,106,210,0.16) 0%, rgba(46,211,167,0.07) 40%, transparent 68%)",
      }}
    />
  );
}

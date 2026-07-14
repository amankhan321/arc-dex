"use client";

import { motion } from "framer-motion";

/**
 * Two slow, enormous, barely-visible light sources drifting behind everything.
 *
 * This is the trick that separates a premium dark UI from a black rectangle:
 * the background is never actually flat, it breathes. Opacity stays under 0.12
 * and the motion is slow enough that you feel it rather than watch it.
 */
export function Ambient() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        aria-hidden
        className="absolute -top-[20vh] left-[8%] h-[55vh] w-[55vh] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(94,106,210,0.16), transparent 65%)",
          filter: "blur(60px)",
        }}
        animate={{ x: [0, 60, -20, 0], y: [0, 30, 60, 0] }}
        transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute -top-[10vh] right-[6%] h-[45vh] w-[45vh] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(46,211,167,0.10), transparent 65%)",
          filter: "blur(70px)",
        }}
        animate={{ x: [0, -50, 20, 0], y: [0, 50, 10, 0] }}
        transition={{ duration: 42, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Faint grid. Reads as "instrument", not "landing page". */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 80% 50% at 50% 0%, black, transparent 75%)",
        }}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Swap } from "@/components/Swap";
import { BookLadder } from "@/components/BookLadder";
import { LimitPanel } from "@/components/LimitPanel";
import { TwapPanel } from "@/components/TwapPanel";
import { Rise, Stagger } from "@/components/Reveal";
import { usePool } from "@/lib/useBook";
import { fmt } from "@/lib/contracts";

const EASE = [0.16, 1, 0.3, 1] as const;
const TABS = ["Swap", "Make", "TWAP"] as const;
type Tab = (typeof TABS)[number];

export default function Page() {
  const { data: pool } = usePool();
  const [tab, setTab] = useState<Tab>("Swap");

  return (
    <>
      <Header />

      <main className="mx-auto max-w-6xl px-6 pt-20 sm:pt-28">
        <Hero />

        <Stagger gap={0.06} className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Curve price" value={pool ? pool.ammPrice.toFixed(5) : "—"} sub="EURC per USDC" live />
          <Stat label="Pool USDC" value={pool ? fmt(pool.balance0, 2) : "—"} sub="reserve" />
          <Stat label="Pool EURC" value={pool ? fmt(pool.balance1, 2) : "—"} sub="reserve" />
          <Stat
            label="LP value"
            value={pool ? (Number(pool.virtualPrice) / 1e18).toFixed(6) : "—"}
            sub="virtual price"
            live
          />
        </Stagger>

        <Stagger gap={0.08} className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Rise>
            <div className="glass lift h-full p-6">
              {/* Tabs. The pill slides between them via a shared layoutId — the
                  state change is a movement, not a repaint. */}
              <div className="relative mb-6 grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-white/[0.025] p-1">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className="relative rounded-[9px] py-1.5 text-xs font-medium transition-colors duration-300 ease-ease"
                  >
                    {tab === t && (
                      <motion.span
                        layoutId="tab-pill"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute inset-0 rounded-[9px] bg-white/[0.08]"
                      />
                    )}
                    <span className={tab === t ? "relative text-fg" : "relative text-faint hover:text-muted"}>
                      {t}
                    </span>
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: EASE }}
                >
                  {tab === "Swap" && <Swap />}
                  {tab === "Make" && <LimitPanel />}
                  {tab === "TWAP" && <TwapPanel />}
                </motion.div>
              </AnimatePresence>
            </div>
          </Rise>

          <Rise>
            <BookLadder />
          </Rise>
        </Stagger>
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  live,
}: {
  label: string;
  value: string;
  sub: string;
  live?: boolean;
}) {
  return (
    <Rise>
      <div className={`glass lift px-4 py-3.5 ${live ? "alive" : ""}`}>
        <div className="text-[10px] uppercase tracking-[0.14em] text-faint">
          {label}
        </div>
        <div className="mt-2 font-mono text-lg tabular text-fg">{value}</div>
        <div className="mt-0.5 text-[10px] text-faint">{sub}</div>
      </div>
    </Rise>
  );
}

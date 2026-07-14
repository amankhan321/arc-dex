"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight, Zap } from "lucide-react";
import { Header } from "@/components/Header";
import { Swap } from "@/components/Swap";
import { BookLadder } from "@/components/BookLadder";
import { LimitPanel } from "@/components/LimitPanel";
import { usePool } from "@/lib/useBook";
import { fmt } from "@/lib/contracts";

const EASE = [0.16, 1, 0.3, 1] as const;

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.07 * i, duration: 0.7, ease: EASE },
  }),
};

export default function Page() {
  const { data: pool } = usePool();

  return (
    <>
      <Header />

      <main className="mx-auto max-w-6xl px-6 pt-16">
        <motion.section
          initial="hidden"
          animate="show"
          custom={0}
          variants={rise}
          className="glass relative overflow-hidden p-8 sm:p-12"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(94,106,210,0.20), transparent 65%)",
              filter: "blur(40px)",
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1"
          >
            <Zap size={11} className="text-bid" />
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
              Live on Arc Testnet
            </span>
          </motion.div>

          <h1 className="mt-6 max-w-2xl text-[34px] font-medium leading-[1.1] tracking-[-0.03em] text-fg sm:text-[46px]">
            The first on-chain
            <br />
            order book on Arc.
          </h1>

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted">
            Every other DEX here is a curve. A real limit order book only works
            when finality is sub-second and gas costs a cent &mdash; which is true
            on exactly one chain. Orders sweep the book first, then fall through
            to a rate-adjusted StableSwap for whatever it can&apos;t absorb.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/docs"
              className="glow-btn inline-flex items-center gap-1.5 rounded-xl bg-fg px-4 py-2 text-xs font-medium text-deep"
            >
              How it works
              <ArrowUpRight size={13} />
            </Link>
            <a
              href="https://github.com/amankhan321/arc-dex"
              target="_blank"
              rel="noreferrer"
              className="glow-btn inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs text-muted hover:text-fg"
            >
              Read the contracts
              <ArrowUpRight size={13} />
            </a>
          </div>
        </motion.section>

        <motion.div
          initial="hidden"
          animate="show"
          custom={1}
          variants={rise}
          className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          <Stat label="Curve price" value={pool ? pool.ammPrice.toFixed(5) : "—"} sub="EURC per USDC" />
          <Stat label="Pool USDC" value={pool ? fmt(pool.balance0, 2) : "—"} sub="reserve" />
          <Stat label="Pool EURC" value={pool ? fmt(pool.balance1, 2) : "—"} sub="reserve" />
          <Stat
            label="LP value"
            value={pool ? (Number(pool.virtualPrice) / 1e18).toFixed(6) : "—"}
            sub="virtual price"
          />
        </motion.div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div initial="hidden" animate="show" custom={2} variants={rise}>
            <Swap />
          </motion.div>

          <motion.div
            initial="hidden"
            animate="show"
            custom={3}
            variants={rise}
            className="space-y-5"
          >
            <BookLadder />
            <LimitPanel />
          </motion.div>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="glass lift px-4 py-3.5"
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-faint">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-lg tabular text-fg">{value}</div>
      <div className="text-[10px] text-faint">{sub}</div>
    </motion.div>
  );
}

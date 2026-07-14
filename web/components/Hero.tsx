"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Rise, Stagger } from "./Reveal";

export function Hero() {
  return (
    <Stagger gap={0.08}>
      <Rise>
        <div className="inline-flex items-center gap-2.5 rounded-full border border-mint/25 bg-mint/[0.06] px-3 py-1.5">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-mint">
            Live on Arc Testnet
          </span>
        </div>
      </Rise>

      <Rise>
        <h1 className="mt-7 max-w-4xl text-[42px] font-semibold leading-[1.04] tracking-[-0.02em] text-fg sm:text-[56px] lg:text-[72px]">
          The order book
          <br />
          <span className="shimmer">Arc made possible.</span>
        </h1>
      </Rise>

      <Rise>
        <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-muted">
          Every other DEX here is a curve. A real limit order book only works
          when finality is sub-second and gas costs a cent — which is true on
          exactly one chain. Orders sweep the book first, then fall through to a
          rate-adjusted StableSwap for whatever it can&apos;t absorb.
        </p>
      </Rise>

      <Rise>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/docs"
            className="btn btn-mint inline-flex items-center gap-1.5 bg-fg px-5 py-2.5 text-[13px] font-medium text-base"
          >
            How it works
            <ArrowUpRight size={14} />
          </Link>
          <a
            href="https://github.com/amankhan321/arc-dex"
            target="_blank"
            rel="noreferrer"
            className="btn inline-flex items-center gap-1.5 border border-white/[0.1] px-5 py-2.5 text-[13px] text-muted hover:text-fg"
          >
            Read the contracts
            <ArrowUpRight size={14} />
          </a>
        </div>
      </Rise>
    </Stagger>
  );
}

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAccount, useWriteContract } from "wagmi";
import { ADDR, arcTestnet, bookAbi, erc20Abi, parse, tickOf } from "@/lib/contracts";

export function LimitPanel() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const [isBid, setIsBid] = useState(true);
  const [price, setPrice] = useState("0.9300");
  const [size, setSize] = useState("2");
  const [status, setStatus] = useState<string | null>(null);

  async function place() {
    if (!address) return;
    const tick = tickOf(Number(price));
    const baseAmount = parse(size);
    if (!tick || baseAmount === 0n) return;

    // A bid escrows quote (size x price); an ask escrows base.
    const token = (isBid ? ADDR.eurc : ADDR.usdc) as `0x${string}`;
    const escrow = isBid
      ? (baseAmount * BigInt(tick) * 10n ** 13n) / 10n ** 18n + 1n
      : baseAmount;

    try {
      setStatus("Approving…");
      await writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDR.book as `0x${string}`, escrow],
        chainId: arcTestnet.id,
      });

      setStatus("Resting order…");
      const hash = await writeContractAsync({
        address: ADDR.book as `0x${string}`,
        abi: bookAbi,
        functionName: "placeOrder",
        args: [isBid, tick, baseAmount],
        chainId: arcTestnet.id,
      });
      setStatus(`Resting · ${hash.slice(0, 10)}…`);
    } catch (e) {
      const m = e instanceof Error ? e.message : "failed";
      setStatus(
        m.includes("WouldCross")
          ? "Post-only: that price would cross the spread"
          : m.split("\n")[0].slice(0, 90),
      );
    }
  }

  async function claim() {
    try {
      setStatus("Claiming…");
      await writeContractAsync({
        address: ADDR.book as `0x${string}`,
        abi: bookAbi,
        functionName: "claim",
        chainId: arcTestnet.id,
      });
      setStatus("Claimed");
    } catch {
      setStatus("Nothing to claim");
    }
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-fg">Make</h2>
      <p className="mt-1 text-xs leading-relaxed text-faint">
        Post-only. An order that would cross the spread is rejected, not filled —
        makers make, takers take, and the paths never interleave.
      </p>

      <div className="relative mt-4 grid grid-cols-2 gap-1 rounded-xl border border-[color:var(--line)] bg-white/[0.025] p-1">
        {([true, false] as const).map((b) => (
          <button
            key={String(b)}
            onClick={() => setIsBid(b)}
            className="relative rounded-[9px] py-1.5 text-xs font-medium"
          >
            {isBid === b && (
              <motion.span
                layoutId="side-pill"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className={`absolute inset-0 rounded-[9px] ${b ? "bg-mint/[0.14]" : "bg-rose/[0.14]"}`}
              />
            )}
            <span
              className={`relative transition-colors duration-300 ease-ease ${
                isBid === b ? (b ? "text-mint" : "text-rose") : "text-faint hover:text-muted"
              }`}
            >
              {b ? "Buy USDC" : "Sell USDC"}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Price (EURC)" value={price} onChange={setPrice} />
        <Field label="Size (USDC)" value={size} onChange={setSize} />
      </div>

      <button
        onClick={place}
        disabled={!address || isPending}
        className="cta mt-4 w-full bg-indigo/80 py-2.5 text-sm font-medium text-white disabled:opacity-25"
      >
        {!address ? "Connect wallet" : "Place limit order"}
      </button>

      <button
        onClick={claim}
        disabled={!address}
        className="btn mt-2 w-full border border-[color:var(--line)] py-2.5 text-xs text-muted hover:text-fg disabled:opacity-25"
      >
        Claim fills
      </button>

      {status && (
        <p className="mt-3 break-words text-center font-mono text-[11px] text-muted">
          {status}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inner p-3">
      <span className="text-[10px] uppercase tracking-[0.14em] text-faint">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="mt-1 w-full bg-transparent font-mono text-sm tabular text-fg outline-none"
      />
    </div>
  );
}

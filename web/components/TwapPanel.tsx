"use client";

import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { ADDR, erc20Abi, parse, twapAbi } from "@/lib/contracts";

/**
 * The primitive no other Arc DEX has: work a large FX order through the market
 * in timed slices instead of eating the whole book at once.
 *
 * Cranking is permissionless — anyone can execute a due slice and keep 5bps of
 * it. The price floor is set here, by the owner, and enforced on every slice, so
 * a hostile keeper can only decline to work. They can never force a bad fill.
 */
export function TwapPanel() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const [zeroForOne, setZeroForOne] = useState(true);
  const [total, setTotal] = useState("4");
  const [slices, setSlices] = useState("4");
  const [minutes, setMinutes] = useState("1");
  const [floor, setFloor] = useState("0.90");
  const [status, setStatus] = useState<string | null>(null);

  const inSym = zeroForOne ? "USDC" : "EURC";

  async function create() {
    if (!address) return;
    const amount = parse(total);
    const n = Number(slices);
    const interval = Math.max(1, Math.round(Number(minutes) * 60));
    const minPriceX18 = BigInt(Math.floor(Number(floor) * 1e18));
    if (amount === 0n || !n || !minPriceX18) return;

    const token = (zeroForOne ? ADDR.usdc : ADDR.eurc) as `0x${string}`;

    try {
      setStatus("Approving…");
      await writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDR.twap as `0x${string}`, amount],
      });

      setStatus("Scheduling…");
      const hash = await writeContractAsync({
        address: ADDR.twap as `0x${string}`,
        abi: twapAbi,
        functionName: "createTwap",
        args: [zeroForOne, amount, n, interval, minPriceX18],
      });
      setStatus(`Scheduled · ${hash.slice(0, 10)}…`);
    } catch (e) {
      const m = e instanceof Error ? e.message : "failed";
      setStatus(m.split("\n")[0].slice(0, 90));
    }
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-fg">TWAP</h2>
      <p className="mt-1 text-xs leading-relaxed text-faint">
        Slice a large order over time. Keepers execute due slices for 5bps; your
        price floor is enforced on every one, so they can decline but never
        overreach.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-white/[0.08] bg-white/[0.025] p-1">
        {([true, false] as const).map((z) => (
          <button
            key={String(z)}
            onClick={() => setZeroForOne(z)}
            className={`rounded-[9px] py-1.5 text-xs font-medium transition-all duration-300 ease-ease ${
              zeroForOne === z
                ? "bg-white/[0.07] text-fg"
                : "text-faint hover:text-muted"
            }`}
          >
            Sell {z ? "USDC" : "EURC"}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label={`Total (${inSym})`} value={total} onChange={setTotal} />
        <Field label="Slices" value={slices} onChange={setSlices} />
        <Field label="Every (min)" value={minutes} onChange={setMinutes} />
        <Field label="Min price" value={floor} onChange={setFloor} />
      </div>

      <button
        onClick={create}
        disabled={!address || isPending}
        className="btn mt-4 w-full bg-fg py-2.5 text-sm font-medium text-base disabled:opacity-25"
      >
        {!address ? "Connect wallet" : "Schedule TWAP"}
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
      <span className="text-[10px] uppercase tracking-[0.14em] text-faint">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="mt-1 w-full bg-transparent font-mono text-sm tabular text-fg outline-none"
      />
    </div>
  );
}

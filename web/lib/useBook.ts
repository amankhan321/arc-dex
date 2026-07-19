"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { ADDR, arcTestnet, bookAbi, poolAbi, priceOf } from "./contracts";

export type Level = { tick: number; price: number; size: bigint };
export type Book = { bids: Level[]; asks: Level[] };

const MAX_LEVELS = 12;

/**
 * Walks the book straight off the chain — bestBid/bestAsk, then hops the tick
 * bitmap via nextBidBelow / nextAskAbove. No indexer, no subgraph, no backend.
 * The book IS the contract.
 */
const STRIDE = 16384;
const MAX_SCAN = 600_000;
let discoCache: { bids: number[]; asks: number[] } = { bids: [], asks: [] };
let discoAt = 0;

async function stridedDiscover(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  book: `0x${string}`,
): Promise<{ bids: number[]; asks: number[] }> {
  if (Date.now() - discoAt < 30_000) return discoCache;
  discoAt = Date.now(); // set first so concurrent refetches don't double-fire
  try {
    const askStarts: number[] = [];
    for (let p = 0; p <= MAX_SCAN; p += STRIDE) askStarts.push(p);
    const bidStarts: number[] = [];
    for (let p = MAX_SCAN; p >= STRIDE; p -= STRIDE) bidStarts.push(p);

    const probe = async (isBid: boolean, starts: number[]) => {
      const fn = isBid ? "nextBidBelow" : "nextAskAbove";
      const res = await client.multicall({
        allowFailure: true,
        contracts: starts.map((tk) => ({ address: book, abi: bookAbi, functionName: fn, args: [tk] })),
      });
      const found = new Set<number>();
      res.forEach((r) => {
        if (r.status === "success") {
          const tk = Number(r.result as bigint);
          if (tk !== 0) found.add(tk);
        }
      });
      return [...found];
    };

    const [bids, asks] = await Promise.all([probe(true, bidStarts), probe(false, askStarts)]);
    discoCache = { bids, asks };
  } catch {
    /* keep previous cache */
  }
  return discoCache;
}

export function useBook(refetchMs = 3000) {
  // Pinned to Arc explicitly. Without this, usePublicClient() follows the
  // WALLET's chain — and if the wallet sits on mainnet (or anything not in our
  // config) it returns undefined and every read on the page silently dies.
  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery<Book>({
    queryKey: ["book"],
    refetchInterval: refetchMs,
    refetchOnWindowFocus: true,
    enabled: !!client,
    retry: 1,
    retryDelay: 300,
    placeholderData: (prev) => prev,
    staleTime: 1500,
    queryFn: async () => {
      if (!client) return { bids: [], asks: [] };
      const book = ADDR.book as `0x${string}`;

      // Cheap bounded walk every cycle (near-spread levels, few calls) …
      const walkTicks = async (isBid: boolean): Promise<number[]> => {
        const fnBest = isBid ? "bestBid" : "bestAsk";
        const fnNext = isBid ? "nextBidBelow" : "nextAskAbove";
        const ticks: number[] = [];
        let tick = Number(
          await client.readContract({ address: book, abi: bookAbi, functionName: fnBest as never, args: [] as never }),
        );
        while (tick !== 0 && ticks.length < MAX_LEVELS) {
          ticks.push(tick);
          tick = Number(
            await client.readContract({ address: book, abi: bookAbi, functionName: fnNext as never, args: [tick] as never }),
          );
        }
        return ticks;
      };

      // … plus a strided far-tick DISCOVERY at most every 30s (cached), so the
      // RPC isn't hammered every refetch. Discovery jumps the contract's
      // 64-word scan bound; the walk covers the spread in between runs.
      const discovered = await stridedDiscover(client, book);

      const [walkedBids, walkedAsks] = await Promise.all([walkTicks(true), walkTicks(false)]);
      const bidTicks = [...new Set([...walkedBids, ...discovered.bids])];
      const askTicks = [...new Set([...walkedAsks, ...discovered.asks])];

      // All level depths (both sides) in ONE multicall.
      const all = [...bidTicks.map((t) => [true, t] as const), ...askTicks.map((t) => [false, t] as const)];
      const depths = all.length
        ? await client.multicall({
            allowFailure: true,
            contracts: all.map(([b, t]) => ({
              address: book, abi: bookAbi, functionName: "levelDepth", args: [b, t],
            })),
          })
        : [];

      const bids: Level[] = [];
      const asks: Level[] = [];
      all.forEach(([b, t], i) => {
        const r = depths[i];
        if (r?.status === "success" && (r.result as bigint) > 0n) {
          (b ? bids : asks).push({ tick: t, price: priceOf(t), size: r.result as bigint });
        }
      });
      bids.sort((a, b) => b.tick - a.tick);
      asks.sort((a, b) => a.tick - b.tick);
      return { bids, asks };
    },
  });
}

export function usePool(refetchMs = 5000) {
  // Pinned to Arc explicitly. Without this, usePublicClient() follows the
  // WALLET's chain — and if the wallet sits on mainnet (or anything not in our
  // config) it returns undefined and every read on the page silently dies.
  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery({
    queryKey: ["pool"],
    refetchInterval: refetchMs,
    enabled: !!client,
    queryFn: async () => {
      if (!client) return null;
      const call = (fn: string, args: readonly unknown[] = []) =>
        client.readContract({
          address: ADDR.pool as `0x${string}`,
          abi: poolAbi,
          functionName: fn as never,
          args: args as never,
        });

      // ONE round-trip for all four via Multicall3, instead of four serial
      // eth_calls through the proxy. This is what was taking 10-15s.
      const c = { address: ADDR.pool as `0x${string}`, abi: poolAbi } as const;
      const [b0, b1, vp, mid] = await client.multicall({
        allowFailure: false,
        contracts: [
          { ...c, functionName: "balance0" },
          { ...c, functionName: "balance1" },
          { ...c, functionName: "getVirtualPrice" },
          { ...c, functionName: "getDy", args: [true, 1_000_000n] },
        ],
      }) as [bigint, bigint, bigint, bigint];

      return {
        balance0: b0,
        balance1: b1,
        virtualPrice: vp,
        ammPrice: Number(mid) / 1e6, // EURC per 1 USDC
      };
    },
    retry: 3,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 5000),
    placeholderData: (prev) => prev,
    staleTime: 2000,
  });
}

import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin JSON-RPC proxy.
 *
 * Arc's testnet RPC returns 403 to any request carrying a browser Origin header.
 * Server-to-server has no Origin, so the RPC answers normally. The browser talks
 * to /api/rpc on our own domain and we forward from here.
 *
 * Security model: this forwards READ methods only. Anything that could change
 * state (eth_sendRawTransaction, eth_sendTransaction, personal_*, etc.) is
 * refused — those must go through the user's wallet, never through us. We match
 * by prefix so we don't have to enumerate every read method viem might send
 * (which is what broke the first version: one unlisted method 403'd the whole
 * batch and every number on the page went blank).
 */
const RPC = "https://rpc.testnet.arc.network";

const BLOCKED = [
  "eth_sendrawtransaction",
  "eth_sendtransaction",
  "eth_sign",
  "personal_",
  "wallet_",
];

function isRead(method: unknown): boolean {
  if (typeof method !== "string") return false;
  const m = method.toLowerCase();
  return !BLOCKED.some((b) => m.startsWith(b) || m === b);
}

async function forward(payload: unknown) {
  const upstream = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const calls = Array.isArray(body) ? body : [body];
  const bad = calls.find(
    (c) => !isRead((c as { method?: unknown })?.method),
  );
  if (bad) {
    return NextResponse.json(
      { error: "only read methods are proxied; send writes through your wallet" },
      { status: 403 },
    );
  }

  return forward(body);
}

// Lets you sanity-check the tunnel in a browser: /api/rpc should return the chain id.
export async function GET() {
  return forward({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
}

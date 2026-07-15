import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin JSON-RPC proxy.
 *
 * The Arc testnet RPC returns 403 to any request carrying a browser Origin
 * header, so direct wallet-less reads from the page are dead on arrival.
 * The browser talks to /api/rpc on our own domain; we forward server-side,
 * where no Origin header exists and the RPC answers normally.
 *
 * Writes never touch this path — they go through the user's wallet.
 */
const RPC = "https://rpc.testnet.arc.network";

// Read-only surface. This proxy will not forward anything that could spend.
const ALLOWED = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getLogs",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_gasPrice",
  "eth_estimateGas",
  "net_version",
]);

type RpcReq = { method?: string } | { method?: string }[];

export async function POST(req: NextRequest) {
  let body: RpcReq;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const calls = Array.isArray(body) ? body : [body];
  if (calls.some((c) => !c.method || !ALLOWED.has(c.method))) {
    return NextResponse.json({ error: "method not allowed" }, { status: 403 });
  }

  const upstream = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Never cache RPC responses.
    cache: "no-store",
  });

  const data = await upstream.text();
  return new NextResponse(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

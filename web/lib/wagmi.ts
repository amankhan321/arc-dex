import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "./contracts";

/**
 * injected() covers MetaMask / OKX / Rabby / Phantom via EIP-6963.
 *
 * batch:false is REQUIRED — the Arc RPC intermittently drops batched eth_calls,
 * which surfaces as "HTTP request failed" on the swap quote (two reads that
 * viem would otherwise bundle). Stats survive because they use an explicit
 * Multicall3 call; the quote path does not, so batching must be off. retry +
 * timeout ride out transient blips.
 */
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network", {
      batch: false,
      retryCount: 3,
      retryDelay: 400,
      timeout: 15_000,
    }),
  },
  ssr: true,
});

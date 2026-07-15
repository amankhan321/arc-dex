import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "./contracts";

/**
 * Reads go straight to the Arc RPC — the config that works. The extra options
 * here are about RESILIENCE, which is what "HTTP request failed" was: the
 * endpoint occasionally times out or throttles, and with no retry a single
 * blip killed the whole quote. Now each call retries a few times with backoff
 * and a generous timeout before it's allowed to fail.
 *
 * Writes never use this transport — they go through the connected wallet.
 */
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network", {
      retryCount: 3,
      retryDelay: 400,
      timeout: 15_000,
      // NOT batched: this RPC intermittently drops batched eth_calls (surfaced
      // as 'HTTP request failed' / 'missing revert data'). One call per request
      // is chattier but reliable.
      batch: false,
    }),
  },
  ssr: true,
});

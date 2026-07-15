import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "./contracts";

/**
 * Reads go STRAIGHT to the Arc RPC from the browser. This is the configuration
 * that demonstrably worked on first deploy — the RPC serves browsers fine.
 *
 * History, so nobody "improves" this again: a proxy-first fallback stack was
 * layered in here to work around a CORS block that turned out not to exist
 * (the 403 came from a dev sandbox's own egress proxy). The added indirection
 * then became its own failure mode. The real production bug was reads
 * following the wallet's chain — fixed by pinning chainId at every call site,
 * not by anything in this file. /api/rpc still exists as a documented backup;
 * nothing uses it by default.
 */
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"),
  },
  ssr: true,
});

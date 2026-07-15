import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "./contracts";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    // All reads go through our same-origin proxy — the Arc RPC 403s any request
    // that carries a browser Origin header. Writes go through the wallet.
    [arcTestnet.id]: http(
      typeof window === "undefined" ? "https://rpc.testnet.arc.network" : "/api/rpc",
    ),
  },
  ssr: true,
});

import { createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "./contracts";

const DIRECT = "https://rpc.testnet.arc.network";

/**
 * Belt and braces on the read path:
 *  1. our same-origin /api/rpc proxy (absolute URL — some fetch paths are picky
 *     about relative ones),
 *  2. the Arc RPC directly.
 * viem's fallback transport tries them in order and sticks with whatever
 * answers, so the page works whichever of the two the environment allows.
 * Writes never touch either — they go through the connected wallet.
 */
const transport =
  typeof window === "undefined"
    ? http(DIRECT)
    : fallback([
        http(`${window.location.origin}/api/rpc`),
        http(DIRECT),
      ]);

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: { [arcTestnet.id]: transport },
  ssr: true,
});

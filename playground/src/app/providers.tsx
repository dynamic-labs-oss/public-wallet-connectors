"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import "@dynamic-labs/solana";
import { MetaMaskEvmWalletConnectors } from "@dynamic-labs-connectors/metamask-evm";
import { MetaMaskSolanaWalletConnectors } from "@dynamic-labs-connectors/metamask-solana";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "",
        walletConnectors: [
          MetaMaskEvmWalletConnectors,
          MetaMaskSolanaWalletConnectors,
        ],
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}

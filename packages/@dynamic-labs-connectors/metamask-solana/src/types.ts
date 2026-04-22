/** Minimal wallet-standard Wallet shape used by the adapter and SDK client */
export interface StandardWallet {
  name: string;
  accounts: readonly WalletAccount[];
  features: Record<string, Record<string, unknown>>;
}

export interface WalletAccount {
  address: string;
  publicKey: Uint8Array;
  chains: readonly string[];
  features: readonly string[];
}

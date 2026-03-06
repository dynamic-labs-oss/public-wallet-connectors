import { logger } from '@dynamic-labs/wallet-connector-core';

import type { StandardWallet } from './types.js';

type MultichainCore = {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  mergeOptions(partial: { ui?: { headless?: boolean } }): void;
};

export interface MetaMaskSolanaSdkClientConfig {
  dappName?: string;
  dappUrl?: string;
}

/**
 * Static singleton client for MetaMask Connect Solana SDK.
 * Wraps createSolanaClient() and exposes the wallet-standard Wallet.
 */
export class MetaMaskSolanaSdkClient {
  private static wallet: StandardWallet | null = null;
  private static multichainCore: MultichainCore | null = null;
  private static initPromise: Promise<void> | null = null;

  static isInitialized = false;

  private constructor() {
    throw new Error('MetaMaskSolanaSdkClient is not instantiable');
  }

  static init = async (
    config: MetaMaskSolanaSdkClientConfig,
  ): Promise<void> => {
    if (MetaMaskSolanaSdkClient.isInitialized) {
      return;
    }

    if (MetaMaskSolanaSdkClient.initPromise) {
      return MetaMaskSolanaSdkClient.initPromise;
    }

    MetaMaskSolanaSdkClient.initPromise =
      MetaMaskSolanaSdkClient.doInit(config);

    try {
      await MetaMaskSolanaSdkClient.initPromise;
    } finally {
      MetaMaskSolanaSdkClient.initPromise = null;
    }
  };

  private static doInit = async (
    config: MetaMaskSolanaSdkClientConfig,
  ): Promise<void> => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const { createSolanaClient } = await import('@metamask/connect-solana');

      const client = await createSolanaClient({
        dapp: {
          name: config.dappName ?? 'Dynamic',
          url: config.dappUrl ?? window.location.origin,
        },
        skipAutoRegister: false,
      });

      const wallet = client.getWallet() as unknown as StandardWallet;
      MetaMaskSolanaSdkClient.wallet = wallet;
      MetaMaskSolanaSdkClient.multichainCore =
        client.core as unknown as MultichainCore;
      MetaMaskSolanaSdkClient.isInitialized = true;

      // Ensure headless mode so the SDK emits display_uri events
      // instead of rendering its own QR modal. Safe to call multiple
      // times (idempotent via nullish coalescing in mergeOptions).
      client.core.mergeOptions({ ui: { headless: true } });

      logger.debug('[MetaMaskSolanaSdkClient] init complete');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        '[MetaMaskSolanaSdkClient] Failed to initialize:',
        errorMessage,
      );
      throw error;
    }
  };

  static getWallet = (): StandardWallet | null => {
    return MetaMaskSolanaSdkClient.wallet;
  };

  static getCore = (): MultichainCore | null => {
    return MetaMaskSolanaSdkClient.multichainCore;
  };

  /** Subscribe to display_uri events from the multichain core. Returns an unsubscribe function. */
  static onDisplayUri = (listener: (uri: string) => void): (() => void) => {
    const core = MetaMaskSolanaSdkClient.multichainCore;
    if (!core) return () => { /* noop - core not available */ };
    const handler = listener as (...args: unknown[]) => void;
    core.on('display_uri', handler);
    return () => core.off('display_uri', handler);
  };

  static getAccounts = (): string[] => {
    return (
      MetaMaskSolanaSdkClient.wallet?.accounts.map((a) => a.address) ?? []
    );
  };

  static getSelectedAccount = (): string | undefined => {
    return MetaMaskSolanaSdkClient.wallet?.accounts[0]?.address;
  };

  static connect = async (): Promise<string | undefined> => {
    const wallet = MetaMaskSolanaSdkClient.wallet;

    if (!wallet) {
      throw new Error(
        '[MetaMaskSolanaSdkClient] Not initialized. Call init() first.',
      );
    }

    const existingAccount = wallet.accounts[0];
    if (existingAccount) {
      return existingAccount.address;
    }

    const connectFn = wallet.features['standard:connect']?.['connect'] as
      | ((input: {
          silent: boolean;
        }) => Promise<{ accounts: readonly { address: string }[] }>)
      | undefined;

    if (!connectFn) {
      throw new Error(
        '[MetaMaskSolanaSdkClient] Wallet does not support standard:connect',
      );
    }

    const result = await connectFn({ silent: false });
    const firstAccount = result.accounts[0];
    return firstAccount?.address;
  };

  /**
   * Scoped disconnect via wallet-standard's standard:disconnect.
   *
   * client.disconnect() (v0.2.0) tears down the shared multichain
   * transport, breaking reconnection for both EVM and Solana.
   * standard:disconnect clears only the wallet session, preserving
   * the transport for extension-based reconnection.
   *
   * Known limitation: QR code reconnection after disconnect does not
   * work with this approach. Upstream fix (connect-monorepo PR #193)
   * adds core.disconnect(solanaScopes) which properly resets the
   * transport session for Solana only. Once @metamask/connect-solana
   * publishes a version including that fix, switch to client.disconnect().
   */
  static disconnect = async (): Promise<void> => {
    const wallet = MetaMaskSolanaSdkClient.wallet;
    if (!wallet) return;

    const disconnectFn = wallet.features['standard:disconnect']?.[
      'disconnect'
    ] as (() => Promise<void>) | undefined;

    if (!disconnectFn) return;

    try {
      await disconnectFn();
    } catch {
      // Ignore disconnect errors
    }
  };

  static reset = (): void => {
    MetaMaskSolanaSdkClient.wallet = null;
    MetaMaskSolanaSdkClient.multichainCore = null;
    MetaMaskSolanaSdkClient.isInitialized = false;
    MetaMaskSolanaSdkClient.initPromise = null;
  };
}

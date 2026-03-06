import type { MetamaskConnectEVM } from '@metamask/connect-evm';
import { logger } from '@dynamic-labs/wallet-connector-core';

import {
  buildSupportedNetworks,
  type HexChainId,
  type EvmNetwork,
} from './utils.js';

export interface MetaMaskSdkClientConfig {
  evmNetworks: EvmNetwork[];
  dappName?: string;
  dappUrl?: string;
}

/**
 * Thin singleton wrapper around MetaMask Connect EVM SDK.
 * Handles SSR-safe dynamic import, init dedup, connect dedup,
 * and display_uri listener management. All state reads go
 * directly to the SDK instance (no parallel cache).
 */
export class MetaMaskSdkClient {
  private static instance: MetamaskConnectEVM | null = null;
  private static initPromise: Promise<void> | null = null;
  private static connectPromise: Promise<{
    accounts: string[];
    chainId: string;
  }> | null = null;
  private static displayUriListeners = new Set<(uri: string) => void>();

  static isInitialized = false;

  private constructor() {
    throw new Error('MetaMaskSdkClient is not instantiable');
  }

  static init = async (config: MetaMaskSdkClientConfig): Promise<void> => {
    if (MetaMaskSdkClient.isInitialized) return;
    if (MetaMaskSdkClient.initPromise) return MetaMaskSdkClient.initPromise;

    MetaMaskSdkClient.initPromise = MetaMaskSdkClient.doInit(config).finally(
      () => {
        MetaMaskSdkClient.initPromise = null;
      },
    );
    return MetaMaskSdkClient.initPromise;
  };

  private static doInit = async (
    config: MetaMaskSdkClientConfig,
  ): Promise<void> => {
    if (typeof window === 'undefined') return;

    const supportedNetworks = buildSupportedNetworks(config.evmNetworks);
    if (Object.keys(supportedNetworks).length === 0) {
      throw new Error(
        '[MetaMaskSdkClient] No valid networks with RPC URLs provided',
      );
    }

    const { createEVMClient } = await import('@metamask/connect-evm');
    const sdk = await createEVMClient({
      dapp: {
        name: config.dappName ?? 'Dynamic',
        url: config.dappUrl ?? window.location.origin,
      },
      api: {
        supportedNetworks: supportedNetworks as Record<HexChainId, string>,
      },
      ui: { headless: true, preferExtension: true },
      eventHandlers: {
        displayUri: (uri: string) => {
          for (const listener of MetaMaskSdkClient.displayUriListeners) {
            listener(uri);
          }
        },
      },
      debug: false,
    });

    MetaMaskSdkClient.instance = sdk;
    MetaMaskSdkClient.isInitialized = true;
    logger.debug('[MetaMaskSdkClient] init complete', { status: sdk.status });
  };

  static getInstance = (): MetamaskConnectEVM => {
    if (!MetaMaskSdkClient.instance) {
      throw new Error(
        '[MetaMaskSdkClient] Not initialized. Call init() first.',
      );
    }
    return MetaMaskSdkClient.instance;
  };

  static getProvider = ():
    | ReturnType<MetamaskConnectEVM['getProvider']>
    | undefined => {
    return MetaMaskSdkClient.instance?.getProvider();
  };

  /** Subscribe to display_uri events. Returns an unsubscribe function. */
  static onDisplayUri = (listener: (uri: string) => void): (() => void) => {
    MetaMaskSdkClient.displayUriListeners.add(listener);
    return () => MetaMaskSdkClient.displayUriListeners.delete(listener);
  };

  /**
   * Connect to MetaMask with the given chain IDs.
   * Returns existing session if already connected.
   * Deduplicates concurrent calls.
   */
  static connect = async (
    chainIds: number[],
  ): Promise<{ accounts: string[]; chainId: string }> => {
    const sdk = MetaMaskSdkClient.getInstance();

    if (sdk.accounts?.length && sdk.selectedChainId) {
      return { accounts: sdk.accounts, chainId: sdk.selectedChainId };
    }

    if (MetaMaskSdkClient.connectPromise) {
      return MetaMaskSdkClient.connectPromise;
    }

    const hexChainIds = chainIds.map(
      (id) => `0x${id.toString(16)}` as `0x${string}`,
    );

    MetaMaskSdkClient.connectPromise = sdk
      .connect({ chainIds: hexChainIds })
      .then((result) => ({
        accounts: result.accounts as string[],
        chainId: result.chainId as string,
      }))
      .finally(() => {
        MetaMaskSdkClient.connectPromise = null;
      });

    return MetaMaskSdkClient.connectPromise;
  };

  static disconnect = async (): Promise<void> => {
    if (!MetaMaskSdkClient.instance) return;
    try {
      await MetaMaskSdkClient.instance.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  };

  static switchChain = async (
    chainId: number,
    chainConfiguration?: {
      chainName: string;
      rpcUrls: string[];
      nativeCurrency: { name: string; symbol: string; decimals: number };
      blockExplorerUrls?: string[];
    },
  ): Promise<void> => {
    const sdk = MetaMaskSdkClient.getInstance();
    await sdk.switchChain({
      chainId: `0x${chainId.toString(16)}` as `0x${string}`,
      chainConfiguration,
    });
  };

  static reset = (): void => {
    MetaMaskSdkClient.instance = null;
    MetaMaskSdkClient.isInitialized = false;
    MetaMaskSdkClient.initPromise = null;
    MetaMaskSdkClient.connectPromise = null;
    MetaMaskSdkClient.displayUriListeners.clear();
  };
}

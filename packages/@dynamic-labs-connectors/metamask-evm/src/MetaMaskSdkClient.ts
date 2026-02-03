// Use dynamic import to avoid loading the SDK during SSR.
// The SDK's EIP-6963 detection runs immediately on module load,
// which fails on the server where there's no window object.
import type { MetamaskConnectEVM } from '@metamask/connect-evm';
import { logger } from '@dynamic-labs/wallet-connector-core';

import {
  buildSupportedNetworks,
  type HexChainId,
  type EvmNetwork,
} from './utils.js';

/** Maximum time to wait for SDK to leave 'pending' state during init */
const SDK_READY_POLL_MAX_MS = 1000;

/** Interval between status checks when polling for SDK ready state */
const SDK_READY_POLL_INTERVAL_MS = 20;

/** Callback types for SDK events */
export interface MetaMaskSdkClientCallbacks {
  onDisplayUri?: (uri: string) => void;
  onConnect?: (result: { chainId: string; accounts: string[] }) => void;
  onDisconnect?: () => void;
  onAccountsChanged?: (accounts: string[]) => void;
  onChainChanged?: (chainId: string) => void;
}

/** Configuration for SDK initialization */
export interface MetaMaskSdkClientConfig {
  evmNetworks: EvmNetwork[];
  dappName?: string;
  dappUrl?: string;
  callbacks?: MetaMaskSdkClientCallbacks;
}

/**
 * Static singleton client for MetaMask Connect EVM SDK.
 * Manages SDK lifecycle and provides access to provider/accounts.
 */
export class MetaMaskSdkClient {
  private static instance: MetamaskConnectEVM | null = null;
  private static displayUri: string | undefined = undefined;
  private static initPromise: Promise<void> | null = null;
  private static connectPromise: Promise<{
    accounts: string[];
    chainId: string;
  }> | null = null;
  private static requestAccountsPromise: Promise<unknown> | null = null;
  private static pendingDisplayUriCallback: ((uri: string) => void) | null =
    null;

  // Cached session state to avoid races where SDK instance fields lag behind
  private static cachedAccounts: string[] = [];
  private static cachedSelectedAccount: string | undefined = undefined;
  private static cachedSelectedChainId: string | undefined = undefined;

  // Used to dedupe autoConnect emissions across multiple connector instances
  private static autoConnectEmitted = false;

  static isInitialized = false;

  private constructor() {
    throw new Error('MetaMaskSdkClient is not instantiable');
  }

  /**
   * Initialize the MetaMask SDK.
   * Thread-safe: concurrent calls will wait for the same initialization promise.
   */
  static init = async (config: MetaMaskSdkClientConfig): Promise<void> => {
    if (MetaMaskSdkClient.isInitialized) {
      return;
    }

    if (MetaMaskSdkClient.initPromise) {
      return MetaMaskSdkClient.initPromise;
    }

    MetaMaskSdkClient.initPromise = MetaMaskSdkClient.doInit(config);

    try {
      await MetaMaskSdkClient.initPromise;
    } finally {
      MetaMaskSdkClient.initPromise = null;
    }
  };

  /** Internal initialization logic */
  private static doInit = async (
    config: MetaMaskSdkClientConfig,
  ): Promise<void> => {
    // Guard against SSR - SDK requires browser environment
    if (typeof window === 'undefined') {
      return;
    }

    const supportedNetworks = buildSupportedNetworks(config.evmNetworks);

    if (Object.keys(supportedNetworks).length === 0) {
      throw new Error(
        '[MetaMaskSdkClient] No valid networks with RPC URLs provided',
      );
    }

    try {
      const { createEVMClient } = await import('@metamask/connect-evm');

      const sdk = await createEVMClient({
        dapp: {
          name: config.dappName ?? 'Dynamic',
          url: config.dappUrl ?? window.location.origin,
        },
        api: {
          supportedNetworks: supportedNetworks as Record<HexChainId, string>,
        },
        // Enable headless mode so MetaMask doesn't show its own QR modal.
        // Instead, display_uri events are emitted for Dynamic to handle.
        ui: {
          headless: true,
          preferExtension: true,
        },
        eventHandlers: {
          displayUri: (uri: string) => {
            MetaMaskSdkClient.displayUri = uri;
            config.callbacks?.onDisplayUri?.(uri);

            if (MetaMaskSdkClient.pendingDisplayUriCallback) {
              MetaMaskSdkClient.pendingDisplayUriCallback(uri);
              MetaMaskSdkClient.pendingDisplayUriCallback = null;
            }
          },
          connect: (result) => {
            MetaMaskSdkClient.cachedAccounts = result.accounts ?? [];
            MetaMaskSdkClient.cachedSelectedAccount = result.accounts?.[0];
            MetaMaskSdkClient.cachedSelectedChainId = result.chainId;
            config.callbacks?.onConnect?.(result);
          },
          disconnect: () => {
            MetaMaskSdkClient.clearSessionState();
            config.callbacks?.onDisconnect?.();
          },
          accountsChanged: (accounts) => {
            MetaMaskSdkClient.cachedAccounts = accounts ?? [];
            MetaMaskSdkClient.cachedSelectedAccount = accounts?.[0];
            config.callbacks?.onAccountsChanged?.(accounts);
          },
          chainChanged: (chainId) => {
            MetaMaskSdkClient.cachedSelectedChainId = chainId;
            config.callbacks?.onChainChanged?.(chainId);
          },
        },
        debug: false,
      });

      MetaMaskSdkClient.instance = sdk;
      MetaMaskSdkClient.isInitialized = true;
      MetaMaskSdkClient.cachedAccounts = sdk.accounts ?? [];
      MetaMaskSdkClient.cachedSelectedAccount = sdk.accounts?.[0];
      MetaMaskSdkClient.cachedSelectedChainId = sdk.selectedChainId;

      // In Next.js, the EIP-6963 detection may not be complete when createEVMClient returns.
      // Poll until the SDK reaches a definitive state (not 'pending').
      if (sdk.status === 'pending') {
        const start = Date.now();
        while (Date.now() - start < SDK_READY_POLL_MAX_MS) {
          if (sdk.status !== 'pending') break;
          await new Promise((r) => setTimeout(r, SDK_READY_POLL_INTERVAL_MS));
        }
      }

      logger.debug('[MetaMaskSdkClient] init complete', { status: sdk.status });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('[MetaMaskSdkClient] Failed to initialize:', errorMessage);
      throw error;
    }
  };

  /** Get the SDK instance. Throws if not initialized. */
  static getInstance = (): MetamaskConnectEVM => {
    if (!MetaMaskSdkClient.instance) {
      throw new Error(
        '[MetaMaskSdkClient] Not initialized. Call init() first.',
      );
    }
    return MetaMaskSdkClient.instance;
  };

  /** Get the EIP-1193 provider */
  static getProvider = ():
    | ReturnType<MetamaskConnectEVM['getProvider']>
    | undefined => {
    return MetaMaskSdkClient.instance?.getProvider();
  };

  /** Get the current connection status */
  static getStatus = (): string => {
    return MetaMaskSdkClient.instance?.status ?? 'not-initialized';
  };

  /** Get connected accounts (prefers SDK instance, falls back to cache) */
  static getAccounts = (): string[] => {
    const { instance, cachedAccounts } = MetaMaskSdkClient;
    if (!instance) return [];
    return instance.accounts?.length ? instance.accounts : cachedAccounts;
  };

  /** Get the selected (active) account */
  static getSelectedAccount = (): string | undefined => {
    return (
      MetaMaskSdkClient.instance?.selectedAccount ??
      MetaMaskSdkClient.cachedSelectedAccount
    );
  };

  /** Get the selected chain ID (hex format like 0x1) */
  static getSelectedChainId = (): string | undefined => {
    return (
      MetaMaskSdkClient.instance?.selectedChainId ??
      MetaMaskSdkClient.cachedSelectedChainId
    );
  };

  /** Update cached accounts (used by connector when calling provider methods directly) */
  static setCachedAccounts = (accounts: string[]): void => {
    MetaMaskSdkClient.cachedAccounts = accounts ?? [];
    MetaMaskSdkClient.cachedSelectedAccount = accounts?.[0];
  };

  /** Update cached chain ID */
  static setCachedSelectedChainId = (chainId: string | undefined): void => {
    MetaMaskSdkClient.cachedSelectedChainId = chainId;
  };

  /** Get the display URI for QR code */
  static getDisplayUri = (): string | undefined => MetaMaskSdkClient.displayUri;

  /**
   * Register a one-time callback for the next displayUri event.
   * Used by getAddress to pass Dynamic's onDisplayUri callback.
   */
  static setOnDisplayUriCallback = (callback: (uri: string) => void): void => {
    MetaMaskSdkClient.pendingDisplayUriCallback = callback;
  };

  /** Clear the pending displayUri callback */
  static clearOnDisplayUriCallback = (): void => {
    MetaMaskSdkClient.pendingDisplayUriCallback = null;
  };

  /** Clear all session state (called on disconnect) */
  private static clearSessionState = (): void => {
    MetaMaskSdkClient.displayUri = undefined;
    MetaMaskSdkClient.cachedAccounts = [];
    MetaMaskSdkClient.cachedSelectedAccount = undefined;
    MetaMaskSdkClient.cachedSelectedChainId = undefined;
    MetaMaskSdkClient.autoConnectEmitted = false;
  };

  /**
   * Connect to MetaMask with the given chain IDs.
   * Returns cached session if already connected to avoid duplicate prompts.
   *
   * Note: After disconnect(), the singleton is reset. The connector must call
   * init() before connect() to create a fresh SDK instance.
   */
  static connect = async (
    chainIds: number[],
  ): Promise<{ accounts: string[]; chainId: string }> => {
    const sdk = MetaMaskSdkClient.getInstance();

    // Deduplicate concurrent connect calls
    if (MetaMaskSdkClient.connectPromise) {
      return MetaMaskSdkClient.connectPromise;
    }

    // Return cached session if available (avoids prompting user again)
    // This handles page refresh where SDK recovers session from localStorage
    const existingAccounts = sdk.accounts ?? [];
    const existingChainId = sdk.selectedChainId;

    if (existingAccounts.length > 0 && existingChainId) {
      logger.debug('[MetaMaskSdkClient] Returning existing session');
      return { accounts: existingAccounts, chainId: existingChainId };
    }

    // Convert numeric chain IDs to hex format for SDK
    const hexChainIds = chainIds.map(
      (id) => `0x${id.toString(16)}` as `0x${string}`,
    );

    // Start connection - no defensive disconnect needed since we reinstantiate
    // the SDK after disconnect(), ensuring fresh state and listeners
    MetaMaskSdkClient.connectPromise = sdk
      .connect({ chainIds: hexChainIds })
      .then((result) => {
        MetaMaskSdkClient.cachedAccounts = result.accounts ?? [];
        MetaMaskSdkClient.cachedSelectedAccount = result.accounts?.[0];
        MetaMaskSdkClient.cachedSelectedChainId = result.chainId;
        return {
          accounts: result.accounts as string[],
          chainId: result.chainId as string,
        };
      })
      .finally(() => {
        MetaMaskSdkClient.connectPromise = null;
      });

    return MetaMaskSdkClient.connectPromise;
  };

  /** Deduplicate concurrent eth_requestAccounts calls (prevents double MetaMask prompts) */
  static withRequestAccountsLock = async <T>(
    fn: () => Promise<T>,
  ): Promise<T> => {
    if (MetaMaskSdkClient.requestAccountsPromise) {
      return MetaMaskSdkClient.requestAccountsPromise as Promise<T>;
    }

    MetaMaskSdkClient.requestAccountsPromise = fn().finally(() => {
      MetaMaskSdkClient.requestAccountsPromise = null;
    });

    return MetaMaskSdkClient.requestAccountsPromise as Promise<T>;
  };

  /**
   * Disconnect from MetaMask and reset the singleton.
   *
   * By resetting the singleton, the next connect() will create a fresh SDK
   * instance with fresh event listeners. This avoids issues with stale state
   * and the SDK's internal listener management.
   */
  static disconnect = async (): Promise<void> => {
    if (!MetaMaskSdkClient.instance) return;

    try {
      await MetaMaskSdkClient.instance.disconnect();
    } catch {
      // Ignore disconnect errors - we're resetting anyway
    }

    // Reset singleton - next init() will create fresh SDK instance
    MetaMaskSdkClient.instance = null;
    MetaMaskSdkClient.isInitialized = false;
    MetaMaskSdkClient.initPromise = null;
    MetaMaskSdkClient.clearSessionState();
  };

  static hasEmittedAutoConnect = (): boolean =>
    MetaMaskSdkClient.autoConnectEmitted;
  static markAutoConnectEmitted = (): void => {
    MetaMaskSdkClient.autoConnectEmitted = true;
  };

  /** Switch to a different chain */
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
    // Convert numeric chainId to hex format for SDK
    const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
    await sdk.switchChain({ chainId: hexChainId, chainConfiguration });
  };

  /** Check if session was recovered (status is 'connected' and has accounts) */
  static waitForSessionRecovery = async (): Promise<boolean> => {
    const { instance } = MetaMaskSdkClient;
    if (!instance) return false;
    return instance.status === 'connected' && instance.accounts.length > 0;
  };

  /** Check if there's an existing session (accounts available) */
  static hasSession = (): boolean => {
    return (MetaMaskSdkClient.instance?.accounts.length ?? 0) > 0;
  };

  /** Reset the singleton (for testing) */
  static reset = (): void => {
    MetaMaskSdkClient.instance = null;
    MetaMaskSdkClient.isInitialized = false;
    MetaMaskSdkClient.initPromise = null;
    MetaMaskSdkClient.connectPromise = null;
    MetaMaskSdkClient.requestAccountsPromise = null;
    MetaMaskSdkClient.pendingDisplayUriCallback = null;
    MetaMaskSdkClient.clearSessionState();
  };
}

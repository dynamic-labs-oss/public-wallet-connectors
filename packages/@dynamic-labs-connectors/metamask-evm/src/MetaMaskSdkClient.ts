// Use dynamic import to avoid loading the SDK during SSR
// The SDK's EIP-6963 detection runs immediately on module load,
// which fails on the server where there's no window object.
import type { MetamaskConnectEVM } from '@metamask/connect-evm';
import { logger } from '@dynamic-labs/wallet-connector-core';

import { buildSupportedNetworks, type CaipChainId, type EvmNetwork } from './utils.js';

/**
 * Callback types for SDK events
 */
export interface MetaMaskSdkClientCallbacks {
  onDisplayUri?: (uri: string) => void;
  onConnect?: (result: { chainId: string; accounts: string[] }) => void;
  onDisconnect?: () => void;
  onAccountsChanged?: (accounts: string[]) => void;
  onChainChanged?: (chainId: string) => void;
}

/**
 * Configuration for SDK initialization
 */
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
  private static connectUri: string | undefined = undefined;
  private static initPromise: Promise<void> | null = null;

  static isInitialized = false;

  private constructor() {
    throw new Error('MetaMaskSdkClient is not instantiable');
  }

  /**
   * Initialize the MetaMask SDK.
   * Uses a lock to prevent concurrent initialization.
   */
  static init = async (config: MetaMaskSdkClientConfig): Promise<void> => {
    console.log('[MetaMaskSdkClient] ========== INIT CALLED ==========');
    console.log('[MetaMaskSdkClient] init called at:', new Date().toISOString());
    console.log('[MetaMaskSdkClient] isInitialized:', MetaMaskSdkClient.isInitialized);
    console.log('[MetaMaskSdkClient] initPromise exists:', !!MetaMaskSdkClient.initPromise);

    // If already initialized, return immediately
    if (MetaMaskSdkClient.isInitialized) {
      console.log('[MetaMaskSdkClient] Already initialized, returning existing state');
      console.log('[MetaMaskSdkClient] status:', MetaMaskSdkClient.getStatus());
      console.log('[MetaMaskSdkClient] accounts:', MetaMaskSdkClient.getAccounts());
      logger.debug('[MetaMaskSdkClient] Already initialized, skipping');
      return;
    }

    // If initialization is in progress, wait for it
    if (MetaMaskSdkClient.initPromise) {
      console.log('[MetaMaskSdkClient] Initialization in progress, waiting...');
      logger.debug('[MetaMaskSdkClient] Initialization in progress, waiting...');
      return MetaMaskSdkClient.initPromise;
    }

    // Start initialization with lock
    console.log('[MetaMaskSdkClient] Starting new initialization...');
    MetaMaskSdkClient.initPromise = MetaMaskSdkClient.doInit(config);

    try {
      await MetaMaskSdkClient.initPromise;
    } finally {
      MetaMaskSdkClient.initPromise = null;
    }
  };

  /**
   * Internal initialization logic.
   */
  private static doInit = async (config: MetaMaskSdkClientConfig): Promise<void> => {
    logger.debug('[MetaMaskSdkClient] init called', config);

    // Guard against SSR - SDK requires browser environment
    if (typeof window === 'undefined') {
      logger.debug('[MetaMaskSdkClient] Skipping init - not in browser environment');
      return;
    }

    const supportedNetworks = buildSupportedNetworks(config.evmNetworks);

    // Require at least one network
    if (Object.keys(supportedNetworks).length === 0) {
      throw new Error('[MetaMaskSdkClient] No valid networks with RPC URLs provided');
    }

    logger.debug('[MetaMaskSdkClient] supportedNetworks:', supportedNetworks);

    try {
      // Dynamic import to avoid loading SDK during SSR
      const { createEVMClient } = await import('@metamask/connect-evm');

      const sdk = await createEVMClient({
        dapp: {
          name: config.dappName ?? 'Dynamic',
          url: config.dappUrl ?? (typeof window !== 'undefined' ? window.location.origin : 'https://dynamic.xyz'),
        },
        api: {
          supportedNetworks: supportedNetworks as Record<CaipChainId, string>,
        },
        eventHandlers: {
          displayUri: (uri: string) => {
            logger.debug('[MetaMaskSdkClient] displayUri event:', uri);
            MetaMaskSdkClient.displayUri = uri;
            config.callbacks?.onDisplayUri?.(uri);
          },
          connect: (result) => {
            // With the factory pattern, the SDK fires this event after full initialization
            logger.debug('[MetaMaskSdkClient] connect event:', result);
            config.callbacks?.onConnect?.(result);
          },
          disconnect: () => {
            logger.debug('[MetaMaskSdkClient] disconnect event');
            MetaMaskSdkClient.displayUri = undefined;
            MetaMaskSdkClient.connectUri = undefined;
            config.callbacks?.onDisconnect?.();
          },
          accountsChanged: (accounts) => {
            logger.debug('[MetaMaskSdkClient] accountsChanged event:', accounts);
            config.callbacks?.onAccountsChanged?.(accounts);
          },
          chainChanged: (chainId) => {
            logger.debug('[MetaMaskSdkClient] chainChanged event:', chainId);
            config.callbacks?.onChainChanged?.(chainId);
          },
        },
        debug: false,
      });

      MetaMaskSdkClient.instance = sdk;
      MetaMaskSdkClient.isInitialized = true;

      // In Next.js, the EIP-6963 detection may not be complete when createEVMClient returns.
      // Poll until the SDK reaches a definitive state (not 'pending').
      if (sdk.status === 'pending') {
        const maxWaitMs = 3000;
        const pollIntervalMs = 100;
        const start = Date.now();
        console.log('[MetaMaskSdkClient] SDK status is pending, polling for ready state...');

        while (Date.now() - start < maxWaitMs) {
          // 'connected' = session recovered, 'loaded' = no session, 'disconnected' = no session
          if (sdk.status !== 'pending') {
            console.log('[MetaMaskSdkClient] SDK ready after', Date.now() - start, 'ms, status:', sdk.status);
            break;
          }
          await new Promise((r) => setTimeout(r, pollIntervalMs));
        }
      }

      console.log('[MetaMaskSdkClient] SDK initialized - status:', sdk.status, 'accounts:', sdk.accounts, 'chainId:', sdk.selectedChainId);
      logger.debug('[MetaMaskSdkClient] initialized successfully, status:', sdk.status);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[MetaMaskSdkClient] Failed to initialize:', errorMessage);
      console.error('[MetaMaskSdkClient] Full error:', error);
      logger.error('[MetaMaskSdkClient] Failed to initialize:', errorMessage);
      throw error;
    }
  };

  /**
   * Get the SDK instance. Throws if not initialized.
   */
  static getInstance = (): MetamaskConnectEVM => {
    if (!MetaMaskSdkClient.instance) {
      throw new Error('[MetaMaskSdkClient] Not initialized. Call init() first.');
    }
    return MetaMaskSdkClient.instance;
  };

  /**
   * Get the EIP-1193 provider.
   */
  static getProvider = (): ReturnType<MetamaskConnectEVM['getProvider']> | undefined => {
    if (!MetaMaskSdkClient.instance) return undefined;
    return MetaMaskSdkClient.instance.getProvider();
  };

  /**
   * Get the current connection status.
   */
  static getStatus = (): string => {
    if (!MetaMaskSdkClient.instance) return 'not-initialized';
    return MetaMaskSdkClient.instance.status;
  };

  /**
   * Get connected accounts.
   */
  static getAccounts = (): string[] => {
    if (!MetaMaskSdkClient.instance) return [];
    return MetaMaskSdkClient.instance.accounts;
  };

  /**
   * Get the selected (active) account.
   */
  static getSelectedAccount = (): string | undefined => {
    if (!MetaMaskSdkClient.instance) return undefined;
    return MetaMaskSdkClient.instance.selectedAccount;
  };

  /**
   * Get the selected chain ID (hex format).
   */
  static getSelectedChainId = (): string | undefined => {
    if (!MetaMaskSdkClient.instance) return undefined;
    return MetaMaskSdkClient.instance.selectedChainId;
  };

  /**
   * Get the display URI for QR code.
   */
  static getDisplayUri = (): string | undefined => {
    return MetaMaskSdkClient.displayUri;
  };

  /**
   * Get the connect URI for mobile deeplink retry.
   */
  static getConnectUri = (): string | undefined => {
    return MetaMaskSdkClient.connectUri;
  };

  /**
   * Connect to MetaMask with the given chain IDs.
   */
  static connect = async (chainIds: number[]): Promise<{ accounts: string[]; chainId: number }> => {
    const sdk = MetaMaskSdkClient.getInstance();
    logger.debug('[MetaMaskSdkClient] connect called with chainIds:', chainIds);

    const result = await sdk.connect({ chainIds });
    logger.debug('[MetaMaskSdkClient] connect result:', result);

    return result;
  };

  /**
   * Disconnect from MetaMask.
   */
  static disconnect = async (): Promise<void> => {
    if (!MetaMaskSdkClient.instance) return;

    logger.debug('[MetaMaskSdkClient] disconnect called');
    await MetaMaskSdkClient.instance.disconnect();

    MetaMaskSdkClient.displayUri = undefined;
    MetaMaskSdkClient.connectUri = undefined;
  };

  /**
   * Switch to a different chain.
   */
  static switchChain = async (chainId: number, chainConfiguration?: {
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls?: string[];
  }): Promise<void> => {
    const sdk = MetaMaskSdkClient.getInstance();
    logger.debug('[MetaMaskSdkClient] switchChain called:', { chainId, chainConfiguration });

    await sdk.switchChain({ chainId, chainConfiguration });
  };

  /**
   * Check if session was recovered after SDK initialization.
   * The 2-second delay in doInit() should have allowed session recovery to complete.
   * 
   * @returns true if a session was recovered (status is 'connected' and has accounts)
   */
  static waitForSessionRecovery = async (): Promise<boolean> => {
    if (!MetaMaskSdkClient.instance) {
      logger.debug('[MetaMaskSdkClient] waitForSessionRecovery: not initialized');
      return false;
    }

    const status = MetaMaskSdkClient.instance.status;
    const accounts = MetaMaskSdkClient.instance.accounts;
    const chainId = MetaMaskSdkClient.instance.selectedChainId;

    console.log('[MetaMaskSdkClient] waitForSessionRecovery check:', { status, accounts, chainId });

    // Session is recovered if status is 'connected' and we have accounts
    if (status === 'connected' && accounts.length > 0) {
      console.log('[MetaMaskSdkClient] session recovered!');
      return true;
    }

    console.log('[MetaMaskSdkClient] no session recovered');
    return false;
  };

  /**
   * Check if there's an existing session (accounts available).
   */
  static hasSession = (): boolean => {
    if (!MetaMaskSdkClient.instance) return false;
    return MetaMaskSdkClient.instance.accounts.length > 0;
  };

  /**
   * Reset the singleton (for testing).
   */
  static reset = (): void => {
    MetaMaskSdkClient.instance = null;
    MetaMaskSdkClient.isInitialized = false;
    MetaMaskSdkClient.displayUri = undefined;
    MetaMaskSdkClient.connectUri = undefined;
  };
}

import { createEVMClient, type MetamaskConnectEVM } from '@metamask/connect-evm';
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

  static isInitialized = false;

  private constructor() {
    throw new Error('MetaMaskSdkClient is not instantiable');
  }

  /**
   * Initialize the MetaMask SDK.
   */
  static init = async (config: MetaMaskSdkClientConfig): Promise<void> => {
    if (MetaMaskSdkClient.isInitialized) {
      logger.debug('[MetaMaskSdkClient] Already initialized, skipping');
      return;
    }

    logger.debug('[MetaMaskSdkClient] init called', config);

    const supportedNetworks = buildSupportedNetworks(config.evmNetworks);

    // Require at least one network
    if (Object.keys(supportedNetworks).length === 0) {
      throw new Error('[MetaMaskSdkClient] No valid networks with RPC URLs provided');
    }

    logger.debug('[MetaMaskSdkClient] supportedNetworks:', supportedNetworks);

    try {
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
      logger.debug('[MetaMaskSdkClient] initialized successfully');
    } catch (error) {
      logger.error('[MetaMaskSdkClient] Failed to initialize:', error);
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
   * Reset the singleton (for testing).
   */
  static reset = (): void => {
    MetaMaskSdkClient.instance = null;
    MetaMaskSdkClient.isInitialized = false;
    MetaMaskSdkClient.displayUri = undefined;
    MetaMaskSdkClient.connectUri = undefined;
  };
}

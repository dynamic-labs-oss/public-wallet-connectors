import { logger } from '@dynamic-labs/wallet-connector-core';
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { EthereumInjectedConnector, type IEthereum } from '@dynamic-labs/ethereum';

import { MetaMaskSdkClient } from './MetaMaskSdkClient.js';
import { toNumericChainId } from './utils.js';

/**
 * MetaMask wallet connector for Dynamic.
 * Uses @metamask/connect-evm SDK.
 */
export class MetaMaskEvmWalletConnector extends EthereumInjectedConnector {
  /**
   * The name of the wallet connector.
   * @override Required override from the base connector class
   */
  override name = 'MetaMask';

  /**
   * Whether this connector supports QR code connection.
   */
  override canConnectViaQrCode = true;

  /**
   * The constructor for the connector.
   * @param props The options for the connector
   */
  constructor(props: EthereumWalletConnectorOpts) {
    super({
      ...props,
      metadata: {
        id: 'metamask',
        name: 'MetaMask',
        icon: 'https://iconic.dynamic-static-assets.com/icons/sprite.svg#metamask',
      },
    });

    logger.debug('[MetaMaskEvmWalletConnector] constructed');
  }

  /**
   * Initializes the MetaMask SDK and emits providerReady event.
   * @override Required override from the base connector class
   */
  override async init(): Promise<void> {
    logger.debug('[MetaMaskEvmWalletConnector] init called');

    // Only initialize once
    if (MetaMaskSdkClient.isInitialized) {
      logger.debug('[MetaMaskEvmWalletConnector] SDK already initialized');
      return;
    }

    await MetaMaskSdkClient.init({
      evmNetworks: this.evmNetworks,
      dappName: 'Dynamic',
      callbacks: {
        onAccountsChanged: (accounts) => {
          if (accounts.length === 0) {
            // User disconnected - trigger Dynamic's disconnect flow
            logger.debug('[MetaMaskEvmWalletConnector] accounts empty, triggering disconnect');
          }
        },
        onChainChanged: (chainId) => {
          logger.debug('[MetaMaskEvmWalletConnector] chain changed:', chainId);
        },
        onDisconnect: () => {
          logger.debug('[MetaMaskEvmWalletConnector] disconnected');
        },
      },
    });

    logger.debug('[MetaMaskEvmWalletConnector] emitting providerReady');

    // Emit providerReady so Dynamic knows the connector is available
    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
      shouldAutoConnect: false,
    });
  }

  /**
   * Find and return the MetaMask provider.
   * @override Returns the SDK's EIP-1193 provider wrapped for compatibility
   */
  override findProvider(): IEthereum | undefined {
    const sdkProvider = MetaMaskSdkClient.getProvider();
    if (!sdkProvider) {
      logger.debug('[MetaMaskEvmWalletConnector] findProvider: no provider yet');
      return undefined;
    }

    // Wrap the SDK provider to fix EIP-1193 compatibility issues.
    // The SDK's eth_requestAccounts returns { accounts, chainId } instead of just accounts[].
    const wrappedProvider = {
      ...sdkProvider,
      request: async (args: { method: string; params?: unknown[] }) => {
        const result = await sdkProvider.request(args);

        // Fix: eth_requestAccounts returns { accounts, chainId } but should return accounts[]
        if (args.method === 'eth_requestAccounts' && result && typeof result === 'object' && 'accounts' in result) {
          logger.debug('[MetaMaskEvmWalletConnector] Unwrapping eth_requestAccounts result');
          return (result as { accounts: string[] }).accounts;
        }

        return result;
      },
      on: sdkProvider.on?.bind(sdkProvider),
      removeListener: sdkProvider.removeListener?.bind(sdkProvider),
    };

    return wrappedProvider as unknown as IEthereum;
  }

  /**
   * Get the connected address. Triggers connection if not connected.
   * @override Main entry point for wallet connection
   */
  override async getAddress(): Promise<string | undefined> {
    logger.debug('[MetaMaskEvmWalletConnector] getAddress called');

    // Check if already connected
    const existingAccount = MetaMaskSdkClient.getSelectedAccount();
    if (existingAccount) {
      logger.debug('[MetaMaskEvmWalletConnector] returning existing account:', existingAccount);
      return existingAccount;
    }

    // Trigger connection with all configured chain IDs
    const chainIds = this.evmNetworks.map((n) => toNumericChainId(n.chainId));
    logger.debug('[MetaMaskEvmWalletConnector] connecting with chainIds:', chainIds);

    try {
      const { accounts } = await MetaMaskSdkClient.connect(chainIds);
      const address = accounts[0];
      logger.debug('[MetaMaskEvmWalletConnector] connected, address:', address);
      return address;
    } catch (error) {
      logger.error('[MetaMaskEvmWalletConnector] connection failed:', error);
      throw error;
    }
  }

  /**
   * Get connected accounts.
   * @override Returns cached accounts from SDK
   */
  override async getConnectedAccounts(): Promise<string[]> {
    const accounts = MetaMaskSdkClient.getAccounts();
    logger.debug('[MetaMaskEvmWalletConnector] getConnectedAccounts:', accounts);
    return accounts;
  }

  /**
   * End the wallet session.
   * @override Disconnects from MetaMask SDK
   */
  override async endSession(): Promise<void> {
    logger.debug('[MetaMaskEvmWalletConnector] endSession called');
    await MetaMaskSdkClient.disconnect();
  }

  /**
   * Get the QR code URI for mobile connection.
   * Part of IWalletConnectConnector interface.
   */
  getConnectionUri(): string | undefined {
    return MetaMaskSdkClient.getDisplayUri();
  }
}

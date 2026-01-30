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
    console.log('[MetaMaskEvmWalletConnector] constructor called with props:', Object.keys(props || {}));
    try {
      super({
        ...props,
        metadata: {
          id: 'metamask',
          name: 'MetaMask',
          icon: 'https://iconic.dynamic-static-assets.com/icons/sprite.svg#metamask',
        },
      });
      console.log('[MetaMaskEvmWalletConnector] super() completed successfully');
    } catch (error) {
      console.error('[MetaMaskEvmWalletConnector] constructor super() failed:', error);
      console.error('[MetaMaskEvmWalletConnector] error type:', typeof error);
      console.error('[MetaMaskEvmWalletConnector] error constructor:', error?.constructor?.name);
      if (error instanceof Error) {
        console.error('[MetaMaskEvmWalletConnector] error message:', error.message);
        console.error('[MetaMaskEvmWalletConnector] error stack:', error.stack);
      }
      throw error;
    }

    logger.debug('[MetaMaskEvmWalletConnector] constructed');
  }

  /**
   * Initializes the MetaMask SDK and emits providerReady event.
   * With the factory pattern in connect-evm v13+, session recovery is awaited
   * before createEVMClient returns, so state is immediately available.
   * @override Required override from the base connector class
   */
  override async init(): Promise<void> {
    console.log('[MetaMaskEvmWalletConnector] ========== INIT CALLED ==========');
    console.log('[MetaMaskEvmWalletConnector] init called at:', new Date().toISOString());
    console.log('[MetaMaskEvmWalletConnector] MetaMaskSdkClient.isInitialized:', MetaMaskSdkClient.isInitialized);
    console.log('[MetaMaskEvmWalletConnector] evmNetworks:', JSON.stringify(this.evmNetworks?.map(n => ({ chainId: n.chainId, name: n.name })), null, 2));
    logger.debug('[MetaMaskEvmWalletConnector] init called');

    // Only initialize once (MetaMaskSdkClient handles concurrent calls)
    if (MetaMaskSdkClient.isInitialized) {
      console.log('[MetaMaskEvmWalletConnector] SDK already initialized, checking session state...');
      const accounts = MetaMaskSdkClient.getAccounts();
      const status = MetaMaskSdkClient.getStatus();
      console.log('[MetaMaskEvmWalletConnector] existing state - status:', status, 'accounts:', accounts);

      // If already initialized and has session, emit events
      if (accounts.length > 0) {
        console.log('[MetaMaskEvmWalletConnector] already has session, emitting autoConnect');
        this.walletConnectorEventsEmitter.emit('autoConnect', { connector: this });
      }
      logger.debug('[MetaMaskEvmWalletConnector] SDK already initialized');
      return;
    }

    try {
      await MetaMaskSdkClient.init({
        evmNetworks: this.evmNetworks,
        dappName: 'Dynamic',
        callbacks: {
          // This fires after fresh connect (session recovery happens during init)
          onConnect: (result) => {
            console.log('[MetaMaskEvmWalletConnector] onConnect callback fired:', result);
            // Emit autoConnect when SDK notifies us of a new connection
            if (result.accounts?.length > 0 && result.chainId) {
              console.log('[MetaMaskEvmWalletConnector] emitting autoConnect from onConnect callback');
              this.walletConnectorEventsEmitter.emit('autoConnect', {
                connector: this,
              });
            }
          },
          onAccountsChanged: (accounts) => {
            console.log('[MetaMaskEvmWalletConnector] onAccountsChanged:', accounts);
          },
          onChainChanged: (chainId) => {
            console.log('[MetaMaskEvmWalletConnector] onChainChanged:', chainId);
          },
          onDisconnect: () => {
            console.log('[MetaMaskEvmWalletConnector] onDisconnect');
          },
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[MetaMaskEvmWalletConnector] SDK init failed:', errorMessage);
      console.error('[MetaMaskEvmWalletConnector] Full error:', error);
      // Still emit providerReady so the connector shows up
    }

    // With factory pattern, session recovery is complete at this point
    const status = MetaMaskSdkClient.getStatus();
    const accounts = MetaMaskSdkClient.getAccounts();
    const chainId = MetaMaskSdkClient.getSelectedChainId();
    console.log('[MetaMaskEvmWalletConnector] SDK ready - status:', status, 'accounts:', accounts, 'chainId:', chainId);

    // Emit providerReady so Dynamic can show this connector
    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
    });

    // If session was recovered, emit autoConnect
    if (accounts.length > 0 && chainId) {
      console.log('[MetaMaskEvmWalletConnector] session recovered, emitting autoConnect');
      this.walletConnectorEventsEmitter.emit('autoConnect', {
        connector: this,
      });
    } else {
      console.log('[MetaMaskEvmWalletConnector] no session to recover');
    }
  }

  /**
   * Find and return the MetaMask provider from the SDK.
   * The SDK uses EIP-6963 internally to find the correct MetaMask provider.
   * @override Returns the SDK's EIP-1193 provider wrapped for compatibility
   */
  override findProvider(): IEthereum | undefined {
    const sdkProvider = MetaMaskSdkClient.getProvider();
    if (!sdkProvider) {
      console.log('[MetaMaskEvmWalletConnector] findProvider: no provider available');
      return undefined;
    }

    console.log('[MetaMaskEvmWalletConnector] findProvider: using SDK provider');

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

    // Check if already connected via SDK
    const existingAccount = MetaMaskSdkClient.getSelectedAccount();
    if (existingAccount) {
      logger.debug('[MetaMaskEvmWalletConnector] returning SDK account:', existingAccount);
      return existingAccount;
    }

    // Trigger SDK connection with all configured chain IDs
    const chainIds = this.evmNetworks.map((n) => toNumericChainId(n.chainId));
    logger.debug('[MetaMaskEvmWalletConnector] SDK connecting with chainIds:', chainIds);

    try {
      const { accounts } = await MetaMaskSdkClient.connect(chainIds);
      const address = accounts[0];
      logger.debug('[MetaMaskEvmWalletConnector] SDK connected, address:', address);
      return address;
    } catch (error) {
      logger.error('[MetaMaskEvmWalletConnector] SDK connection failed:', error);
      throw error;
    }
  }

  /**
   * Get connected accounts from the SDK.
   * @override Returns accounts from SDK
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

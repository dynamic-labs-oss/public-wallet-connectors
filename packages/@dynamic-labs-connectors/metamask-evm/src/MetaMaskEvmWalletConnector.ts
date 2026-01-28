import { logger } from '@dynamic-labs/wallet-connector-core';
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { EthereumInjectedConnector } from '@dynamic-labs/ethereum';

import { MetaMaskSdkClient } from './MetaMaskSdkClient.js';

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
      return;
    }

    await MetaMaskSdkClient.init();

    logger.debug('[MetaMaskEvmWalletConnector] emitting providerReady');

    // Emit providerReady so Dynamic knows the connector is available
    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
      shouldAutoConnect: false,
    });
  }
}

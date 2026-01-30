import { type WalletConnectorConstructor } from '@dynamic-labs/wallet-connector-core';

import { MetaMaskEvmWalletConnector } from './MetaMaskEvmWalletConnector.js';

export { MetaMaskEvmWalletConnector } from './MetaMaskEvmWalletConnector.js';
export { MetaMaskSdkClient } from './MetaMaskSdkClient.js';

export const MetaMaskEvmWalletConnectors = (
  _props: any,
): WalletConnectorConstructor[] => [
    MetaMaskEvmWalletConnector as unknown as WalletConnectorConstructor,
  ];

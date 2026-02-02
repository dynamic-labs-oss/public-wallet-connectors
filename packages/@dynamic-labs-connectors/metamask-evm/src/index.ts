import { type WalletConnectorConstructor } from '@dynamic-labs/wallet-connector-core';

import { MetaMaskEvmWalletConnector } from './MetaMaskEvmWalletConnector.js';

export { MetaMaskEvmWalletConnector } from './MetaMaskEvmWalletConnector.js';

export const MetaMaskEvmWalletConnectors = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: unknown,
): WalletConnectorConstructor[] => [
    MetaMaskEvmWalletConnector as unknown as WalletConnectorConstructor,
  ];

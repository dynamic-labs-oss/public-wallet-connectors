import { type WalletConnectorConstructor } from '@dynamic-labs/wallet-connector-core';

import { MetaMaskSolanaWalletConnector } from './MetaMaskSolanaWalletConnector.js';

export { MetaMaskSolanaWalletConnector } from './MetaMaskSolanaWalletConnector.js';

export const MetaMaskSolanaWalletConnectors = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: unknown,
): WalletConnectorConstructor[] => [
  MetaMaskSolanaWalletConnector as unknown as WalletConnectorConstructor,
];

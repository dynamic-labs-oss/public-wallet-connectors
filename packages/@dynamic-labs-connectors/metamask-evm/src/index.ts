import {
  type WalletConnectorConstructor,
  type WalletConnectorsMethod,
} from '@dynamic-labs/wallet-connector-core';
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';

import { MetaMaskEvmWalletConnector } from './MetaMaskEvmWalletConnector.js';
import { type MetaMaskStorageClient } from './MetaMaskStorageClient.js';

export { MetaMaskEvmWalletConnector } from './MetaMaskEvmWalletConnector.js';
export type { MetaMaskStorageClient } from './MetaMaskStorageClient.js';

export const MetaMaskEvmWalletConnectors = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: unknown,
): WalletConnectorConstructor[] => [
  MetaMaskEvmWalletConnector as unknown as WalletConnectorConstructor,
];

export type MetaMaskEvmConnectorOpts = {
  storage?: MetaMaskStorageClient;
};

/**
 * Like `MetaMaskEvmWalletConnectors`, but takes a custom storage backend
 * explicitly at the call site instead of relying on it being present on the
 * shared wallet-connector `props` bag (same pattern as `createBaseAccountConnector`).
 */
export const createMetaMaskEvmConnector = (
  metamaskOpts: MetaMaskEvmConnectorOpts = {},
): WalletConnectorsMethod => {
  return () => [
    class extends MetaMaskEvmWalletConnector {
      constructor(props: EthereumWalletConnectorOpts) {
        super({
          ...props,
          ...metamaskOpts,
        });
      }
    } as unknown as WalletConnectorConstructor,
  ];
};

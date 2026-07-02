import { type WalletConnectorConstructor } from '@dynamic-labs/wallet-connector-core';

import { MossEvmWalletConnector } from './MossEvmWalletConnector.js';

export { MossEvmWalletConnector } from './MossEvmWalletConnector.js';

export const MossEvmWalletConnectors = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- we don't care about the props
  _props: any
): WalletConnectorConstructor[] => [MossEvmWalletConnector];

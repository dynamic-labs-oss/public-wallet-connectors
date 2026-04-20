import { type WalletConnectorConstructor } from '@dynamic-labs/wallet-connector-core';
import { GlyphEvmWalletConnector } from './GlyphEvmWalletConnector.js';

export const GlyphEvmWalletConnectors = (useStagingTenant?: boolean) => {
  // eslint-disable-next-line
  return (_props: any): WalletConnectorConstructor[] => [
    class extends GlyphEvmWalletConnector {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(props: any) {
        super(props, useStagingTenant);
      }
    },
  ];
};

import { MossEvmWalletConnectors, MossEvmWalletConnector } from './index.js';

describe('MossEvmWalletConnectors', () => {
  it('should always return the MossEvmWalletConnector', () => {
    expect(MossEvmWalletConnectors({})).toEqual([MossEvmWalletConnector]);
  });
});

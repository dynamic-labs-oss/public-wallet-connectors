import { MetaMaskEvmWalletConnectors, MetaMaskEvmWalletConnector } from './index.js';

// Mock the connect-evm module before it's imported
jest.mock('@metamask/connect-evm', () => ({
  createEVMClient: jest.fn(),
}));

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  ...jest.requireActual('@dynamic-labs/wallet-connector-core'),
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('index exports', () => {
  describe('MetaMaskEvmWalletConnectors', () => {
    it('should export a factory function', () => {
      expect(typeof MetaMaskEvmWalletConnectors).toBe('function');
    });

    it('should return an array with MetaMaskEvmWalletConnector', () => {
      const result = MetaMaskEvmWalletConnectors({});
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });
  });

  describe('MetaMaskEvmWalletConnector', () => {
    it('should export the connector class', () => {
      expect(MetaMaskEvmWalletConnector).toBeDefined();
      expect(typeof MetaMaskEvmWalletConnector).toBe('function');
    });
  });
});

import { MetaMaskEvmWalletConnectors, MetaMaskEvmWalletConnector } from './index.js';

// Mock the connect-evm module before it's imported
jest.mock('@metamask/connect-evm', () => ({
  createEVMClient: jest.fn(),
}));

// Avoid importing the real @dynamic-labs/ethereum dependency tree in unit tests.
// Some transitive deps ship ESM that Jest (node env) won't parse by default.
jest.mock('@dynamic-labs/ethereum', () => {
  class EthereumInjectedConnector {
    public metadata: any;
    public walletConnectorEventsEmitter = { emit: jest.fn() };
    public evmNetworks: any[] = [];
    public constructorProps: any;
    constructor(props: any) {
      this.constructorProps = props;
      this.metadata = props?.metadata ?? {};
      this.evmNetworks = props?.evmNetworks ?? [];
    }
    // default behavior for tests
    findProvider() {
      return undefined;
    }
    isInstalledOnBrowser() {
      return false;
    }
    endSession() {
      return Promise.resolve();
    }
  }
  return { EthereumInjectedConnector };
});

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
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

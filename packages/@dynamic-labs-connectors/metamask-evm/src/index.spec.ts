import {
  MetaMaskEvmWalletConnectors,
  MetaMaskEvmWalletConnector,
  createMetaMaskEvmConnector,
} from './index.js';

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

  describe('createMetaMaskEvmConnector', () => {
    it('should return a WalletConnectorsMethod', () => {
      const method = createMetaMaskEvmConnector();
      expect(typeof method).toBe('function');

      const result = method();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should merge the given storage into the constructor props', () => {
      const storage = { platform: 'rn' } as any;
      const [ConnectorClass] = createMetaMaskEvmConnector({ storage })();

      const instance = new ConnectorClass({ evmNetworks: [] } as any);
      expect((instance as any).constructorProps.storage).toBe(storage);
    });

    it('should preserve the base props passed at construction time', () => {
      const [ConnectorClass] = createMetaMaskEvmConnector({
        storage: {} as any,
      })();

      const evmNetworks = [{ chainId: 1 }];
      const instance = new ConnectorClass({ evmNetworks } as any);
      expect((instance as any).constructorProps.evmNetworks).toBe(
        evmNetworks,
      );
    });

    it('should default to no storage when called with no opts', () => {
      const [ConnectorClass] = createMetaMaskEvmConnector()();

      const instance = new ConnectorClass({ evmNetworks: [] } as any);
      expect((instance as any).constructorProps.storage).toBeUndefined();
    });
  });
});

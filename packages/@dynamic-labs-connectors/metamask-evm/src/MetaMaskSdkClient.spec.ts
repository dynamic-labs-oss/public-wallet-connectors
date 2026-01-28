import { MetaMaskSdkClient, type MetaMaskSdkClientConfig } from './MetaMaskSdkClient.js';

const mockCreateEVMClient = jest.fn();

jest.mock('@metamask/connect-evm', () => ({
  createEVMClient: (...args: unknown[]) => mockCreateEVMClient(...args),
}));

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

const mockSdk = {
  getProvider: jest.fn(),
  status: 'connected',
  accounts: ['0x1234567890abcdef1234567890abcdef12345678'],
  selectedAccount: '0x1234567890abcdef1234567890abcdef12345678',
  selectedChainId: '0x1',
  connect: jest.fn(),
  disconnect: jest.fn(),
  switchChain: jest.fn(),
};

const mockConfig: MetaMaskSdkClientConfig = {
  evmNetworks: [
    { chainId: 1, rpcUrls: ['https://eth.rpc'] },
    { chainId: 137, rpcUrls: ['https://polygon.rpc'] },
  ],
  dappName: 'Test DApp',
  dappUrl: 'https://test.com',
};

describe('MetaMaskSdkClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MetaMaskSdkClient.reset();
    mockCreateEVMClient.mockResolvedValue(mockSdk);
  });

  describe('constructor', () => {
    it('should not be instantiable', () => {
      // @ts-expect-error testing private constructor
      expect(() => new MetaMaskSdkClient()).toThrow('MetaMaskSdkClient is not instantiable');
    });
  });

  describe('init', () => {
    it('should only initialize once', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      expect(mockCreateEVMClient).toHaveBeenCalledTimes(1);

      await MetaMaskSdkClient.init(mockConfig);
      expect(mockCreateEVMClient).toHaveBeenCalledTimes(1);
    });

    it('should set isInitialized to true', async () => {
      expect(MetaMaskSdkClient.isInitialized).toBe(false);
      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.isInitialized).toBe(true);
    });

    it('should call createEVMClient with correct config', async () => {
      await MetaMaskSdkClient.init(mockConfig);

      expect(mockCreateEVMClient).toHaveBeenCalledWith(
        expect.objectContaining({
          dapp: {
            name: 'Test DApp',
            url: 'https://test.com',
          },
          api: {
            supportedNetworks: {
              'eip155:1': 'https://eth.rpc',
              'eip155:137': 'https://polygon.rpc',
            },
          },
          debug: false,
        }),
      );
    });

    it('should throw if no valid networks provided', async () => {
      const configWithNoRpc: MetaMaskSdkClientConfig = {
        evmNetworks: [{ chainId: 1 }], // no rpcUrls
      };

      await expect(MetaMaskSdkClient.init(configWithNoRpc)).rejects.toThrow(
        '[MetaMaskSdkClient] No valid networks with RPC URLs provided',
      );
    });

    it('should invoke onDisplayUri callback', async () => {
      const onDisplayUri = jest.fn();
      const configWithCallbacks: MetaMaskSdkClientConfig = {
        ...mockConfig,
        callbacks: { onDisplayUri },
      };

      // Capture the eventHandlers passed to createEVMClient
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(configWithCallbacks);

      // Simulate displayUri event
      capturedEventHandlers.displayUri('wc:test-uri');
      expect(onDisplayUri).toHaveBeenCalledWith('wc:test-uri');
    });

    it('should invoke onConnect callback', async () => {
      const onConnect = jest.fn();
      const configWithCallbacks: MetaMaskSdkClientConfig = {
        ...mockConfig,
        callbacks: { onConnect },
      };

      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(configWithCallbacks);

      capturedEventHandlers.connect({ chainId: '0x1', accounts: ['0x123'] });
      expect(onConnect).toHaveBeenCalledWith({ chainId: '0x1', accounts: ['0x123'] });
    });

    it('should invoke onDisconnect callback', async () => {
      const onDisconnect = jest.fn();
      const configWithCallbacks: MetaMaskSdkClientConfig = {
        ...mockConfig,
        callbacks: { onDisconnect },
      };

      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(configWithCallbacks);

      capturedEventHandlers.disconnect();
      expect(onDisconnect).toHaveBeenCalled();
    });

    it('should use default dapp values when not provided', async () => {
      const minimalConfig: MetaMaskSdkClientConfig = {
        evmNetworks: [{ chainId: 1, rpcUrls: ['https://eth.rpc'] }],
      };

      await MetaMaskSdkClient.init(minimalConfig);

      expect(mockCreateEVMClient).toHaveBeenCalledWith(
        expect.objectContaining({
          dapp: {
            name: 'Dynamic',
            url: expect.any(String),
          },
        }),
      );
    });
  });

  describe('getInstance', () => {
    it('should throw if not initialized', () => {
      expect(() => MetaMaskSdkClient.getInstance()).toThrow(
        '[MetaMaskSdkClient] Not initialized. Call init() first.',
      );
    });

    it('should return SDK instance after init', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.getInstance()).toBe(mockSdk);
    });
  });

  describe('getProvider', () => {
    it('should return undefined if not initialized', () => {
      expect(MetaMaskSdkClient.getProvider()).toBeUndefined();
    });

    it('should return provider after init', async () => {
      const mockProvider = { request: jest.fn() };
      mockSdk.getProvider.mockReturnValue(mockProvider);

      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.getProvider()).toBe(mockProvider);
    });
  });

  describe('getStatus', () => {
    it('should return not-initialized before init', () => {
      expect(MetaMaskSdkClient.getStatus()).toBe('not-initialized');
    });

    it('should return SDK status after init', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.getStatus()).toBe('connected');
    });
  });

  describe('getAccounts', () => {
    it('should return empty array if not initialized', () => {
      expect(MetaMaskSdkClient.getAccounts()).toEqual([]);
    });

    it('should return SDK accounts after init', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.getAccounts()).toEqual([
        '0x1234567890abcdef1234567890abcdef12345678',
      ]);
    });
  });

  describe('getSelectedAccount', () => {
    it('should return undefined if not initialized', () => {
      expect(MetaMaskSdkClient.getSelectedAccount()).toBeUndefined();
    });

    it('should return selected account after init', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.getSelectedAccount()).toBe(
        '0x1234567890abcdef1234567890abcdef12345678',
      );
    });
  });

  describe('getSelectedChainId', () => {
    it('should return undefined if not initialized', () => {
      expect(MetaMaskSdkClient.getSelectedChainId()).toBeUndefined();
    });

    it('should return selected chain ID after init', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.getSelectedChainId()).toBe('0x1');
    });
  });

  describe('getDisplayUri', () => {
    it('should return undefined before set', () => {
      expect(MetaMaskSdkClient.getDisplayUri()).toBeUndefined();
    });

    it('should return URI after displayUri event', async () => {
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(mockConfig);
      capturedEventHandlers.displayUri('wc:test-uri');

      expect(MetaMaskSdkClient.getDisplayUri()).toBe('wc:test-uri');
    });
  });

  describe('getConnectUri', () => {
    it('should return undefined (not set in current implementation)', () => {
      expect(MetaMaskSdkClient.getConnectUri()).toBeUndefined();
    });
  });

  describe('connect', () => {
    it('should call SDK connect with chainIds', async () => {
      mockSdk.connect.mockResolvedValue({ accounts: ['0x123'], chainId: 1 });
      await MetaMaskSdkClient.init(mockConfig);

      await MetaMaskSdkClient.connect([1, 137]);

      expect(mockSdk.connect).toHaveBeenCalledWith({ chainIds: [1, 137] });
    });

    it('should return accounts and chainId', async () => {
      mockSdk.connect.mockResolvedValue({ accounts: ['0x123'], chainId: 1 });
      await MetaMaskSdkClient.init(mockConfig);

      const result = await MetaMaskSdkClient.connect([1]);

      expect(result).toEqual({ accounts: ['0x123'], chainId: 1 });
    });
  });

  describe('disconnect', () => {
    it('should do nothing if not initialized', async () => {
      await expect(MetaMaskSdkClient.disconnect()).resolves.not.toThrow();
    });

    it('should call SDK disconnect', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      await MetaMaskSdkClient.disconnect();

      expect(mockSdk.disconnect).toHaveBeenCalled();
    });

    it('should clear displayUri after disconnect', async () => {
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(mockConfig);
      capturedEventHandlers.displayUri('wc:test-uri');
      expect(MetaMaskSdkClient.getDisplayUri()).toBe('wc:test-uri');

      await MetaMaskSdkClient.disconnect();
      expect(MetaMaskSdkClient.getDisplayUri()).toBeUndefined();
    });
  });

  describe('switchChain', () => {
    it('should call SDK switchChain with chainId', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      await MetaMaskSdkClient.switchChain(137);

      expect(mockSdk.switchChain).toHaveBeenCalledWith({
        chainId: 137,
        chainConfiguration: undefined,
      });
    });

    it('should pass chainConfiguration if provided', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      const chainConfig = {
        chainName: 'Polygon',
        rpcUrls: ['https://polygon.rpc'],
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      };

      await MetaMaskSdkClient.switchChain(137, chainConfig);

      expect(mockSdk.switchChain).toHaveBeenCalledWith({
        chainId: 137,
        chainConfiguration: chainConfig,
      });
    });
  });

  describe('reset', () => {
    it('should reset all static properties', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.isInitialized).toBe(true);

      MetaMaskSdkClient.reset();

      expect(MetaMaskSdkClient.isInitialized).toBe(false);
      expect(MetaMaskSdkClient.getDisplayUri()).toBeUndefined();
      expect(MetaMaskSdkClient.getConnectUri()).toBeUndefined();
    });
  });
});

import {
  MetaMaskSdkClient,
  type MetaMaskSdkClientConfig,
} from './MetaMaskSdkClient.js';

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

// Mock window for SSR guard - tests need browser environment
const originalWindow = global.window;
beforeAll(() => {
  // @ts-expect-error - mocking window for tests
  global.window = { location: { origin: 'https://test.com' } };
});
afterAll(() => {
  global.window = originalWindow;
});

const mockSdk: {
  getProvider: jest.Mock;
  status: string;
  accounts: string[];
  selectedAccount: string | undefined;
  selectedChainId: string | undefined;
  connect: jest.Mock;
  disconnect: jest.Mock;
  switchChain: jest.Mock;
} = {
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

    // Reset mockSdk to default state
    mockSdk.status = 'connected';
    mockSdk.accounts = ['0x1234567890abcdef1234567890abcdef12345678'];
    mockSdk.selectedAccount = '0x1234567890abcdef1234567890abcdef12345678';
    mockSdk.selectedChainId = '0x1';
    mockSdk.connect.mockClear();
    mockSdk.disconnect.mockClear();
    mockSdk.switchChain.mockClear();

    mockCreateEVMClient.mockResolvedValue(mockSdk);
  });

  describe('constructor', () => {
    it('should not be instantiable', () => {
      // @ts-expect-error testing private constructor
      expect(() => new MetaMaskSdkClient()).toThrow(
        'MetaMaskSdkClient is not instantiable',
      );
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
              '0x1': 'https://eth.rpc',
              '0x89': 'https://polygon.rpc',
            },
          },
          ui: {
            headless: true,
            preferExtension: true,
          },
          debug: false,
        }),
      );
    });

    it('should throw if no valid networks provided', async () => {
      const configWithNoRpc: MetaMaskSdkClientConfig = {
        evmNetworks: [{ chainId: 99999 }],
      };

      await expect(MetaMaskSdkClient.init(configWithNoRpc)).rejects.toThrow(
        '[MetaMaskSdkClient] No valid networks with RPC URLs provided',
      );
    });

    it('should cache SDK accounts and state after init', async () => {
      await MetaMaskSdkClient.init(mockConfig);

      expect(MetaMaskSdkClient.getAccounts()).toEqual([
        '0x1234567890abcdef1234567890abcdef12345678',
      ]);
      expect(MetaMaskSdkClient.getSelectedAccount()).toBe(
        '0x1234567890abcdef1234567890abcdef12345678',
      );
      expect(MetaMaskSdkClient.getSelectedChainId()).toBe('0x1');
    });

    it('should invoke event callbacks', async () => {
      const onDisplayUri = jest.fn();
      const onConnect = jest.fn();
      const onDisconnect = jest.fn();
      const onAccountsChanged = jest.fn();
      const onChainChanged = jest.fn();

      const configWithCallbacks: MetaMaskSdkClientConfig = {
        ...mockConfig,
        callbacks: {
          onDisplayUri,
          onConnect,
          onDisconnect,
          onAccountsChanged,
          onChainChanged,
        },
      };

      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(configWithCallbacks);

      // Test displayUri event
      capturedEventHandlers.displayUri('wc:test-uri');
      expect(onDisplayUri).toHaveBeenCalledWith('wc:test-uri');

      // Test connect event
      capturedEventHandlers.connect({ chainId: '0x1', accounts: ['0x123'] });
      expect(onConnect).toHaveBeenCalledWith({
        chainId: '0x1',
        accounts: ['0x123'],
      });

      // Test disconnect event
      capturedEventHandlers.disconnect();
      expect(onDisconnect).toHaveBeenCalled();

      // Test accountsChanged event
      capturedEventHandlers.accountsChanged(['0xnew']);
      expect(onAccountsChanged).toHaveBeenCalledWith(['0xnew']);

      // Test chainChanged event
      capturedEventHandlers.chainChanged('0x89');
      expect(onChainChanged).toHaveBeenCalledWith('0x89');
    });

    it('should clear session state on disconnect event', async () => {
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(mockConfig);

      // Set a displayUri
      capturedEventHandlers.displayUri('wc:test-uri');
      expect(MetaMaskSdkClient.getDisplayUri()).toBe('wc:test-uri');

      // Trigger disconnect - also clear mockSdk state
      mockSdk.accounts = [];
      mockSdk.selectedAccount = undefined;
      mockSdk.selectedChainId = undefined;
      capturedEventHandlers.disconnect();

      // Should clear session state
      expect(MetaMaskSdkClient.getDisplayUri()).toBeUndefined();
      expect(MetaMaskSdkClient.getAccounts()).toEqual([]);
      expect(MetaMaskSdkClient.getSelectedAccount()).toBeUndefined();
      expect(MetaMaskSdkClient.getSelectedChainId()).toBeUndefined();
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
            url: 'https://test.com',
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

    it('should fall back to cached accounts if SDK accounts is empty', async () => {
      await MetaMaskSdkClient.init(mockConfig);

      // Simulate SDK accounts being cleared but cache still has them
      mockSdk.accounts = [];
      MetaMaskSdkClient.setCachedAccounts(['0xcached']);

      expect(MetaMaskSdkClient.getAccounts()).toEqual(['0xcached']);
    });
  });

  describe('connect', () => {
    it('should call SDK connect when not already connected', async () => {
      const noSessionMock = {
        ...mockSdk,
        accounts: [],
        selectedAccount: undefined,
        selectedChainId: undefined,
        connect: jest
          .fn()
          .mockResolvedValue({ accounts: ['0x123'], chainId: '0x1' }),
      };
      mockCreateEVMClient.mockResolvedValue(noSessionMock);
      await MetaMaskSdkClient.init(mockConfig);

      await MetaMaskSdkClient.connect([1, 137]);

      expect(noSessionMock.connect).toHaveBeenCalledWith({
        chainIds: ['0x1', '0x89'],
      });
    });

    it('should return cached session if already connected', async () => {
      // mockSdk starts with accounts/selectedAccount/selectedChainId already set
      mockSdk.connect.mockResolvedValue({
        accounts: ['0xnew'],
        chainId: '0x89',
      });
      await MetaMaskSdkClient.init(mockConfig);

      // Cache was populated during init
      const result = await MetaMaskSdkClient.connect([1, 137]);

      // Should return cached session without calling sdk.connect
      expect(mockSdk.connect).not.toHaveBeenCalled();
      expect(result.accounts).toContain(
        '0x1234567890abcdef1234567890abcdef12345678',
      );
      expect(result.chainId).toBe('0x1');
    });

    it('should deduplicate concurrent connect calls', async () => {
      const noSessionMock = {
        ...mockSdk,
        accounts: [],
        selectedAccount: undefined,
        selectedChainId: undefined,
        connect: jest
          .fn()
          .mockResolvedValue({ accounts: ['0x123'], chainId: '0x1' }),
      };
      mockCreateEVMClient.mockResolvedValue(noSessionMock);
      await MetaMaskSdkClient.init(mockConfig);

      const [result1, result2] = await Promise.all([
        MetaMaskSdkClient.connect([1]),
        MetaMaskSdkClient.connect([1]),
      ]);

      expect(noSessionMock.connect).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });
  });

  describe('disconnect', () => {
    it('should do nothing if not initialized', async () => {
      await expect(MetaMaskSdkClient.disconnect()).resolves.not.toThrow();
    });

    it('should call SDK disconnect and clear state but keep instance alive', async () => {
      await MetaMaskSdkClient.init(mockConfig);

      MetaMaskSdkClient.setCachedAccounts(['0x123']);

      mockSdk.disconnect.mockImplementation(() => {
        mockSdk.accounts = [];
        mockSdk.selectedAccount = undefined;
        mockSdk.selectedChainId = undefined;
        return Promise.resolve();
      });

      await MetaMaskSdkClient.disconnect();

      expect(mockSdk.disconnect).toHaveBeenCalled();
      expect(MetaMaskSdkClient.getAccounts()).toEqual([]);
      expect(MetaMaskSdkClient.getDisplayUri()).toBeUndefined();
      expect(MetaMaskSdkClient.isInitialized).toBe(true);
      expect(() => MetaMaskSdkClient.getInstance()).not.toThrow();
    });
  });

  describe('switchChain', () => {
    it('should call SDK switchChain', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      await MetaMaskSdkClient.switchChain(137);

      expect(mockSdk.switchChain).toHaveBeenCalledWith({
        chainId: '0x89',
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
        chainId: '0x89',
        chainConfiguration: chainConfig,
      });
    });
  });

  describe('reset', () => {
    it('should reset all static properties', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      MetaMaskSdkClient.setCachedAccounts(['0x123']);
      expect(MetaMaskSdkClient.isInitialized).toBe(true);

      MetaMaskSdkClient.reset();

      expect(MetaMaskSdkClient.isInitialized).toBe(false);
      expect(MetaMaskSdkClient.getAccounts()).toEqual([]);
      expect(MetaMaskSdkClient.getDisplayUri()).toBeUndefined();
    });
  });

  describe('cache management', () => {
    it('should update cached accounts and return them when SDK accounts empty', async () => {
      // Init SDK with empty accounts
      mockSdk.accounts = [];
      await MetaMaskSdkClient.init(mockConfig);

      // Set cached accounts
      MetaMaskSdkClient.setCachedAccounts(['0x123', '0x456']);

      // Should return cached accounts since SDK accounts is empty
      expect(MetaMaskSdkClient.getAccounts()).toEqual(['0x123', '0x456']);
    });

    it('should update cached chain ID and return when SDK chain ID missing', async () => {
      // Init SDK with no chain ID
      mockSdk.selectedChainId = undefined;
      await MetaMaskSdkClient.init(mockConfig);

      // Set cached chain ID
      MetaMaskSdkClient.setCachedSelectedChainId('0x89');

      // Should return cached chain ID since SDK selectedChainId is undefined
      expect(MetaMaskSdkClient.getSelectedChainId()).toBe('0x89');
    });
  });

  describe('displayUri callbacks', () => {
    it('should call pending callback on displayUri event', async () => {
      const callback = jest.fn();
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(mockConfig);

      MetaMaskSdkClient.setOnDisplayUriCallback(callback);
      capturedEventHandlers.displayUri('wc:test-uri');

      expect(callback).toHaveBeenCalledWith('wc:test-uri');
    });

    it('should clear callback after use', async () => {
      const callback = jest.fn();
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(mockConfig);

      MetaMaskSdkClient.setOnDisplayUriCallback(callback);
      capturedEventHandlers.displayUri('wc:test-uri');

      // Second event should not call the callback
      callback.mockClear();
      capturedEventHandlers.displayUri('wc:test-uri-2');
      expect(callback).not.toHaveBeenCalled();
    });
  });
});

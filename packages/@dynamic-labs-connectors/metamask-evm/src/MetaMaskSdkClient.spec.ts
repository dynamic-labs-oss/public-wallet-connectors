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

    mockSdk.status = 'connected';
    mockSdk.accounts = ['0x1234567890abcdef1234567890abcdef12345678'];
    mockSdk.selectedAccount = '0x1234567890abcdef1234567890abcdef12345678';
    mockSdk.selectedChainId = '0x1';

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
          dapp: { name: 'Test DApp', url: 'https://test.com' },
          api: {
            supportedNetworks: {
              '0x1': 'https://eth.rpc',
              '0x89': 'https://polygon.rpc',
            },
          },
          ui: { headless: true, preferExtension: true },
          debug: false,
        }),
      );
    });

    it('should throw if no valid networks provided', async () => {
      await expect(
        MetaMaskSdkClient.init({ evmNetworks: [{ chainId: 99999 }] }),
      ).rejects.toThrow(
        '[MetaMaskSdkClient] No valid networks with RPC URLs provided',
      );
    });

    it('should use default dapp values when not provided', async () => {
      await MetaMaskSdkClient.init({
        evmNetworks: [{ chainId: 1, rpcUrls: ['https://eth.rpc'] }],
      });

      expect(mockCreateEVMClient).toHaveBeenCalledWith(
        expect.objectContaining({
          dapp: { name: 'Dynamic', url: 'https://test.com' },
        }),
      );
    });

    it('should deduplicate concurrent init calls', async () => {
      await Promise.all([
        MetaMaskSdkClient.init(mockConfig),
        MetaMaskSdkClient.init(mockConfig),
      ]);
      expect(mockCreateEVMClient).toHaveBeenCalledTimes(1);
    });

    it('should leave isInitialized false when createEVMClient throws', async () => {
      mockCreateEVMClient.mockRejectedValue(new Error('SDK load failed'));

      await expect(MetaMaskSdkClient.init(mockConfig)).rejects.toThrow(
        'SDK load failed',
      );
      expect(MetaMaskSdkClient.isInitialized).toBe(false);
    });

    it('should allow retry after failed init', async () => {
      mockCreateEVMClient.mockRejectedValueOnce(new Error('transient'));
      await expect(MetaMaskSdkClient.init(mockConfig)).rejects.toThrow();

      mockCreateEVMClient.mockResolvedValue(mockSdk);
      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.isInitialized).toBe(true);
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

  describe('onDisplayUri', () => {
    it('should call registered listener when displayUri event fires', async () => {
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(mockConfig);

      const listener = jest.fn();
      MetaMaskSdkClient.onDisplayUri(listener);

      capturedEventHandlers.displayUri('wc:test-uri');
      expect(listener).toHaveBeenCalledWith('wc:test-uri');
    });

    it('should support multiple listeners', async () => {
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(mockConfig);

      const listener1 = jest.fn();
      const listener2 = jest.fn();
      MetaMaskSdkClient.onDisplayUri(listener1);
      MetaMaskSdkClient.onDisplayUri(listener2);

      capturedEventHandlers.displayUri('wc:test-uri');
      expect(listener1).toHaveBeenCalledWith('wc:test-uri');
      expect(listener2).toHaveBeenCalledWith('wc:test-uri');
    });

    it('should return unsubscribe function', async () => {
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(mockConfig);

      const listener = jest.fn();
      const unsubscribe = MetaMaskSdkClient.onDisplayUri(listener);

      unsubscribe();

      capturedEventHandlers.displayUri('wc:test-uri');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    it('should return existing session if already connected', async () => {
      await MetaMaskSdkClient.init(mockConfig);

      const result = await MetaMaskSdkClient.connect([1, 137]);

      expect(mockSdk.connect).not.toHaveBeenCalled();
      expect(result.accounts).toContain(
        '0x1234567890abcdef1234567890abcdef12345678',
      );
      expect(result.chainId).toBe('0x1');
    });

    it('should call SDK connect when not already connected', async () => {
      mockSdk.accounts = [];
      mockSdk.selectedAccount = undefined;
      mockSdk.selectedChainId = undefined;
      mockSdk.connect.mockResolvedValue({
        accounts: ['0x123'],
        chainId: '0x1',
      });

      await MetaMaskSdkClient.init(mockConfig);
      await MetaMaskSdkClient.connect([1, 137]);

      expect(mockSdk.connect).toHaveBeenCalledWith({
        chainIds: ['0x1', '0x89'],
      });
    });

    it('should deduplicate concurrent connect calls', async () => {
      mockSdk.accounts = [];
      mockSdk.selectedChainId = undefined;
      mockSdk.connect.mockResolvedValue({
        accounts: ['0x123'],
        chainId: '0x1',
      });

      await MetaMaskSdkClient.init(mockConfig);

      const [result1, result2] = await Promise.all([
        MetaMaskSdkClient.connect([1]),
        MetaMaskSdkClient.connect([1]),
      ]);

      expect(mockSdk.connect).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
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

    it('should keep instance alive after disconnect', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      await MetaMaskSdkClient.disconnect();

      expect(MetaMaskSdkClient.isInitialized).toBe(true);
      expect(() => MetaMaskSdkClient.getInstance()).not.toThrow();
    });

    it('should swallow disconnect errors', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      mockSdk.disconnect.mockRejectedValue(new Error('disconnect failed'));

      await expect(MetaMaskSdkClient.disconnect()).resolves.not.toThrow();
    });
  });

  describe('switchChain', () => {
    it('should call SDK switchChain with hex chain ID', async () => {
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
    it('should reset all state', async () => {
      await MetaMaskSdkClient.init(mockConfig);
      expect(MetaMaskSdkClient.isInitialized).toBe(true);

      MetaMaskSdkClient.reset();

      expect(MetaMaskSdkClient.isInitialized).toBe(false);
      expect(() => MetaMaskSdkClient.getInstance()).toThrow();
      expect(MetaMaskSdkClient.getProvider()).toBeUndefined();
    });

    it('should clear displayUri listeners', async () => {
      let capturedEventHandlers: any;
      mockCreateEVMClient.mockImplementation((options) => {
        capturedEventHandlers = options.eventHandlers;
        return Promise.resolve(mockSdk);
      });

      await MetaMaskSdkClient.init(mockConfig);

      const listener = jest.fn();
      MetaMaskSdkClient.onDisplayUri(listener);
      MetaMaskSdkClient.reset();

      // Re-init to get new event handlers
      await MetaMaskSdkClient.init(mockConfig);
      capturedEventHandlers.displayUri('wc:test-uri');
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

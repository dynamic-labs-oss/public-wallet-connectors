import { MetaMaskSolanaSdkClient } from './MetaMaskSolanaSdkClient.js';

const mockConnect = jest.fn();
const mockClientDisconnect = jest.fn();
const mockGetWallet = jest.fn();
const mockMergeOptions = jest.fn();
const mockCore = {
  on: jest.fn(),
  off: jest.fn(),
  mergeOptions: mockMergeOptions,
};

jest.mock('@metamask/connect-solana', () => ({
  createSolanaClient: jest.fn().mockImplementation(async () => ({
    getWallet: mockGetWallet,
    core: mockCore,
    disconnect: mockClientDisconnect,
  })),
}));

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
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

const mockWallet = {
  name: 'MetaMask Connect',
  accounts: [{ address: 'SoLaNa1234', publicKey: new Uint8Array(32) }],
  features: {
    'standard:connect': {
      connect: mockConnect,
    },
    'standard:disconnect': {
      disconnect: mockWalletDisconnect,
    },
  },
};

describe('MetaMaskSolanaSdkClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MetaMaskSolanaSdkClient.reset();
    mockGetWallet.mockReturnValue(mockWallet);
    mockConnect.mockResolvedValue({
      accounts: [{ address: 'SoLaNa1234' }],
    });
    mockClientDisconnect.mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('should not be instantiable', () => {
      // @ts-expect-error testing private constructor
      expect(() => new MetaMaskSolanaSdkClient()).toThrow(
        'MetaMaskSolanaSdkClient is not instantiable',
      );
    });
  });

  describe('init', () => {
    it('should only initialize once', async () => {
      const { createSolanaClient } = await import(
        '@metamask/connect-solana'
      );

      await MetaMaskSolanaSdkClient.init({ dappName: 'Test' });
      expect(createSolanaClient).toHaveBeenCalledTimes(1);

      await MetaMaskSolanaSdkClient.init({ dappName: 'Test' });
      expect(createSolanaClient).toHaveBeenCalledTimes(1);
    });

    it('should set isInitialized to true', async () => {
      expect(MetaMaskSolanaSdkClient.isInitialized).toBe(false);
      await MetaMaskSolanaSdkClient.init({});
      expect(MetaMaskSolanaSdkClient.isInitialized).toBe(true);
    });

    it('should store the wallet reference', async () => {
      await MetaMaskSolanaSdkClient.init({});
      expect(MetaMaskSolanaSdkClient.getWallet()).toBe(mockWallet);
    });

    it('should store the core and set headless mode', async () => {
      await MetaMaskSolanaSdkClient.init({});
      expect(MetaMaskSolanaSdkClient.getCore()).toBe(mockCore);
      expect(mockMergeOptions).toHaveBeenCalledWith({
        ui: { headless: true },
      });
    });
  });

  describe('getAccounts', () => {
    it('should return empty array if not initialized', () => {
      expect(MetaMaskSolanaSdkClient.getAccounts()).toEqual([]);
    });

    it('should return wallet accounts after init', async () => {
      await MetaMaskSolanaSdkClient.init({});
      expect(MetaMaskSolanaSdkClient.getAccounts()).toEqual(['SoLaNa1234']);
    });
  });

  describe('getSelectedAccount', () => {
    it('should return undefined if not initialized', () => {
      expect(MetaMaskSolanaSdkClient.getSelectedAccount()).toBeUndefined();
    });

    it('should return first account after init', async () => {
      await MetaMaskSolanaSdkClient.init({});
      expect(MetaMaskSolanaSdkClient.getSelectedAccount()).toBe('SoLaNa1234');
    });
  });

  describe('connect', () => {
    it('should throw if not initialized', async () => {
      await expect(MetaMaskSolanaSdkClient.connect()).rejects.toThrow(
        'Not initialized',
      );
    });

    it('should return existing account if already connected', async () => {
      await MetaMaskSolanaSdkClient.init({});
      const address = await MetaMaskSolanaSdkClient.connect();
      expect(address).toBe('SoLaNa1234');
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should call standard:connect when no existing accounts', async () => {
      const emptyWallet = {
        ...mockWallet,
        accounts: [] as typeof mockWallet.accounts,
      };
      mockGetWallet.mockReturnValue(emptyWallet);
      await MetaMaskSolanaSdkClient.init({});

      const address = await MetaMaskSolanaSdkClient.connect();
      expect(mockConnect).toHaveBeenCalledWith({ silent: false });
      expect(address).toBe('SoLaNa1234');
    });
  });

  describe('disconnect', () => {
    it('should do nothing if not initialized', async () => {
      await expect(
        MetaMaskSolanaSdkClient.disconnect(),
      ).resolves.not.toThrow();
    });

    it('should call client.disconnect()', async () => {
      await MetaMaskSolanaSdkClient.init({});
      await MetaMaskSolanaSdkClient.disconnect();
      expect(mockClientDisconnect).toHaveBeenCalled();
    });
  });

  describe('onDisplayUri', () => {
    it('should return noop if core is not initialized', () => {
      const listener = jest.fn();
      const unsub = MetaMaskSolanaSdkClient.onDisplayUri(listener);
      expect(typeof unsub).toBe('function');
      expect(mockCore.on).not.toHaveBeenCalled();
    });

    it('should register listener on core', async () => {
      await MetaMaskSolanaSdkClient.init({});
      const listener = jest.fn();
      MetaMaskSolanaSdkClient.onDisplayUri(listener);

      expect(mockCore.on).toHaveBeenCalledWith('display_uri', listener);
    });

    it('should return working unsubscribe function', async () => {
      await MetaMaskSolanaSdkClient.init({});
      const listener = jest.fn();
      const unsub = MetaMaskSolanaSdkClient.onDisplayUri(listener);

      unsub();

      expect(mockCore.off).toHaveBeenCalledWith('display_uri', listener);
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      await MetaMaskSolanaSdkClient.init({});
      expect(MetaMaskSolanaSdkClient.isInitialized).toBe(true);

      MetaMaskSolanaSdkClient.reset();

      expect(MetaMaskSolanaSdkClient.isInitialized).toBe(false);
      expect(MetaMaskSolanaSdkClient.getWallet()).toBeNull();
      expect(MetaMaskSolanaSdkClient.getCore()).toBeNull();
      expect(MetaMaskSolanaSdkClient.getAccounts()).toEqual([]);
    });
  });
});

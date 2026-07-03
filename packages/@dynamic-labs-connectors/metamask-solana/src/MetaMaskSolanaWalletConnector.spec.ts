/* eslint-disable @typescript-eslint/no-explicit-any */
import { MetaMaskSolanaWalletConnector } from './MetaMaskSolanaWalletConnector.js';
import { MetaMaskSolanaSdkClient } from './MetaMaskSolanaSdkClient.js';

jest.mock('@metamask/connect-solana', () => ({
  createSolanaClient: jest.fn(),
}));

const mockEventListeners = {
  handleAccountChange: jest.fn(),
  handleChainChange: jest.fn(),
  handleDisconnect: jest.fn(),
};

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    logVerboseTroubleshootingMessage: jest.fn(),
  },
  eventListenerHandlers: jest.fn(() => mockEventListeners),
}));

jest.mock('@dynamic-labs/solana-core', () => ({
  SolanaWalletConnector: class {
    walletConnectorEventsEmitter = { emit: jest.fn() };
    constructor(_props: any) {
      // no-op
    }
    get key() {
      return 'metamasksol';
    }
    getSelectedNetwork() {
      return { cluster: 'mainnet' };
    }
  },
}));

jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn(),
  Transaction: { from: jest.fn() },
  VersionedTransaction: { deserialize: jest.fn() },
}));

jest.mock('bs58', () => ({
  __esModule: true,
  default: { encode: jest.fn() },
  encode: jest.fn(),
}));

jest.mock('./MetaMaskSolanaSdkClient.js');

jest.mock('./WalletStandardAdapter.js', () => ({
  createWalletStandardAdapter: jest.fn().mockReturnValue({
    signMessage: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    publicKey: undefined,
    isConnected: true,
  }),
}));

const connectorProps = {
  walletBook: {},
} as any;

describe('MetaMaskSolanaWalletConnector', () => {
  let connector: MetaMaskSolanaWalletConnector;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new MetaMaskSolanaWalletConnector(connectorProps);
    emitSpy = jest.spyOn(connector.walletConnectorEventsEmitter, 'emit');

    (MetaMaskSolanaSdkClient.isInitialized as any) = false;
    (MetaMaskSolanaSdkClient.init as jest.Mock).mockResolvedValue(undefined);
    (MetaMaskSolanaSdkClient.connect as jest.Mock).mockResolvedValue(
      'SoLaNa1234',
    );
    (MetaMaskSolanaSdkClient.disconnect as jest.Mock).mockResolvedValue(
      undefined,
    );
    (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([]);
    (MetaMaskSolanaSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(
      undefined,
    );
    (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(null);
    (MetaMaskSolanaSdkClient.getCore as jest.Mock).mockReturnValue(null);
    (MetaMaskSolanaSdkClient.onDisplayUri as jest.Mock).mockReturnValue(
      jest.fn(),
    );
  });

  describe('constructor', () => {
    it('should set name to MetaMask', () => {
      expect(connector.name).toBe('MetaMask');
    });

    it('should set canConnectViaQrCode to true', () => {
      expect(connector.canConnectViaQrCode).toBe(true);
    });

    it('should set overrideKey to metamasksol', () => {
      expect(connector.key).toBe('metamasksol');
    });
  });

  describe('isInstalledOnBrowser', () => {
    const originalWindow = global.window;

    afterEach(() => {
      global.window = originalWindow;
    });

    it('should return false when window is undefined', () => {
      // @ts-expect-error - testing SSR
      delete (global as any).window;
      expect(connector.isInstalledOnBrowser()).toBe(false);
    });

    it('should return true when ethereum.isMetaMask is true', () => {
      (global as any).window = { ethereum: { isMetaMask: true } };
      expect(connector.isInstalledOnBrowser()).toBe(true);
    });

    it('should return false when ethereum is absent', () => {
      (global as any).window = {};
      expect(connector.isInstalledOnBrowser()).toBe(false);
    });

    it('should return false when ethereum.isMetaMask is false', () => {
      (global as any).window = { ethereum: { isMetaMask: false } };
      expect(connector.isInstalledOnBrowser()).toBe(false);
    });
  });

  describe('init', () => {
    it('should call MetaMaskSolanaSdkClient.init', async () => {
      await connector.init();

      expect(MetaMaskSolanaSdkClient.init).toHaveBeenCalledWith({
        dappName: 'Dynamic',
      });
    });

    it('should emit connectorInitStarted with the connector key before initializing', async () => {
      let initCalledWhen: 'before' | 'after' | undefined;
      (MetaMaskSolanaSdkClient.init as jest.Mock).mockImplementation(() => {
        initCalledWhen = emitSpy.mock.calls.some(
          ([event]) => event === 'connectorInitStarted',
        )
          ? 'after'
          : 'before';
        return Promise.resolve();
      });

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith(
        'connectorInitStarted',
        'metamasksol',
      );
      expect(initCalledWhen).toBe('after');
    });

    it('should emit connectorInitCompleted after init resolves', async () => {
      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith(
        'connectorInitCompleted',
        'metamasksol',
      );
    });

    it('should still emit connectorInitCompleted if init throws', async () => {
      (MetaMaskSolanaSdkClient.init as jest.Mock).mockRejectedValue(
        new Error('init failed'),
      );

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith(
        'connectorInitStarted',
        'metamasksol',
      );
      expect(emitSpy).toHaveBeenCalledWith(
        'connectorInitCompleted',
        'metamasksol',
      );
    });
  });

  describe('setupEventListeners', () => {
    const buildWalletWithEvents = () => {
      const off = jest.fn();
      const on = jest.fn().mockReturnValue(off);
      const wallet = {
        accounts: [{ address: 'SoLaNa1234' }],
        features: {
          'standard:events': { on },
        },
      };
      return { wallet, on, off };
    };

    it('should noop when no wallet is available', () => {
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(null);

      connector.setupEventListeners();

      const { eventListenerHandlers } = jest.requireMock(
        '@dynamic-labs/wallet-connector-core',
      );
      expect(eventListenerHandlers).not.toHaveBeenCalled();
      expect(connector.teardownEventListeners).toBeUndefined();
    });

    it('should noop when the wallet does not expose standard:events', () => {
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue({
        accounts: [],
        features: {},
      });

      connector.setupEventListeners();

      const { eventListenerHandlers } = jest.requireMock(
        '@dynamic-labs/wallet-connector-core',
      );
      expect(eventListenerHandlers).not.toHaveBeenCalled();
      expect(connector.teardownEventListeners).toBeUndefined();
    });

    it("should subscribe to the wallet's change event", () => {
      const { wallet, on } = buildWalletWithEvents();
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(wallet);

      connector.setupEventListeners();

      const { eventListenerHandlers } = jest.requireMock(
        '@dynamic-labs/wallet-connector-core',
      );
      expect(eventListenerHandlers).toHaveBeenCalledWith(connector);
      expect(on).toHaveBeenCalledTimes(1);
      expect(on).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should forward updated account addresses to handleAccountChange', () => {
      const { wallet, on } = buildWalletWithEvents();
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(wallet);

      connector.setupEventListeners();

      const changeListener = on.mock.calls[0][1];
      changeListener({
        accounts: [{ address: 'SoLaNa1' }, { address: 'SoLaNa2' }],
      });

      expect(mockEventListeners.handleAccountChange).toHaveBeenCalledWith([
        'SoLaNa1',
        'SoLaNa2',
      ]);
    });

    it('should ignore change events without accounts updates', () => {
      const { wallet, on } = buildWalletWithEvents();
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(wallet);

      connector.setupEventListeners();

      const changeListener = on.mock.calls[0][1];
      changeListener({ chains: ['solana:mainnet'] });

      expect(mockEventListeners.handleAccountChange).not.toHaveBeenCalled();
    });

    it('teardown should call the unsubscribe returned by on()', () => {
      const { wallet, off } = buildWalletWithEvents();
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(wallet);

      connector.setupEventListeners();
      connector.teardownEventListeners?.();

      expect(off).toHaveBeenCalledTimes(1);
    });
  });

  describe('connect', () => {
    it('should call init if not initialized', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = false;

      await connector.connect();

      expect(MetaMaskSolanaSdkClient.init).toHaveBeenCalled();
    });

    it('should call MetaMaskSolanaSdkClient.connect', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;

      await connector.connect();

      expect(MetaMaskSolanaSdkClient.connect).toHaveBeenCalled();
    });

    it('should log troubleshooting context with the resolved wallet', async () => {
      const { logger } = jest.requireMock('@dynamic-labs/wallet-connector-core');
      const mockWallet = { accounts: [{ address: 'SoLaNa1234' }] };
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(
        mockWallet,
      );
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;

      await connector.connect();

      expect(logger.logVerboseTroubleshootingMessage).toHaveBeenCalledWith(
        '[MetaMaskSolanaWalletConnector] buildSigner',
        { wallet: mockWallet },
      );
    });

    it('should pass a cluster resolver to the wallet standard adapter', async () => {
      const { createWalletStandardAdapter } = jest.requireMock(
        './WalletStandardAdapter.js',
      );
      const mockWallet = { accounts: [{ address: 'SoLaNa1234' }] };
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(
        mockWallet,
      );
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;

      await connector.connect();

      const clusterResolver = createWalletStandardAdapter.mock.calls.at(-1)[1];
      expect(clusterResolver()).toBe('mainnet');
    });
  });

  describe('signMessage', () => {
    it('should return undefined if no signer', async () => {
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(null);

      const result = await connector.signMessage('hello');

      expect(result).toBeUndefined();
    });

    it('should encode message and return base64 signature', async () => {
      const mockSignature = new Uint8Array([1, 2, 3, 4]);
      const mockSigner = {
        signMessage: jest.fn().mockResolvedValue({ signature: mockSignature }),
      };

      const { createWalletStandardAdapter } = jest.requireMock(
        './WalletStandardAdapter.js',
      );
      createWalletStandardAdapter.mockReturnValue(mockSigner);

      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue({
        accounts: [{ address: 'SoLaNa1234' }],
      });
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      await connector.connect();

      const result = await connector.signMessage('hello');

      expect(mockSigner.signMessage).toHaveBeenCalled();
      expect(typeof result).toBe('string');
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should return undefined when signer returns no signature', async () => {
      const mockSigner = {
        signMessage: jest.fn().mockResolvedValue(undefined),
      };

      const { createWalletStandardAdapter } = jest.requireMock(
        './WalletStandardAdapter.js',
      );
      createWalletStandardAdapter.mockReturnValue(mockSigner);

      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue({
        accounts: [{ address: 'SoLaNa1234' }],
      });
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      await connector.connect();

      const result = await connector.signMessage('hello');

      expect(result).toBeUndefined();
    });
  });

  describe('getAddress', () => {
    it('should return existing account without connecting', async () => {
      (
        MetaMaskSolanaSdkClient.getSelectedAccount as jest.Mock
      ).mockReturnValue('SoLaNaExisting');

      const address = await connector.getAddress();

      expect(address).toBe('SoLaNaExisting');
      expect(MetaMaskSolanaSdkClient.connect).not.toHaveBeenCalled();
    });

    it('should init and connect when no existing account', async () => {
      (
        MetaMaskSolanaSdkClient.getSelectedAccount as jest.Mock
      ).mockReturnValue(undefined);

      const address = await connector.getAddress();

      expect(MetaMaskSolanaSdkClient.connect).toHaveBeenCalled();
      expect(address).toBe('SoLaNa1234');
    });

    it('should register and cleanup onDisplayUri listener', async () => {
      const unsubscribe = jest.fn();
      (MetaMaskSolanaSdkClient.onDisplayUri as jest.Mock).mockReturnValue(
        unsubscribe,
      );
      (
        MetaMaskSolanaSdkClient.getSelectedAccount as jest.Mock
      ).mockReturnValue(undefined);

      const onDisplayUri = jest.fn();
      await connector.getAddress({ onDisplayUri } as any);

      expect(MetaMaskSolanaSdkClient.onDisplayUri).toHaveBeenCalledWith(
        onDisplayUri,
      );
      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should cleanup listener even on error', async () => {
      const unsubscribe = jest.fn();
      (MetaMaskSolanaSdkClient.onDisplayUri as jest.Mock).mockReturnValue(
        unsubscribe,
      );
      (
        MetaMaskSolanaSdkClient.getSelectedAccount as jest.Mock
      ).mockReturnValue(undefined);
      (MetaMaskSolanaSdkClient.connect as jest.Mock).mockRejectedValue(
        new Error('rejected'),
      );

      const onDisplayUri = jest.fn();
      await expect(
        connector.getAddress({ onDisplayUri } as any),
      ).rejects.toThrow('rejected');
      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should not register listener when no onDisplayUri callback', async () => {
      (
        MetaMaskSolanaSdkClient.getSelectedAccount as jest.Mock
      ).mockReturnValue(undefined);

      await connector.getAddress();

      expect(MetaMaskSolanaSdkClient.onDisplayUri).not.toHaveBeenCalled();
    });
  });

  describe('getConnectedAccounts', () => {
    it('should return accounts from SDK when initialized', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([
        'SoLaNa1234',
        'SoLaNa5678',
      ]);

      const accounts = await connector.getConnectedAccounts();

      expect(accounts).toEqual(['SoLaNa1234', 'SoLaNa5678']);
    });

    it('should initialize SDK if not already initialized', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = false;
      (MetaMaskSolanaSdkClient.init as jest.Mock).mockImplementation(
        async () => {
          (MetaMaskSolanaSdkClient.isInitialized as any) = true;
        },
      );
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([
        'SoLaNaAbc',
      ]);

      const accounts = await connector.getConnectedAccounts();

      expect(MetaMaskSolanaSdkClient.init).toHaveBeenCalled();
      expect(accounts).toEqual(['SoLaNaAbc']);
    });

    it('should attempt silent connect if SDK has no accounts after init', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([]);

      const mockConnectFn = jest.fn().mockResolvedValue({
        accounts: [{ address: 'SoLaNaSilent' }],
      });
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue({
        features: {
          'standard:connect': { connect: mockConnectFn },
        },
      });

      const accounts = await connector.getConnectedAccounts();

      expect(mockConnectFn).toHaveBeenCalledWith({ silent: true });
      expect(accounts).toEqual(['SoLaNaSilent']);
    });

    it('should return empty array if SDK has no accounts and no wallet', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([]);
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(null);

      const accounts = await connector.getConnectedAccounts();

      expect(accounts).toEqual([]);
    });

    it('should return empty array if init fails and no wallet available', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = false;
      (MetaMaskSolanaSdkClient.init as jest.Mock).mockRejectedValue(
        new Error('init failed'),
      );
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([]);
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(null);

      const accounts = await connector.getConnectedAccounts();

      expect(accounts).toEqual([]);
    });

    it('should return empty array if silent connect fails', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([]);

      const mockConnectFn = jest
        .fn()
        .mockRejectedValue(new Error('silent connect failed'));
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue({
        features: {
          'standard:connect': { connect: mockConnectFn },
        },
      });

      const accounts = await connector.getConnectedAccounts();

      expect(accounts).toEqual([]);
    });

    it('should return empty array if wallet has no standard:connect feature', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([]);
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue({
        features: {},
      });

      const accounts = await connector.getConnectedAccounts();

      expect(accounts).toEqual([]);
    });
  });

  describe('endSession', () => {
    it('should call MetaMaskSolanaSdkClient.disconnect', async () => {
      await connector.endSession();

      expect(MetaMaskSolanaSdkClient.disconnect).toHaveBeenCalled();
    });

    it('should clear the signer', async () => {
      const mockSigner = {
        signMessage: jest.fn().mockResolvedValue(new Uint8Array([1])),
      };
      const { createWalletStandardAdapter } = jest.requireMock(
        './WalletStandardAdapter.js',
      );
      createWalletStandardAdapter.mockReturnValue(mockSigner);

      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue({
        accounts: [{ address: 'SoLaNa1234' }],
      });
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      await connector.connect();

      await connector.endSession();

      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue(null);
      const signer = await connector.getSigner();
      expect(signer).toBeUndefined();
    });

    it('should tear down event listeners before disconnecting', async () => {
      const mockUnsubscribe = jest.fn();
      const mockOnFn = jest.fn().mockReturnValue(mockUnsubscribe);
      (MetaMaskSolanaSdkClient.getWallet as jest.Mock).mockReturnValue({
        features: { 'standard:events': { on: mockOnFn } },
        accounts: [],
      });

      connector.setupEventListeners();

      const callOrder: string[] = [];
      mockUnsubscribe.mockImplementation(() => {
        callOrder.push('teardown');
      });
      (MetaMaskSolanaSdkClient.disconnect as jest.Mock).mockImplementation(
        async () => {
          callOrder.push('disconnect');
        },
      );

      await connector.endSession();

      expect(callOrder[0]).toBe('teardown');
      expect(callOrder[callOrder.length - 1]).toBe('disconnect');
    });
  });
});

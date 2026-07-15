/* eslint-disable @typescript-eslint/no-explicit-any */
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { MetaMaskEvmWalletConnector } from './MetaMaskEvmWalletConnector.js';
import { MetaMaskSdkClient } from './MetaMaskSdkClient.js';

jest.mock('@metamask/connect-evm', () => ({
  createEVMClient: jest.fn(),
}));

jest.mock('@dynamic-labs/ethereum', () => {
  class EthereumInjectedConnector {
    public _metadata: any;
    public walletConnectorEventsEmitter = { emit: jest.fn() };
    public evmNetworks: any[] = [];
    public ethProviderHelper: any;
    public constructorProps: any;
    public teardownEventListeners: (() => void) | undefined;
    constructor(props: any) {
      this.constructorProps = props;
      this._metadata = props?.metadata;
      this.evmNetworks = props?.evmNetworks ?? [];
    }
    get metadata() {
      return this._metadata;
    }
    findProvider() {
      return this.ethProviderHelper?.getInstalledProvider();
    }
    isInstalledOnBrowser() {
      return false;
    }
    async getAddress() {
      return this.ethProviderHelper?.getAddress();
    }
    async setupEventListeners() {
      if (!this.ethProviderHelper) return;
      const { tearDownEventListeners } = this.ethProviderHelper._setupEventListeners(this);
      this.teardownEventListeners = tearDownEventListeners;
    }
    async endSession() {
      const provider = this.ethProviderHelper?.findProvider();
      if (!provider) return;
      await provider.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      }).catch(() => {});
    }
  }
  return { EthereumInjectedConnector };
});

jest.mock('./MetaMaskSdkClient.js');

const mockEventListeners = {
  handleAccountChange: jest.fn(),
  handleChainChange: jest.fn(),
  handleDisconnect: jest.fn(),
};

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    logVerboseTroubleshootingMessage: jest.fn(),
  },
  eventListenerHandlers: jest.fn(() => mockEventListeners),
}));

const walletConnectorProps: EthereumWalletConnectorOpts = {
  walletBook: {} as any,
  evmNetworks: [],
} as any as EthereumWalletConnectorOpts;

const mockEvmNetworks = [
  { chainId: 1, rpcUrls: ['https://eth.rpc'] },
  { chainId: 137, rpcUrls: ['https://polygon.rpc'] },
];

const mockSdk = {
  accounts: [] as string[],
  selectedAccount: undefined as string | undefined,
  selectedChainId: undefined as string | undefined,
};

describe('MetaMaskEvmWalletConnector', () => {
  let connector: MetaMaskEvmWalletConnector;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new MetaMaskEvmWalletConnector(walletConnectorProps);
    emitSpy = jest.spyOn(connector.walletConnectorEventsEmitter, 'emit');

    mockSdk.accounts = [];
    mockSdk.selectedAccount = undefined;
    mockSdk.selectedChainId = undefined;

    (MetaMaskSdkClient.isInitialized as any) = false;
    (MetaMaskSdkClient.init as jest.Mock).mockResolvedValue(undefined);
    (MetaMaskSdkClient.getInstance as jest.Mock).mockReturnValue(mockSdk);
    (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(undefined);
    (MetaMaskSdkClient.connect as jest.Mock).mockResolvedValue({
      accounts: ['0x1234567890abcdef1234567890abcdef12345678'],
      chainId: '0x1',
    });
    (MetaMaskSdkClient.disconnect as jest.Mock).mockResolvedValue(undefined);
    (MetaMaskSdkClient.onDisplayUri as jest.Mock).mockReturnValue(jest.fn());
  });

  describe('constructor', () => {
    it('should set name to MetaMask', () => {
      expect(connector.name).toBe('MetaMask');
    });

    it('should set canConnectViaQrCode to true', () => {
      expect(connector.canConnectViaQrCode).toBe(true);
    });

    it('should set overrideKey to metamask', () => {
      expect(connector.overrideKey).toBe('metamask');
    });
  });

  describe('isInstalledOnBrowser', () => {
    it('should return true when ethProviderHelper finds a provider', () => {
      const eip6963ProviderLookup = jest
        .fn()
        .mockReturnValue({ provider: {} });
      Object.defineProperty(connector, 'ethProviderHelper', {
        value: { eip6963ProviderLookup },
        writable: true,
      });
      Object.defineProperty(connector, '_metadata', {
        value: { rdns: 'io.metamask' },
        writable: true,
      });

      expect(connector.isInstalledOnBrowser()).toBe(true);
      expect(eip6963ProviderLookup).toHaveBeenCalledWith('io.metamask');
    });

    it('should return false when ethProviderHelper returns nothing', () => {
      const eip6963ProviderLookup = jest.fn().mockReturnValue(undefined);
      Object.defineProperty(connector, 'ethProviderHelper', {
        value: { eip6963ProviderLookup },
        writable: true,
      });
      Object.defineProperty(connector, '_metadata', {
        value: { rdns: 'io.metamask' },
        writable: true,
      });

      expect(connector.isInstalledOnBrowser()).toBe(false);
    });

    it('should return false when ethProviderHelper is undefined', () => {
      Object.defineProperty(connector, 'ethProviderHelper', {
        value: undefined,
        writable: true,
      });
      Object.defineProperty(connector, '_metadata', {
        value: { rdns: 'io.metamask' },
        writable: true,
      });

      expect(connector.isInstalledOnBrowser()).toBe(false);
    });

    it('should return false when metadata is undefined', () => {
      Object.defineProperty(connector, '_metadata', {
        value: undefined,
        writable: true,
      });

      expect(connector.isInstalledOnBrowser()).toBe(false);
    });

    it('should return false when metadata.rdns is undefined', () => {
      Object.defineProperty(connector, '_metadata', {
        value: { rdns: undefined },
        writable: true,
      });

      expect(connector.isInstalledOnBrowser()).toBe(false);
    });

    it('should log troubleshooting context with metadata and provider', () => {
      const { logger } = jest.requireMock('@dynamic-labs/wallet-connector-core');
      const fakeProvider = { provider: 'fake' };
      const eip6963ProviderLookup = jest.fn().mockReturnValue(fakeProvider);
      Object.defineProperty(connector, 'ethProviderHelper', {
        value: { eip6963ProviderLookup },
        writable: true,
      });
      Object.defineProperty(connector, '_metadata', {
        value: { rdns: 'io.metamask' },
        writable: true,
      });

      connector.isInstalledOnBrowser();

      expect(logger.logVerboseTroubleshootingMessage).toHaveBeenCalledWith(
        '[MetaMaskEvmWalletConnector] isInstalledOnBrowser',
        expect.objectContaining({
          metaMaskEip6963Provider: fakeProvider,
          metadata: { rdns: 'io.metamask' },
        }),
      );
    });
  });

  describe('init', () => {
    beforeEach(() => {
      Object.defineProperty(connector, 'evmNetworks', {
        value: mockEvmNetworks,
        writable: true,
      });
    });

    it('should call MetaMaskSdkClient.init with evmNetworks', async () => {
      await connector.init();

      expect(MetaMaskSdkClient.init).toHaveBeenCalledWith(
        expect.objectContaining({
          evmNetworks: mockEvmNetworks,
          dappName: 'Dynamic',
        }),
      );
    });

    it('should emit connectorInitStarted with overrideKey before initializing', async () => {
      let initCalledWhen: 'before' | 'after' | undefined;
      (MetaMaskSdkClient.init as jest.Mock).mockImplementation(() => {
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
        'metamask',
      );
      expect(initCalledWhen).toBe('after');
    });

    it('should emit connectorInitCompleted after init resolves', async () => {
      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith(
        'connectorInitCompleted',
        'metamask',
      );
    });

    it('should not emit autoConnect or providerReady', async () => {
      mockSdk.accounts = ['0x123'];
      mockSdk.selectedChainId = '0x1';

      await connector.init();

      expect(emitSpy).not.toHaveBeenCalledWith(
        'autoConnect',
        expect.anything(),
      );
      expect(emitSpy).not.toHaveBeenCalledWith(
        'providerReady',
        expect.anything(),
      );
    });

    it('should still emit connectorInitCompleted when SDK init fails', async () => {
      (MetaMaskSdkClient.init as jest.Mock).mockRejectedValue(
        new Error('SDK failed'),
      );

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith(
        'connectorInitStarted',
        'metamask',
      );
      expect(emitSpy).toHaveBeenCalledWith(
        'connectorInitCompleted',
        'metamask',
      );
    });
  });

  describe('findProvider', () => {
    it('should return undefined if SDK has no provider', () => {
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(undefined);
      expect(connector.findProvider()).toBeUndefined();
    });

    it('should log troubleshooting context with the resolved provider', () => {
      const { logger } = jest.requireMock('@dynamic-labs/wallet-connector-core');
      const mockProvider = { selectedAccount: '0x123' };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      connector.findProvider();

      expect(logger.logVerboseTroubleshootingMessage).toHaveBeenCalledWith(
        '[MetaMaskEvmWalletConnector] findProvider (SDK)',
        { provider: mockProvider },
      );
    });

    it('should return wrapped provider', () => {
      const mockProvider = {
        selectedAccount: '0x123',
        request: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      const provider = connector.findProvider();
      expect(provider).toBeDefined();
      expect(provider).not.toBe(mockProvider);
    });

    it('should return undefined when provider has no selectedAccount', () => {
      const mockProvider = {
        selectedAccount: undefined,
        request: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      expect(connector.findProvider()).toBeUndefined();
    });

    it('should normalize eth_requestAccounts object response to array', async () => {
      const mockProvider = {
        selectedAccount: '0x123',
        request: jest.fn().mockResolvedValue({
          accounts: ['0x123', '0x456'],
          chainId: '0x1',
        }),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      const provider = connector.findProvider();
      const result = await provider?.request({
        method: 'eth_requestAccounts',
      });

      expect(result).toEqual(['0x123', '0x456']);
    });

    it('should pass through eth_requestAccounts when already an array', async () => {
      const mockProvider = {
        selectedAccount: '0x123',
        request: jest.fn().mockResolvedValue(['0x123', '0x456']),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      const provider = connector.findProvider();
      const result = await provider?.request({
        method: 'eth_requestAccounts',
      });

      expect(result).toEqual(['0x123', '0x456']);
    });

    it('should pass through other methods unchanged', async () => {
      const mockProvider = {
        selectedAccount: '0x123',
        request: jest.fn().mockResolvedValue('0x1'),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      const provider = connector.findProvider();
      const result = await provider?.request({ method: 'eth_chainId' });

      expect(result).toBe('0x1');
      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'eth_chainId',
      });
    });
  });

  describe('setupEventListeners', () => {
    const buildProviderMock = () => ({
      on: jest.fn(),
      off: jest.fn(),
    });

    it('should noop when no provider is available', async () => {
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(undefined);

      await connector.setupEventListeners();

      const { eventListenerHandlers } = jest.requireMock(
        '@dynamic-labs/wallet-connector-core',
      );
      expect(eventListenerHandlers).not.toHaveBeenCalled();
      expect(connector.teardownEventListeners).toBeUndefined();
    });

    it('should register listeners for accountsChanged/chainChanged/disconnect', async () => {
      const providerMock = buildProviderMock();
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        providerMock,
      );

      await connector.setupEventListeners();

      const { eventListenerHandlers } = jest.requireMock(
        '@dynamic-labs/wallet-connector-core',
      );
      expect(eventListenerHandlers).toHaveBeenCalledWith(connector);

      expect(providerMock.on).toHaveBeenCalledTimes(3);
      expect(providerMock.on).toHaveBeenCalledWith(
        'accountsChanged',
        mockEventListeners.handleAccountChange,
      );
      expect(providerMock.on).toHaveBeenCalledWith(
        'chainChanged',
        mockEventListeners.handleChainChange,
      );
      expect(providerMock.on).toHaveBeenCalledWith(
        'disconnect',
        mockEventListeners.handleDisconnect,
      );
    });

    it('teardown should remove the registered listeners via provider.off', async () => {
      const providerMock = buildProviderMock();
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        providerMock,
      );

      await connector.setupEventListeners();
      connector.teardownEventListeners?.();

      expect(providerMock.off).toHaveBeenCalledTimes(3);
      expect(providerMock.off).toHaveBeenCalledWith(
        'accountsChanged',
        mockEventListeners.handleAccountChange,
      );
      expect(providerMock.off).toHaveBeenCalledWith(
        'chainChanged',
        mockEventListeners.handleChainChange,
      );
      expect(providerMock.off).toHaveBeenCalledWith(
        'disconnect',
        mockEventListeners.handleDisconnect,
      );
    });
  });

  describe('getAddress', () => {
    beforeEach(() => {
      Object.defineProperty(connector, 'evmNetworks', {
        value: mockEvmNetworks,
        writable: true,
      });
    });

    it('should return existing account if connected', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.selectedAccount = '0xexisting';

      const address = await connector.getAddress();

      expect(address).toBe('0xexisting');
      expect(MetaMaskSdkClient.connect).not.toHaveBeenCalled();
    });

    it('should initialize SDK if not initialized', async () => {
      (MetaMaskSdkClient.isInitialized as any) = false;

      await connector.getAddress();

      expect(MetaMaskSdkClient.init).toHaveBeenCalled();
    });

    it('should call SDK connect when no existing account', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.selectedAccount = undefined;

      (MetaMaskSdkClient.connect as jest.Mock).mockResolvedValue({
        accounts: ['0xfromConnect'],
        chainId: '0x1',
      });

      const address = await connector.getAddress();

      expect(MetaMaskSdkClient.connect).toHaveBeenCalledWith([1, 137]);
      expect(address).toBe('0xfromConnect');
    });

    it('should register and cleanup onDisplayUri listener', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.selectedAccount = undefined;

      const unsubscribe = jest.fn();
      (MetaMaskSdkClient.onDisplayUri as jest.Mock).mockReturnValue(
        unsubscribe,
      );

      const onDisplayUri = jest.fn();
      await connector.getAddress({ onDisplayUri } as any);

      expect(MetaMaskSdkClient.onDisplayUri).toHaveBeenCalledWith(onDisplayUri);
      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should cleanup listener even on error', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.selectedAccount = undefined;

      const unsubscribe = jest.fn();
      (MetaMaskSdkClient.onDisplayUri as jest.Mock).mockReturnValue(
        unsubscribe,
      );
      (MetaMaskSdkClient.connect as jest.Mock).mockRejectedValue(
        new Error('User rejected'),
      );

      const onDisplayUri = jest.fn();
      await expect(
        connector.getAddress({ onDisplayUri } as any),
      ).rejects.toThrow('User rejected');
      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should not register displayUri listener when onDisplayUri not provided', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.selectedAccount = undefined;

      await connector.getAddress();

      expect(MetaMaskSdkClient.onDisplayUri).not.toHaveBeenCalled();
    });

    it('should throw on connection error', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.selectedAccount = undefined;

      (MetaMaskSdkClient.connect as jest.Mock).mockRejectedValue(
        new Error('User rejected'),
      );

      await expect(connector.getAddress()).rejects.toThrow('User rejected');
    });
  });

  describe('getConnectedAccounts', () => {
    it('should return accounts from SDK instance', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.accounts = ['0x123', '0x456'];

      const accounts = await connector.getConnectedAccounts();
      expect(accounts).toEqual(['0x123', '0x456']);
    });

    it('should initialize SDK if not already initialized', async () => {
      (MetaMaskSdkClient.isInitialized as any) = false;
      (MetaMaskSdkClient.init as jest.Mock).mockImplementation(async () => {
        (MetaMaskSdkClient.isInitialized as any) = true;
      });
      mockSdk.accounts = ['0xabc'];

      const accounts = await connector.getConnectedAccounts();
      expect(MetaMaskSdkClient.init).toHaveBeenCalled();
      expect(accounts).toEqual(['0xabc']);
    });

    it('should fall back to injected provider if SDK has no accounts after init', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.accounts = [];

      const mockProvider = {
        request: jest.fn().mockResolvedValue(['0xinjected']),
      };
      Object.defineProperty(connector, 'ethProviderHelper', {
        value: { getInstalledProvider: () => mockProvider },
        writable: true,
      });

      const accounts = await connector.getConnectedAccounts();
      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'eth_accounts',
      });
      expect(accounts).toEqual(['0xinjected']);
    });

    it('should return empty array if SDK has no accounts and no injected provider', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.accounts = [];

      Object.defineProperty(connector, 'ethProviderHelper', {
        value: { getInstalledProvider: () => undefined },
        writable: true,
      });

      const accounts = await connector.getConnectedAccounts();
      expect(accounts).toEqual([]);
    });

    it('should return empty array if SDK init fails and no injected provider', async () => {
      (MetaMaskSdkClient.isInitialized as any) = false;
      (MetaMaskSdkClient.init as jest.Mock).mockRejectedValue(
        new Error('init failed'),
      );
      (MetaMaskSdkClient.getInstance as jest.Mock).mockImplementation(() => {
        throw new Error('Not initialized');
      });

      Object.defineProperty(connector, 'ethProviderHelper', {
        value: undefined,
        writable: true,
      });

      const accounts = await connector.getConnectedAccounts();
      expect(accounts).toEqual([]);
    });

    it('should return empty array if injected provider request fails', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.accounts = [];

      const mockProvider = {
        request: jest.fn().mockRejectedValue(new Error('provider error')),
      };
      Object.defineProperty(connector, 'ethProviderHelper', {
        value: { getInstalledProvider: () => mockProvider },
        writable: true,
      });

      const accounts = await connector.getConnectedAccounts();
      expect(accounts).toEqual([]);
    });
  });

  describe('endSession', () => {
    it('should call MetaMaskSdkClient.disconnect', async () => {
      await connector.endSession();
      expect(MetaMaskSdkClient.disconnect).toHaveBeenCalled();
    });

    it('should tear down event listeners before disconnecting', async () => {
      const mockOff = jest.fn();
      const mockProvider = {
        on: jest.fn(),
        off: mockOff,
        selectedAccount: '0x123',
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(mockProvider);

      await connector.setupEventListeners();

      const callOrder: string[] = [];
      mockOff.mockImplementation(() => {
        callOrder.push('teardown');
      });
      (MetaMaskSdkClient.disconnect as jest.Mock).mockImplementation(async () => {
        callOrder.push('disconnect');
      });

      await connector.endSession();

      expect(callOrder[0]).toBe('teardown');
      expect(callOrder[callOrder.length - 1]).toBe('disconnect');
    });
  });

  describe('getConnectionUri', () => {
    it('should return the display URI from MetaMaskSdkClient', () => {
      (MetaMaskSdkClient.getDisplayUri as jest.Mock).mockReturnValue(
        'wc:test-uri',
      );

      expect(connector.getConnectionUri()).toBe('wc:test-uri');
    });

    it('should return undefined when no URI is available', () => {
      (MetaMaskSdkClient.getDisplayUri as jest.Mock).mockReturnValue(undefined);

      expect(connector.getConnectionUri()).toBeUndefined();
    });
  });

  describe('retryDeeplinkConnection', () => {
    it('should call MetaMaskSdkClient.retryDeepLink', () => {
      (MetaMaskSdkClient.retryDeepLink as jest.Mock).mockImplementation(
        jest.fn(),
      );

      connector.retryDeeplinkConnection();

      expect(MetaMaskSdkClient.retryDeepLink).toHaveBeenCalled();
    });
  });

  describe('getSupportedNetworks', () => {
    it('should return chain IDs as decimal strings', async () => {
      Object.defineProperty(connector, 'evmNetworks', {
        value: [{ chainId: 1 }, { chainId: 137 }, { chainId: '0x89' }],
        writable: true,
      });

      const networks = await connector.getSupportedNetworks();
      expect(networks).toEqual(['1', '137', '137']);
    });
  });

  describe('extension-installed delegation', () => {
    let extensionConnector: MetaMaskEvmWalletConnector;
    let mockInjectedProvider: any;

    beforeEach(() => {
      extensionConnector = new MetaMaskEvmWalletConnector(walletConnectorProps);
      mockInjectedProvider = {
        request: jest.fn().mockResolvedValue(['0xExtensionAccount']),
        on: jest.fn(),
        removeListener: jest.fn(),
      };

      // Set up metadata and ethProviderHelper so isInstalledOnBrowser() returns true
      Object.defineProperty(extensionConnector, '_metadata', {
        value: { rdns: 'io.metamask' },
        writable: true,
      });
      Object.defineProperty(extensionConnector, 'ethProviderHelper', {
        value: {
          eip6963ProviderLookup: jest.fn().mockReturnValue({ provider: mockInjectedProvider }),
          getInstalledProvider: jest.fn().mockReturnValue(mockInjectedProvider),
          getAddress: jest.fn().mockResolvedValue('0xExtensionAccount'),
          findProvider: jest.fn().mockReturnValue(mockInjectedProvider),
          _setupEventListeners: jest.fn().mockReturnValue({ tearDownEventListeners: jest.fn() }),
        },
        writable: true,
      });
    });

    it('should delegate findProvider to parent when extension is installed', () => {
      const result = extensionConnector.findProvider();
      expect(result).toBe(mockInjectedProvider);
      expect(MetaMaskSdkClient.getProvider).not.toHaveBeenCalled();
    });

    it('should delegate getAddress to parent when extension is installed', async () => {
      const address = await extensionConnector.getAddress();
      expect(address).toBe('0xExtensionAccount');
      expect(MetaMaskSdkClient.connect).not.toHaveBeenCalled();
    });

    it('should delegate setupEventListeners to parent when extension is installed', async () => {
      await extensionConnector.setupEventListeners();
      expect(extensionConnector.ethProviderHelper._setupEventListeners).toHaveBeenCalled();
      expect(MetaMaskSdkClient.getProvider).not.toHaveBeenCalled();
    });

    it('should delegate getConnectedAccounts to extension provider when installed', async () => {
      const accounts = await extensionConnector.getConnectedAccounts();
      expect(mockInjectedProvider.request).toHaveBeenCalledWith({
        method: 'eth_accounts',
      });
      expect(accounts).toEqual(['0xExtensionAccount']);
    });

    it('should delegate endSession to parent when extension is installed', async () => {
      // Parent's endSession calls wallet_revokePermissions via findProvider
      mockInjectedProvider.request.mockResolvedValue(undefined);
      Object.defineProperty(extensionConnector, 'ethProviderHelper', {
        value: {
          eip6963ProviderLookup: jest.fn().mockReturnValue({ provider: mockInjectedProvider }),
          getInstalledProvider: jest.fn().mockReturnValue(mockInjectedProvider),
          findProvider: jest.fn().mockReturnValue(mockInjectedProvider),
        },
        writable: true,
      });

      await extensionConnector.endSession();
      expect(MetaMaskSdkClient.disconnect).not.toHaveBeenCalled();
    });

    it('should use SDK path for findProvider when extension is NOT installed', () => {
      // Remove the EIP-6963 provider to simulate no extension
      Object.defineProperty(extensionConnector, 'ethProviderHelper', {
        value: {
          eip6963ProviderLookup: jest.fn().mockReturnValue(undefined),
          getInstalledProvider: jest.fn().mockReturnValue(undefined),
        },
        writable: true,
      });

      const mockSdkProvider = { selectedAccount: '0xSdk' };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(mockSdkProvider);

      const result = extensionConnector.findProvider();
      expect(result).toBeDefined();
      expect(MetaMaskSdkClient.getProvider).toHaveBeenCalled();
    });

    it('should use SDK path for getAddress when extension is NOT installed', async () => {
      Object.defineProperty(extensionConnector, 'ethProviderHelper', {
        value: {
          eip6963ProviderLookup: jest.fn().mockReturnValue(undefined),
          getInstalledProvider: jest.fn().mockReturnValue(undefined),
        },
        writable: true,
      });
      Object.defineProperty(extensionConnector, 'evmNetworks', {
        value: mockEvmNetworks,
        writable: true,
      });
      (MetaMaskSdkClient.isInitialized as any) = true;

      const address = await extensionConnector.getAddress();
      expect(address).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(MetaMaskSdkClient.connect).toHaveBeenCalled();
    });
  });
});

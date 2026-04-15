/* eslint-disable @typescript-eslint/no-explicit-any */
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { MetaMaskEvmWalletConnector } from './MetaMaskEvmWalletConnector.js';
import { MetaMaskSdkClient } from './MetaMaskSdkClient.js';

jest.mock('@metamask/connect-evm', () => ({
  createEVMClient: jest.fn(),
}));

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

jest.mock('./MetaMaskSdkClient.js');
jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
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

    it('should set correct metadata', () => {
      expect(connector.metadata).toEqual({
        id: 'metamask',
        name: 'MetaMask',
        icon: 'https://iconic.dynamic-static-assets.com/icons/sprite.svg#metamask',
        rdns: 'io.metamask',
      });
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

    it('should emit providerReady event', async () => {
      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
    });

    it('should emit autoConnect when SDK has session', async () => {
      mockSdk.accounts = ['0x123'];
      mockSdk.selectedChainId = '0x1';

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
      expect(emitSpy).toHaveBeenCalledWith('autoConnect', { connector });
    });

    it('should NOT emit autoConnect when no accounts', async () => {
      mockSdk.accounts = [];
      mockSdk.selectedChainId = '0x1';

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
      expect(emitSpy).not.toHaveBeenCalledWith(
        'autoConnect',
        expect.anything(),
      );
    });

    it('should NOT emit autoConnect when no chainId', async () => {
      mockSdk.accounts = ['0x123'];
      mockSdk.selectedChainId = undefined;

      await connector.init();

      expect(emitSpy).not.toHaveBeenCalledWith(
        'autoConnect',
        expect.anything(),
      );
    });

    it('should skip init if already initialized', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;

      await connector.init();

      expect(MetaMaskSdkClient.init).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalledWith(
        'providerReady',
        expect.anything(),
      );
    });

    it('should emit autoConnect on re-init if SDK has session', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      mockSdk.accounts = ['0x123'];
      mockSdk.selectedChainId = '0x1';

      await connector.init();

      expect(MetaMaskSdkClient.init).not.toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith('autoConnect', { connector });
    });

    it('should still emit providerReady when SDK init fails', async () => {
      (MetaMaskSdkClient.init as jest.Mock).mockRejectedValue(
        new Error('SDK failed'),
      );

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
    });

    it('should only emit autoConnect once per instance', async () => {
      mockSdk.accounts = ['0x123'];
      mockSdk.selectedChainId = '0x1';

      await connector.init();
      emitSpy.mockClear();

      (MetaMaskSdkClient.isInitialized as any) = true;
      await connector.init();

      expect(emitSpy).not.toHaveBeenCalledWith(
        'autoConnect',
        expect.anything(),
      );
    });
  });

  describe('findProvider', () => {
    it('should return undefined if SDK has no provider', () => {
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(undefined);
      expect(connector.findProvider()).toBeUndefined();
    });

    it('should return wrapped provider', () => {
      const mockProvider = {
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

    it('should normalize eth_requestAccounts object response to array', async () => {
      const mockProvider = {
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
      mockSdk.accounts = ['0x123', '0x456'];

      const accounts = await connector.getConnectedAccounts();
      expect(accounts).toEqual(['0x123', '0x456']);
    });

    it('should return empty array if SDK not initialized', async () => {
      (MetaMaskSdkClient.getInstance as jest.Mock).mockImplementation(() => {
        throw new Error('Not initialized');
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
});

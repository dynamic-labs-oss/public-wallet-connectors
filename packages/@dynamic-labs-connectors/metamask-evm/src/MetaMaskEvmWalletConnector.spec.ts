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

describe('MetaMaskEvmWalletConnector', () => {
  let connector: MetaMaskEvmWalletConnector;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new MetaMaskEvmWalletConnector(walletConnectorProps);
    emitSpy = jest.spyOn(connector.walletConnectorEventsEmitter, 'emit');

    // Default mock implementations
    (MetaMaskSdkClient.isInitialized as any) = false;
    (MetaMaskSdkClient.init as jest.Mock).mockResolvedValue(undefined);
    (MetaMaskSdkClient.getStatus as jest.Mock).mockReturnValue('loaded');
    (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(
      undefined,
    );
    (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue([]);
    (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(undefined);
    (MetaMaskSdkClient.getDisplayUri as jest.Mock).mockReturnValue(undefined);
    (MetaMaskSdkClient.getSelectedChainId as jest.Mock).mockReturnValue(
      undefined,
    );
    (MetaMaskSdkClient.hasEmittedAutoConnect as jest.Mock).mockReturnValue(
      false,
    );
    (MetaMaskSdkClient.markAutoConnectEmitted as jest.Mock).mockImplementation(
      () => undefined,
    );
    (MetaMaskSdkClient.connect as jest.Mock).mockResolvedValue({
      accounts: ['0x1234567890abcdef1234567890abcdef12345678'],
      chainId: 1,
    });
    (MetaMaskSdkClient.disconnect as jest.Mock).mockResolvedValue(undefined);
    (MetaMaskSdkClient.setCachedAccounts as jest.Mock).mockImplementation(
      () => undefined,
    );
    (
      MetaMaskSdkClient.setCachedSelectedChainId as jest.Mock
    ).mockImplementation(() => undefined);
    (MetaMaskSdkClient.setOnDisplayUriCallback as jest.Mock).mockImplementation(
      () => undefined,
    );
    (
      MetaMaskSdkClient.clearOnDisplayUriCallback as jest.Mock
    ).mockImplementation(() => undefined);
    (MetaMaskSdkClient.withRequestAccountsLock as jest.Mock).mockImplementation(
      async (fn: any) => fn(),
    );
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

      expect(emitSpy).toHaveBeenCalledWith('providerReady', {
        connector,
      });
    });

    it('should emit autoConnect when session exists with accounts and chainId', async () => {
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue(['0x123']);
      (MetaMaskSdkClient.getSelectedChainId as jest.Mock).mockReturnValue(
        '0x1',
      );

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
      expect(emitSpy).toHaveBeenCalledWith('autoConnect', { connector });
      expect(MetaMaskSdkClient.markAutoConnectEmitted).toHaveBeenCalled();
    });

    it('should NOT emit autoConnect when accounts missing', async () => {
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue([]);
      (MetaMaskSdkClient.getSelectedChainId as jest.Mock).mockReturnValue(
        '0x1',
      );

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
      expect(emitSpy).not.toHaveBeenCalledWith(
        'autoConnect',
        expect.anything(),
      );
    });

    it('should NOT emit autoConnect when chainId missing', async () => {
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue(['0x123']);
      (MetaMaskSdkClient.getSelectedChainId as jest.Mock).mockReturnValue(
        undefined,
      );

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
      expect(emitSpy).not.toHaveBeenCalledWith(
        'autoConnect',
        expect.anything(),
      );
    });

    it('should NOT emit autoConnect if already emitted', async () => {
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue(['0x123']);
      (MetaMaskSdkClient.getSelectedChainId as jest.Mock).mockReturnValue(
        '0x1',
      );
      (MetaMaskSdkClient.hasEmittedAutoConnect as jest.Mock).mockReturnValue(
        true,
      );

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
      expect(emitSpy).not.toHaveBeenCalledWith(
        'autoConnect',
        expect.anything(),
      );
    });

    it('should skip init if already initialized', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue([]);

      await connector.init();

      expect(MetaMaskSdkClient.init).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should emit autoConnect on re-init if already initialized with session', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue(['0x123']);
      (MetaMaskSdkClient.getSelectedChainId as jest.Mock).mockReturnValue(
        '0x1',
      );

      await connector.init();

      expect(MetaMaskSdkClient.init).not.toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith('autoConnect', { connector });
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

    it('should return cached accounts for eth_accounts when available', async () => {
      const mockProvider = {
        request: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue([
        '0x123',
        '0x456',
      ]);

      const provider = connector.findProvider();
      const result = await provider?.request({ method: 'eth_accounts' });

      expect(result).toEqual(['0x123', '0x456']);
      expect(mockProvider.request).not.toHaveBeenCalled();
    });

    it('should return cached accounts for eth_requestAccounts when available', async () => {
      const mockProvider = {
        request: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue([
        '0x123',
        '0x456',
      ]);

      const provider = connector.findProvider();
      const result = await provider?.request({ method: 'eth_requestAccounts' });

      expect(result).toEqual(['0x123', '0x456']);
      expect(mockProvider.request).not.toHaveBeenCalled();
    });

    it('should normalize eth_requestAccounts response from object to array', async () => {
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
      (MetaMaskSdkClient.getAccounts as jest.Mock)
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      const provider = connector.findProvider();
      const result = await provider?.request({ method: 'eth_requestAccounts' });

      expect(result).toEqual(['0x123', '0x456']);
      expect(MetaMaskSdkClient.setCachedAccounts).toHaveBeenCalledWith([
        '0x123',
        '0x456',
      ]);
      expect(MetaMaskSdkClient.setCachedSelectedChainId).toHaveBeenCalledWith(
        '0x1',
      );
    });

    it('should handle eth_requestAccounts when response is already an array', async () => {
      const mockProvider = {
        request: jest.fn().mockResolvedValue(['0x123', '0x456']),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );
      (MetaMaskSdkClient.getAccounts as jest.Mock)
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      const provider = connector.findProvider();
      const result = await provider?.request({ method: 'eth_requestAccounts' });

      expect(result).toEqual(['0x123', '0x456']);
      expect(MetaMaskSdkClient.setCachedAccounts).toHaveBeenCalledWith([
        '0x123',
        '0x456',
      ]);
    });

    it('should use lock for eth_requestAccounts', async () => {
      const mockProvider = {
        request: jest.fn().mockResolvedValue(['0x123']),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue([]);

      const provider = connector.findProvider();
      await provider?.request({ method: 'eth_requestAccounts' });

      expect(MetaMaskSdkClient.withRequestAccountsLock).toHaveBeenCalled();
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
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(
        '0xexisting',
      );

      const address = await connector.getAddress();

      expect(address).toBe('0xexisting');
      expect(MetaMaskSdkClient.connect).not.toHaveBeenCalled();
    });

    it('should initialize SDK if not initialized', async () => {
      (MetaMaskSdkClient.isInitialized as any) = false;
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(
        undefined,
      );

      const mockProvider = {
        request: jest.fn(async ({ method }: { method: string }) => {
          if (method === 'eth_accounts') return [];
          return undefined;
        }),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      await connector.getAddress();

      expect(MetaMaskSdkClient.init).toHaveBeenCalled();
    });

    it('should return account from eth_accounts if available', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(
        undefined,
      );

      const mockProvider = {
        request: jest.fn(async ({ method }: { method: string }) => {
          if (method === 'eth_accounts') return ['0xfromProvider'];
          if (method === 'eth_chainId') return '0x1';
          return undefined;
        }),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      const address = await connector.getAddress();

      expect(address).toBe('0xfromProvider');
      expect(MetaMaskSdkClient.connect).not.toHaveBeenCalled();
    });

    it('should call SDK connect if no accounts from eth_accounts', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(
        undefined,
      );

      const mockProvider = {
        request: jest.fn(async ({ method }: { method: string }) => {
          if (method === 'eth_accounts') return [];
          return undefined;
        }),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );
      (MetaMaskSdkClient.connect as jest.Mock).mockResolvedValue({
        accounts: ['0xfromConnect'],
        chainId: 1,
      });

      const address = await connector.getAddress();

      expect(MetaMaskSdkClient.connect).toHaveBeenCalledWith([1, 137]);
      expect(address).toBe('0xfromConnect');
    });

    it('should register onDisplayUri callback', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(
        undefined,
      );

      const mockProvider = {
        request: jest.fn(async () => []),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      const onDisplayUri = jest.fn();
      await connector.getAddress({ onDisplayUri } as any);

      expect(MetaMaskSdkClient.setOnDisplayUriCallback).toHaveBeenCalledWith(
        onDisplayUri,
      );
      expect(MetaMaskSdkClient.clearOnDisplayUriCallback).toHaveBeenCalled();
    });

    it('should throw on connection error', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(
        undefined,
      );

      const mockProvider = {
        request: jest.fn(async () => []),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );
      (MetaMaskSdkClient.connect as jest.Mock).mockRejectedValue(
        new Error('User rejected'),
      );

      await expect(connector.getAddress()).rejects.toThrow('User rejected');
    });

    it('should deduplicate concurrent getAddress calls', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(
        undefined,
      );

      const mockProvider = {
        request: jest.fn(async () => []),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );
      (MetaMaskSdkClient.connect as jest.Mock).mockResolvedValue({
        accounts: ['0x123'],
        chainId: 1,
      });

      const [addr1, addr2] = await Promise.all([
        connector.getAddress(),
        connector.getAddress(),
      ]);

      expect(addr1).toBe(addr2);
      expect(MetaMaskSdkClient.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('getConnectedAccounts', () => {
    it('should return accounts from SDK', async () => {
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue([
        '0x123',
        '0x456',
      ]);

      const accounts = await connector.getConnectedAccounts();

      expect(accounts).toEqual(['0x123', '0x456']);
    });

    it('should return empty array if no accounts', async () => {
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue([]);

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

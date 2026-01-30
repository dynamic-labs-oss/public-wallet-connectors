/* eslint-disable @typescript-eslint/no-explicit-any */
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { MetaMaskEvmWalletConnector } from './MetaMaskEvmWalletConnector.js';
import { MetaMaskSdkClient } from './MetaMaskSdkClient.js';

// Mock the connect-evm module before MetaMaskSdkClient tries to import it
jest.mock('@metamask/connect-evm', () => ({
  createEVMClient: jest.fn(),
}));

jest.mock('./MetaMaskSdkClient.js');
jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  ...jest.requireActual('@dynamic-labs/wallet-connector-core'),
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
    (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(undefined);
    (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue([]);
    (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(undefined);
    (MetaMaskSdkClient.getDisplayUri as jest.Mock).mockReturnValue(undefined);
    (MetaMaskSdkClient.connect as jest.Mock).mockResolvedValue({
      accounts: ['0x1234567890abcdef1234567890abcdef12345678'],
      chainId: 1,
    });
    (MetaMaskSdkClient.disconnect as jest.Mock).mockResolvedValue(undefined);
    (MetaMaskSdkClient.waitForSessionRecovery as jest.Mock).mockResolvedValue(false);
    (MetaMaskSdkClient.hasSession as jest.Mock).mockReturnValue(false);
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
      });
    });
  });

  describe('init', () => {
    it('should call MetaMaskSdkClient.init with evmNetworks', async () => {
      // Mock the evmNetworks property
      Object.defineProperty(connector, 'evmNetworks', { value: mockEvmNetworks });

      await connector.init();

      expect(MetaMaskSdkClient.init).toHaveBeenCalledWith(
        expect.objectContaining({
          evmNetworks: mockEvmNetworks,
          dappName: 'Dynamic',
        }),
      );
    });

    it('should emit providerReady event when no session', async () => {
      (MetaMaskSdkClient.waitForSessionRecovery as jest.Mock).mockResolvedValue(false);

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', {
        connector,
      });
      // Should NOT emit autoConnect when no session
      expect(emitSpy).not.toHaveBeenCalledWith('autoConnect', expect.anything());
    });

    it('should emit providerReady and autoConnect events when session exists with chainId', async () => {
      Object.defineProperty(connector, 'evmNetworks', { value: mockEvmNetworks });
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue(['0x123']);
      (MetaMaskSdkClient.getSelectedChainId as jest.Mock).mockReturnValue('0x1');

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', {
        connector,
      });
      expect(emitSpy).toHaveBeenCalledWith('autoConnect', {
        connector,
      });
    });

    it('should NOT emit autoConnect when session exists but chainId is missing', async () => {
      Object.defineProperty(connector, 'evmNetworks', { value: mockEvmNetworks });
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue(['0x123']);
      (MetaMaskSdkClient.getSelectedChainId as jest.Mock).mockReturnValue(undefined);

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', {
        connector,
      });
      // Should NOT emit autoConnect without chainId
      expect(emitSpy).not.toHaveBeenCalledWith('autoConnect', expect.anything());
    });

    it('should not re-initialize if already initialized', async () => {
      (MetaMaskSdkClient.isInitialized as any) = true;

      await connector.init();

      expect(MetaMaskSdkClient.init).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should pass callbacks to SDK', async () => {
      await connector.init();

      expect(MetaMaskSdkClient.init).toHaveBeenCalledWith(
        expect.objectContaining({
          callbacks: expect.objectContaining({
            onAccountsChanged: expect.any(Function),
            onChainChanged: expect.any(Function),
            onDisconnect: expect.any(Function),
          }),
        }),
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
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(mockProvider);

      const provider = connector.findProvider();
      expect(provider).toBeDefined();
      expect(provider).not.toBe(mockProvider); // It's wrapped
    });

    it('should unwrap eth_requestAccounts result when it returns object with accounts', async () => {
      const mockProvider = {
        request: jest.fn().mockResolvedValue({
          accounts: ['0x123', '0x456'],
          chainId: 1,
        }),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(mockProvider);

      const provider = connector.findProvider();
      const result = await provider?.request({ method: 'eth_requestAccounts' });

      expect(result).toEqual(['0x123', '0x456']);
    });

    it('should pass through other methods unchanged', async () => {
      const mockProvider = {
        request: jest.fn().mockResolvedValue('0x1'),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(mockProvider);

      const provider = connector.findProvider();
      const result = await provider?.request({ method: 'eth_chainId' });

      expect(result).toBe('0x1');
    });

    it('should pass through eth_requestAccounts if result is already an array', async () => {
      const mockProvider = {
        request: jest.fn().mockResolvedValue(['0x123', '0x456']),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      (MetaMaskSdkClient.getProvider as jest.Mock).mockReturnValue(mockProvider);

      const provider = connector.findProvider();
      const result = await provider?.request({ method: 'eth_requestAccounts' });

      expect(result).toEqual(['0x123', '0x456']);
    });
  });

  describe('getAddress', () => {
    it('should return existing account if connected', async () => {
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue('0xexisting');

      const address = await connector.getAddress();

      expect(address).toBe('0xexisting');
      expect(MetaMaskSdkClient.connect).not.toHaveBeenCalled();
    });

    it('should call connect if not connected', async () => {
      Object.defineProperty(connector, 'evmNetworks', { value: mockEvmNetworks });
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(undefined);

      await connector.getAddress();

      expect(MetaMaskSdkClient.connect).toHaveBeenCalledWith([1, 137]);
    });

    it('should return first account from connect', async () => {
      Object.defineProperty(connector, 'evmNetworks', { value: mockEvmNetworks });
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(undefined);
      (MetaMaskSdkClient.connect as jest.Mock).mockResolvedValue({
        accounts: ['0xfirst', '0xsecond'],
        chainId: 1,
      });

      const address = await connector.getAddress();

      expect(address).toBe('0xfirst');
    });

    it('should throw on connection error', async () => {
      Object.defineProperty(connector, 'evmNetworks', { value: mockEvmNetworks });
      (MetaMaskSdkClient.getSelectedAccount as jest.Mock).mockReturnValue(undefined);
      (MetaMaskSdkClient.connect as jest.Mock).mockRejectedValue(new Error('User rejected'));

      await expect(connector.getAddress()).rejects.toThrow('User rejected');
    });
  });

  describe('getConnectedAccounts', () => {
    it('should return accounts from SDK', async () => {
      (MetaMaskSdkClient.getAccounts as jest.Mock).mockReturnValue(['0x123', '0x456']);

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

  describe('getConnectionUri', () => {
    it('should return displayUri from SDK', () => {
      (MetaMaskSdkClient.getDisplayUri as jest.Mock).mockReturnValue('wc:test-uri');

      expect(connector.getConnectionUri()).toBe('wc:test-uri');
    });

    it('should return undefined when no URI', () => {
      (MetaMaskSdkClient.getDisplayUri as jest.Mock).mockReturnValue(undefined);

      expect(connector.getConnectionUri()).toBeUndefined();
    });
  });

});

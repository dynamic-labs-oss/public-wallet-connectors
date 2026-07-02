/* eslint-disable @typescript-eslint/no-explicit-any */
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { MossEvmWalletConnector } from './MossEvmWalletConnector.js';
import { MossWalletSdkClient } from './MossWalletSdkClient.js';

jest.mock('./MossWalletSdkClient.js');
jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  ...jest.requireActual('@dynamic-labs/wallet-connector-core'),
  logger: {
    debug: jest.fn(),
  },
}));

const walletConnectorProps: EthereumWalletConnectorOpts = {
  walletBook: {} as any,
  evmNetworks: [],
} as any as EthereumWalletConnectorOpts;

describe('MossEvmWalletConnector', () => {
  let connector: MossEvmWalletConnector;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new MossEvmWalletConnector(walletConnectorProps);
    emitSpy = jest.spyOn(connector.walletConnectorEventsEmitter, 'emit');

    (MossWalletSdkClient.getAddress as jest.Mock).mockResolvedValue('0x123');
    (MossWalletSdkClient.isInitialized as any) = false;
  });

  it('should initialize with correct name', () => {
    expect(connector.name).toBe('MOSS Wallet');
  });

  it('should set canConnectViaCustodialService to true', () => {
    expect(connector.canConnectViaCustodialService).toBe(true);
  });

  describe('init', () => {
    it('should initialize SDK and emit providerReady', async () => {
      await connector.init();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(MossWalletSdkClient.init).toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith('providerReady', {
        connector,
        shouldAutoConnect: true,
      });
    });

    it('should emit providerReady with shouldAutoConnect false when no address', async () => {
      (MossWalletSdkClient.getAddress as jest.Mock).mockResolvedValue(undefined);
      await connector.init();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(emitSpy).toHaveBeenCalledWith('providerReady', {
        connector,
        shouldAutoConnect: false,
      });
    });

    it('should not re-initialize when already initialized', async () => {
      (MossWalletSdkClient.isInitialized as any) = true;
      await connector.init();

      expect(MossWalletSdkClient.init).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('supportsNetworkSwitching', () => {
    it('should return false', () => {
      expect(connector.supportsNetworkSwitching()).toBe(false);
    });
  });

  describe('findProvider', () => {
    it('should return the provider from MossWalletSdkClient', () => {
      const mockProvider = {} as any;
      (MossWalletSdkClient.getProvider as jest.Mock).mockReturnValue(
        mockProvider,
      );

      expect(connector.findProvider()).toBe(mockProvider);
    });
  });

  describe('getAddress', () => {
    it('should return the connected address', async () => {
      expect(await connector.getAddress()).toBe('0x123');
    });

    it('should return undefined when not connected', async () => {
      (MossWalletSdkClient.getAddress as jest.Mock).mockResolvedValue(undefined);
      expect(await connector.getAddress()).toBeUndefined();
    });
  });

  describe('getConnectedAccounts', () => {
    it('should return empty array when no address', async () => {
      (MossWalletSdkClient.getAddress as jest.Mock).mockResolvedValue(undefined);
      expect(await connector.getConnectedAccounts()).toEqual([]);
    });

    it('should return accounts and set active account', async () => {
      const setActiveAccountSpy = jest
        .spyOn(connector, 'setActiveAccount')
        .mockImplementation(() => undefined);

      const accounts = await connector.getConnectedAccounts();

      expect(accounts).toEqual(['0x123']);
      expect(setActiveAccountSpy).toHaveBeenCalledWith('0x123');
    });
  });

  describe('signMessage', () => {
    it('should return undefined when no wallet client', async () => {
      jest.spyOn(connector, 'getWalletClient').mockReturnValue(undefined);
      expect(await connector.signMessage('Hello')).toBeUndefined();
    });

    it('should sign a message via wallet client', async () => {
      jest.spyOn(connector, 'getWalletClient').mockReturnValue({
        signMessage: jest.fn().mockResolvedValue('0xsig'),
      } as any);

      expect(await connector.signMessage('Hello')).toBe('0xsig');
    });
  });

  describe('filter', () => {
    it('should return true when provider is available', () => {
      (MossWalletSdkClient.getProvider as jest.Mock).mockReturnValue({});
      expect(connector.filter()).toBe(true);
    });

    it('should return false when provider is not available', () => {
      (MossWalletSdkClient.getProvider as jest.Mock).mockReturnValue(undefined);
      expect(connector.filter()).toBe(false);
    });
  });
});

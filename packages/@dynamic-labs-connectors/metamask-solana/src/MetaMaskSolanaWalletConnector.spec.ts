/* eslint-disable @typescript-eslint/no-explicit-any */
import { MetaMaskSolanaWalletConnector } from './MetaMaskSolanaWalletConnector.js';
import { MetaMaskSolanaSdkClient } from './MetaMaskSolanaSdkClient.js';

jest.mock('@metamask/connect-solana', () => ({
  createSolanaClient: jest.fn(),
}));

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@dynamic-labs/solana-core', () => ({
  SolanaWalletConnector: class {
    walletConnectorEventsEmitter = { emit: jest.fn() };
    constructor(_props: any) {
      // no-op
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

    it('should emit providerReady', async () => {
      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', {
        connector,
      });
    });

    it('should emit autoConnect when accounts exist', async () => {
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([
        'SoLaNa1234',
      ]);

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
      expect(emitSpy).toHaveBeenCalledWith('autoConnect', { connector });
    });

    it('should NOT emit autoConnect when no accounts', async () => {
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([]);

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
      expect(emitSpy).not.toHaveBeenCalledWith(
        'autoConnect',
        expect.anything(),
      );
    });

    it('should skip init if already initialized', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;

      await connector.init();

      expect(MetaMaskSolanaSdkClient.init).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalledWith(
        'providerReady',
        expect.anything(),
      );
    });

    it('should emit autoConnect on re-init if accounts exist', async () => {
      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([
        'SoLaNa1234',
      ]);

      await connector.init();

      expect(MetaMaskSolanaSdkClient.init).not.toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith('autoConnect', { connector });
    });

    it('should only emit autoConnect once per instance', async () => {
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([
        'SoLaNa1234',
      ]);

      await connector.init();
      emitSpy.mockClear();

      (MetaMaskSolanaSdkClient.isInitialized as any) = true;
      await connector.init();

      expect(emitSpy).not.toHaveBeenCalledWith(
        'autoConnect',
        expect.anything(),
      );
    });

    it('should still emit providerReady if init throws', async () => {
      (MetaMaskSolanaSdkClient.init as jest.Mock).mockRejectedValue(
        new Error('init failed'),
      );

      await connector.init();

      expect(emitSpy).toHaveBeenCalledWith('providerReady', { connector });
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
    it('should return accounts from SDK', async () => {
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([
        'SoLaNa1234',
        'SoLaNa5678',
      ]);

      const accounts = await connector.getConnectedAccounts();

      expect(accounts).toEqual(['SoLaNa1234', 'SoLaNa5678']);
    });

    it('should return empty array if no accounts', async () => {
      (MetaMaskSolanaSdkClient.getAccounts as jest.Mock).mockReturnValue([]);

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
  });
});

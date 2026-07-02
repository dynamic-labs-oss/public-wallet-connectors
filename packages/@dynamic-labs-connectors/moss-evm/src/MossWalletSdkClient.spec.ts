import { mega } from '@megaeth-labs/wallet-sdk';
import { MossWalletSdkClient } from './MossWalletSdkClient.js';

jest.mock('@megaeth-labs/wallet-sdk', () => ({
  mega: {
    initialise: jest.fn(),
    status: jest.fn(),
    connect: jest.fn(),
    signMessage: jest.fn(),
    signData: jest.fn(),
    callContract: jest.fn(),
    events: {
      onStatusChange: jest.fn(),
    },
  },
}));

jest.mock('viem/chains', () => ({
  megaeth: { id: 6342 },
  megaethTestnet: { id: 954305 },
}));

jest.mock('viem', () => ({
  hexToString: jest.fn((hex: string) =>
    Buffer.from(hex.replace('0x', ''), 'hex').toString('utf-8'),
  ),
  isAddress: jest.fn((value: string) => /^0x[0-9a-fA-F]{40}$/.test(value)),
  isHex: jest.fn((value: string) => /^0x/.test(value)),
}));

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: { debug: jest.fn() },
}));

const connectedStatus = {
  status: 'connected' as const,
  address: '0xabc123' as `0x${string}`,
  network: 'mainnet' as const,
};

const disconnectedStatus = {
  status: 'disconnected' as const,
  network: 'mainnet' as const,
};

describe('MossWalletSdkClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MossWalletSdkClient.isInitialized = false;
    MossWalletSdkClient.provider = undefined;
  });

  describe('constructor', () => {
    it('should not be instantiable', () => {
      // @ts-expect-error testing private constructor
      expect(() => new MossWalletSdkClient()).toThrow();
    });
  });

  describe('init', () => {
    it('should only initialize once', async () => {
      (mega.initialise as jest.Mock).mockResolvedValue(connectedStatus);

      await MossWalletSdkClient.init();
      await MossWalletSdkClient.init();

      expect(mega.initialise).toHaveBeenCalledTimes(1);
    });

    it('should initialize provider with mainnet chain id when network is mainnet', async () => {
      (mega.initialise as jest.Mock).mockResolvedValue(connectedStatus);

      await MossWalletSdkClient.init();

      expect(MossWalletSdkClient.provider).toBeDefined();
      const chainId = await MossWalletSdkClient.provider!.request({
        method: 'eth_chainId',
      });
      expect(chainId).toBe(`0x${(6342).toString(16)}`);
    });

    it('should fall back to mega.status() when initialise returns undefined', async () => {
      (mega.initialise as jest.Mock).mockResolvedValue(undefined);
      (mega.status as jest.Mock).mockResolvedValue(disconnectedStatus);

      await MossWalletSdkClient.init();

      expect(mega.status).toHaveBeenCalled();
    });

    it('should subscribe to status changes', async () => {
      (mega.initialise as jest.Mock).mockResolvedValue(connectedStatus);

      await MossWalletSdkClient.init();

      expect(mega.events.onStatusChange).toHaveBeenCalled();
    });

    it('should set provider account from initial connected status', async () => {
      (mega.initialise as jest.Mock).mockResolvedValue(connectedStatus);

      await MossWalletSdkClient.init();

      const accounts = (await MossWalletSdkClient.provider!.request({
        method: 'eth_accounts',
      })) as string[];
      expect(accounts).toEqual(['0xabc123']);
    });
  });

  describe('getAddress', () => {
    it('should return undefined when provider is not initialized', async () => {
      expect(await MossWalletSdkClient.getAddress()).toBeUndefined();
    });

    it('should return the connected address', async () => {
      (mega.initialise as jest.Mock).mockResolvedValue(connectedStatus);
      await MossWalletSdkClient.init();

      expect(await MossWalletSdkClient.getAddress()).toBe('0xabc123');
    });

    it('should return undefined when disconnected', async () => {
      (mega.initialise as jest.Mock).mockResolvedValue(disconnectedStatus);
      await MossWalletSdkClient.init();

      expect(await MossWalletSdkClient.getAddress()).toBeUndefined();
    });
  });

  describe('getProvider', () => {
    it('should return undefined when not initialized', () => {
      expect(MossWalletSdkClient.getProvider()).toBeUndefined();
    });

    it('should return the provider after initialization', async () => {
      (mega.initialise as jest.Mock).mockResolvedValue(connectedStatus);
      await MossWalletSdkClient.init();

      expect(MossWalletSdkClient.getProvider()).toBeDefined();
    });
  });
});

describe('MossEip1193Provider (via MossWalletSdkClient)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    MossWalletSdkClient.isInitialized = false;
    MossWalletSdkClient.provider = undefined;

    (mega.initialise as jest.Mock).mockResolvedValue(connectedStatus);
    await MossWalletSdkClient.init();
  });

  describe('eth_accounts', () => {
    it('should return connected accounts', async () => {
      const accounts = await MossWalletSdkClient.provider!.request({
        method: 'eth_accounts',
      });
      expect(accounts).toEqual(['0xabc123']);
    });
  });

  describe('eth_requestAccounts', () => {
    it('should connect and return accounts', async () => {
      (mega.connect as jest.Mock).mockResolvedValue(connectedStatus);

      const accounts = await MossWalletSdkClient.provider!.request({
        method: 'eth_requestAccounts',
      });
      expect(accounts).toEqual(['0xabc123']);
    });

    it('should throw when user rejects', async () => {
      (mega.connect as jest.Mock).mockResolvedValue({
        status: 'cancelled',
        network: 'mainnet',
      });

      await expect(
        MossWalletSdkClient.provider!.request({ method: 'eth_requestAccounts' }),
      ).rejects.toThrow('User rejected the connection request.');
    });
  });

  describe('eth_chainId', () => {
    it('should return mainnet chain id as hex', async () => {
      const chainId = await MossWalletSdkClient.provider!.request({
        method: 'eth_chainId',
      });
      expect(chainId).toBe(`0x${(6342).toString(16)}`);
    });
  });

  describe('personal_sign', () => {
    it('should sign a message', async () => {
      (mega.signMessage as jest.Mock).mockResolvedValue({
        status: 'success',
        signature: '0xsig',
      });

      const sig = await MossWalletSdkClient.provider!.request({
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0xabc123'],
      });
      expect(sig).toBe('0xsig');
    });

    it('should throw when not connected', async () => {
      (mega.initialise as jest.Mock).mockResolvedValue(disconnectedStatus);
      MossWalletSdkClient.isInitialized = false;
      MossWalletSdkClient.provider = undefined;
      await MossWalletSdkClient.init();

      await expect(
        MossWalletSdkClient.provider!.request({
          method: 'personal_sign',
          params: ['0x48656c6c6f', '0xabc123'],
        }),
      ).rejects.toThrow('Not connected to MOSS Wallet.');
    });

    it('should throw when sign is cancelled', async () => {
      (mega.signMessage as jest.Mock).mockResolvedValue({
        status: 'cancelled',
      });

      await expect(
        MossWalletSdkClient.provider!.request({
          method: 'personal_sign',
          params: ['0x48656c6c6f', '0xabc123'],
        }),
      ).rejects.toThrow();
    });
  });

  describe('eth_signTypedData_v4', () => {
    it('should sign typed data from JSON string', async () => {
      (mega.signData as jest.Mock).mockResolvedValue({
        status: 'success',
        signature: '0xtyped',
      });

      const sig = await MossWalletSdkClient.provider!.request({
        method: 'eth_signTypedData_v4',
        params: ['0xabc123', JSON.stringify({ domain: {}, message: {} })],
      });
      expect(sig).toBe('0xtyped');
    });

    it('should sign typed data from object', async () => {
      (mega.signData as jest.Mock).mockResolvedValue({
        status: 'success',
        signature: '0xtyped',
      });

      const sig = await MossWalletSdkClient.provider!.request({
        method: 'eth_signTypedData_v4',
        params: ['0xabc123', { domain: {}, message: {} }],
      });
      expect(sig).toBe('0xtyped');
    });
  });

  describe('eth_sendTransaction', () => {
    it('should send a transaction', async () => {
      (mega.callContract as jest.Mock).mockResolvedValue({
        status: 'approved',
        receipt: { hash: '0xtxhash' },
      });

      const hash = await MossWalletSdkClient.provider!.request({
        method: 'eth_sendTransaction',
        params: [{ to: '0xdeadbeef' as `0x${string}`, value: '0x0' }],
      });
      expect(hash).toBe('0xtxhash');
    });

    it('should throw when transaction fails', async () => {
      (mega.callContract as jest.Mock).mockResolvedValue({
        status: 'error',
        error: 'TX failed',
      });

      await expect(
        MossWalletSdkClient.provider!.request({
          method: 'eth_sendTransaction',
          params: [{ to: '0xdeadbeef' as `0x${string}` }],
        }),
      ).rejects.toThrow('TX failed');
    });
  });

  describe('unsupported method', () => {
    it('should throw for unknown methods', async () => {
      await expect(
        MossWalletSdkClient.provider!.request({ method: 'eth_unknown' }),
      ).rejects.toThrow('Method not supported: eth_unknown');
    });
  });

  describe('event listeners', () => {
    it('should add and remove listeners', () => {
      const listener = jest.fn();
      MossWalletSdkClient.provider!.on('accountsChanged', listener);
      MossWalletSdkClient.provider!.removeListener('accountsChanged', listener);

      // Trigger status change — listener should not be called
      const onStatusChange = (mega.events.onStatusChange as jest.Mock).mock
        .calls[0][0];
      onStatusChange(connectedStatus);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});

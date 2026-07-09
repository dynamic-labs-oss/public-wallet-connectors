import { createWalletStandardAdapter } from './WalletStandardAdapter.js';
import type { StandardWallet, WalletAccount } from './types.js';

jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((key) => ({ key })),
  Transaction: { from: jest.fn((bytes) => ({ deserialized: 'legacy', bytes })) },
  VersionedTransaction: {
    deserialize: jest.fn((bytes) => ({ deserialized: 'versioned', bytes })),
  },
}));

jest.mock('bs58', () => ({
  __esModule: true,
  default: { encode: jest.fn(() => 'encodedSignature') },
  encode: jest.fn(() => 'encodedSignature'),
}));

const account: WalletAccount = {
  address: 'SoLaNa1234',
  publicKey: new Uint8Array([1, 2, 3]),
  chains: ['solana:mainnet'],
  features: [],
};

const buildLegacyTransaction = (id: string) => ({
  instructions: [],
  serialize: jest.fn(() => new Uint8Array([...Buffer.from(id)])),
});

const buildVersionedTransaction = (id: string) => ({
  serialize: jest.fn(() => new Uint8Array([...Buffer.from(id)])),
});

const getSelectedNetwork = () => 'mainnet';

describe('createWalletStandardAdapter', () => {
  beforeEach(() => {
    jest.resetAllMocks().restoreAllMocks();
    const bs58 = jest.requireMock('bs58');
    bs58.default.encode.mockReturnValue('encodedSignature');
    bs58.encode.mockReturnValue('encodedSignature');
    const { Transaction, VersionedTransaction } = jest.requireMock(
      '@solana/web3.js',
    );
    Transaction.from.mockImplementation((bytes: Uint8Array) => ({
      deserialized: 'legacy',
      bytes,
    }));
    VersionedTransaction.deserialize.mockImplementation((bytes: Uint8Array) => ({
      deserialized: 'versioned',
      bytes,
    }));
  });

  const buildWallet = (
    features: Record<string, Record<string, unknown>>,
    accounts: readonly WalletAccount[] = [account],
  ): StandardWallet => ({
    name: 'MetaMask',
    accounts,
    features,
  });

  describe('signAllTransactions', () => {
    it('signs every transaction in a single wallet-standard call', async () => {
      const signTransaction = jest.fn().mockResolvedValue([
        { signedTransaction: new Uint8Array([10]) },
        { signedTransaction: new Uint8Array([20]) },
      ]);
      const wallet = buildWallet({
        'solana:signTransaction': { signTransaction },
      });

      const adapter = createWalletStandardAdapter(wallet, getSelectedNetwork);
      const txs = [buildLegacyTransaction('a'), buildLegacyTransaction('b')];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await adapter.signAllTransactions(txs as any);

      expect(signTransaction).toHaveBeenCalledTimes(1);
      const callArgs = signTransaction.mock.calls[0];
      expect(callArgs).toHaveLength(2);
      expect(callArgs[0]).toMatchObject({ account, chain: 'solana:mainnet' });
      expect(callArgs[1]).toMatchObject({ account, chain: 'solana:mainnet' });
      expect(result).toHaveLength(2);
    });

    it('deserializes versioned and legacy transactions correctly', async () => {
      const { Transaction, VersionedTransaction } = jest.requireMock(
        '@solana/web3.js',
      );
      const signTransaction = jest.fn().mockResolvedValue([
        { signedTransaction: new Uint8Array([10]) },
        { signedTransaction: new Uint8Array([20]) },
      ]);
      const wallet = buildWallet({
        'solana:signTransaction': { signTransaction },
      });

      const adapter = createWalletStandardAdapter(wallet, getSelectedNetwork);
      const txs = [
        buildLegacyTransaction('a'),
        buildVersionedTransaction('b'),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await adapter.signAllTransactions(txs as any);

      expect(Transaction.from).toHaveBeenCalledWith(new Uint8Array([10]));
      expect(VersionedTransaction.deserialize).toHaveBeenCalledWith(
        new Uint8Array([20]),
      );
    });

    it('throws when solana:signTransaction is not supported', async () => {
      const adapter = createWalletStandardAdapter(
        buildWallet({}),
        getSelectedNetwork,
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adapter.signAllTransactions([buildLegacyTransaction('a')] as any),
      ).rejects.toThrow('solana:signTransaction not supported');
    });

    it('throws when a signed transaction is missing from the result', async () => {
      const signTransaction = jest.fn().mockResolvedValue([]);
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'solana:signTransaction': { signTransaction } }),
        getSelectedNetwork,
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adapter.signAllTransactions([buildLegacyTransaction('a')] as any),
      ).rejects.toThrow('No signed transaction returned');
    });

    it('throws when there is no connected account', async () => {
      const signTransaction = jest.fn();
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'solana:signTransaction': { signTransaction } }, []),
        getSelectedNetwork,
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adapter.signAllTransactions([buildLegacyTransaction('a')] as any),
      ).rejects.toThrow('No connected account');
    });
  });

  describe('signTransaction', () => {
    it('delegates to a single batched call', async () => {
      const signTransaction = jest
        .fn()
        .mockResolvedValue([{ signedTransaction: new Uint8Array([10]) }]);
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'solana:signTransaction': { signTransaction } }),
        getSelectedNetwork,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await adapter.signTransaction(buildLegacyTransaction('a') as any);

      expect(signTransaction).toHaveBeenCalledTimes(1);
      expect(signTransaction.mock.calls[0]).toHaveLength(1);
    });
  });

  describe('signAndSendTransaction', () => {
    it('sends via solana:signAndSendTransaction and encodes the signature', async () => {
      const signAndSendTransaction = jest
        .fn()
        .mockResolvedValue([{ signature: new Uint8Array([9]) }]);
      const adapter = createWalletStandardAdapter(
        buildWallet({
          'solana:signAndSendTransaction': { signAndSendTransaction },
        }),
        getSelectedNetwork,
      );

      const result = await adapter.signAndSendTransaction(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        buildLegacyTransaction('a') as any,
      );

      expect(signAndSendTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ signature: 'encodedSignature' });
    });

    it('throws when solana:signAndSendTransaction is not supported', async () => {
      const adapter = createWalletStandardAdapter(
        buildWallet({}),
        getSelectedNetwork,
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adapter.signAndSendTransaction(buildLegacyTransaction('a') as any),
      ).rejects.toThrow('solana:signAndSendTransaction not supported');
    });

    it('throws when no signature is returned', async () => {
      const signAndSendTransaction = jest.fn().mockResolvedValue([]);
      const adapter = createWalletStandardAdapter(
        buildWallet({
          'solana:signAndSendTransaction': { signAndSendTransaction },
        }),
        getSelectedNetwork,
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adapter.signAndSendTransaction(buildLegacyTransaction('a') as any),
      ).rejects.toThrow('No signature returned');
    });
  });

  describe('signMessage', () => {
    it('returns the signature from solana:signMessage', async () => {
      const signMessage = jest
        .fn()
        .mockResolvedValue([{ signature: new Uint8Array([5]) }]);
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'solana:signMessage': { signMessage } }),
        getSelectedNetwork,
      );

      const result = await adapter.signMessage(new Uint8Array([1]));

      expect(signMessage).toHaveBeenCalledWith({
        account,
        message: new Uint8Array([1]),
      });
      expect(result).toEqual({ signature: new Uint8Array([5]) });
    });

    it('throws when solana:signMessage is not supported', async () => {
      const adapter = createWalletStandardAdapter(
        buildWallet({}),
        getSelectedNetwork,
      );

      await expect(
        adapter.signMessage(new Uint8Array([1])),
      ).rejects.toThrow('solana:signMessage not supported');
    });

    it('throws when no signature is returned', async () => {
      const signMessage = jest.fn().mockResolvedValue([]);
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'solana:signMessage': { signMessage } }),
        getSelectedNetwork,
      );

      await expect(
        adapter.signMessage(new Uint8Array([1])),
      ).rejects.toThrow('No signature returned');
    });
  });

  describe('connect', () => {
    it('returns the existing account without calling connect', async () => {
      const connect = jest.fn();
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'standard:connect': { connect } }),
        getSelectedNetwork,
      );

      const result = await adapter.connect();

      expect(connect).not.toHaveBeenCalled();
      expect(result).toEqual({
        address: account.address,
        publicKey: account.publicKey,
      });
    });

    it('calls standard:connect when no account is present', async () => {
      const connect = jest
        .fn()
        .mockResolvedValue({ accounts: [account] });
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'standard:connect': { connect } }, []),
        getSelectedNetwork,
      );

      const result = await adapter.connect();

      expect(connect).toHaveBeenCalledWith({ silent: false });
      expect(result).toEqual({
        address: account.address,
        publicKey: account.publicKey,
      });
    });

    it('throws when standard:connect is not supported', async () => {
      const adapter = createWalletStandardAdapter(
        buildWallet({}, []),
        getSelectedNetwork,
      );

      await expect(adapter.connect()).rejects.toThrow(
        'standard:connect not supported',
      );
    });

    it('returns undefined when connect resolves with no accounts', async () => {
      const connect = jest.fn().mockResolvedValue({ accounts: [] });
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'standard:connect': { connect } }, []),
        getSelectedNetwork,
      );

      await expect(adapter.connect()).resolves.toBeUndefined();
    });
  });

  describe('disconnect', () => {
    it('calls standard:disconnect when available', async () => {
      const disconnect = jest.fn().mockResolvedValue(undefined);
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'standard:disconnect': { disconnect } }),
        getSelectedNetwork,
      );

      await adapter.disconnect();

      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('is a noop when standard:disconnect is unavailable', async () => {
      const adapter = createWalletStandardAdapter(
        buildWallet({}),
        getSelectedNetwork,
      );

      await expect(adapter.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('on', () => {
    it('subscribes to the change event for accountChanged', () => {
      const off = jest.fn();
      const on = jest.fn().mockReturnValue(off);
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'standard:events': { on } }),
        getSelectedNetwork,
      );
      const listener = jest.fn();

      const unsubscribe = adapter.on('accountChanged', listener);

      expect(on).toHaveBeenCalledWith('change', listener);
      expect(unsubscribe).toBe(off);
    });

    it('does not subscribe for unsupported events', () => {
      const on = jest.fn();
      const adapter = createWalletStandardAdapter(
        buildWallet({ 'standard:events': { on } }),
        getSelectedNetwork,
      );

      adapter.on('disconnect', jest.fn());

      expect(on).not.toHaveBeenCalled();
    });
  });

  describe('publicKey', () => {
    it('returns a PublicKey when an account is connected', () => {
      const { PublicKey } = jest.requireMock('@solana/web3.js');
      const adapter = createWalletStandardAdapter(
        buildWallet({}),
        getSelectedNetwork,
      );

      expect(adapter.publicKey).toBeDefined();
      expect(PublicKey).toHaveBeenCalledWith(account.publicKey);
    });

    it('returns undefined when no account is connected', () => {
      const adapter = createWalletStandardAdapter(
        buildWallet({}, []),
        getSelectedNetwork,
      );

      expect(adapter.publicKey).toBeUndefined();
    });
  });

  describe('EventEmitter stubs', () => {
    it('exposes no-op EventEmitter methods with safe defaults', () => {
      const adapter = createWalletStandardAdapter(
        buildWallet({}),
        getSelectedNetwork,
      );

      expect(adapter.eventNames()).toEqual([]);
      expect(adapter.listeners('accountChanged')).toEqual([]);
      expect(adapter.listenerCount('accountChanged')).toBe(0);
      expect(adapter.addListener('accountChanged', jest.fn())).toBeUndefined();
      expect(adapter.removeListener('accountChanged', jest.fn())).toBeUndefined();
      expect(adapter.removeAllListeners()).toBeUndefined();
      expect(adapter.off('accountChanged', jest.fn())).toBeUndefined();
      expect(adapter.once('accountChanged', jest.fn())).toBeUndefined();
      expect(adapter.emit('accountChanged')).toBeUndefined();
    });
  });

  describe('isConnected', () => {
    it('is true when there are accounts', () => {
      const adapter = createWalletStandardAdapter(
        buildWallet({}),
        getSelectedNetwork,
      );
      expect(adapter.isConnected).toBe(true);
    });

    it('is false when there are no accounts', () => {
      const adapter = createWalletStandardAdapter(
        buildWallet({}, []),
        getSelectedNetwork,
      );
      expect(adapter.isConnected).toBe(false);
    });
  });
});

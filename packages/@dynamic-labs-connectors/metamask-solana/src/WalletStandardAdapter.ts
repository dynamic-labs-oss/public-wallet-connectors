import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { ISolana } from '@dynamic-labs/solana-core';
import bs58 from 'bs58';

import type { StandardWallet, WalletAccount } from './types.js';

/**
 * Adapts a wallet-standard Wallet into the ISolana interface that Dynamic expects.
 *
 * The MetaMask Connect Solana SDK produces a wallet-standard Wallet with features
 * like standard:connect, solana:signTransaction, etc. Dynamic's SolanaWalletConnector
 * works with the ISolana interface (EventEmitter + signTransaction/signMessage/etc).
 * This adapter bridges the two.
 */
export function createWalletStandardAdapter(
  wallet: StandardWallet,
  getSelectedNetwork: () => string,
): ISolana {
  const features = wallet.features;

  const getCurrentAccount = (): WalletAccount => {
    const account = wallet.accounts[0];
    if (!account) {
      throw new Error('[WalletStandardAdapter] No connected account');
    }
    return account;
  };

  const getChain = (): string => {
    const network = getSelectedNetwork();
    return `solana:${network}`;
  };

  const connect = async () => {
    const existing = wallet.accounts[0];
    if (existing) {
      return {
        address: existing.address,
        publicKey: existing.publicKey,
      };
    }

    const connectFn = features['standard:connect']?.['connect'] as
      | ((input: { silent: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>)
      | undefined;

    if (!connectFn) {
      throw new Error('[WalletStandardAdapter] standard:connect not supported');
    }

    const result = await connectFn({ silent: false });
    if (!result.accounts[0]) return undefined;

    return {
      address: result.accounts[0].address,
      publicKey: result.accounts[0].publicKey,
    };
  };

  const disconnect = async () => {
    const disconnectFn = features['standard:disconnect']?.['disconnect'] as
      | (() => Promise<void>)
      | undefined;

    if (disconnectFn) {
      await disconnectFn();
    }
  };

  const signTransaction = async <T extends Transaction | VersionedTransaction>(
    transaction: T,
  ): Promise<T> => {
    const signFn = features['solana:signTransaction']?.['signTransaction'] as
      | ((input: {
          account: WalletAccount;
          chain: string;
          transaction: Uint8Array;
        }) => Promise<{ signedTransaction: Uint8Array }[]>)
      | undefined;

    if (!signFn) {
      throw new Error(
        '[WalletStandardAdapter] solana:signTransaction not supported',
      );
    }

    const account = getCurrentAccount();
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
    });
    const result = await signFn({
      account,
      chain: getChain(),
      transaction: Uint8Array.from(serializedTransaction),
    });

    const signed = result[0]?.signedTransaction;
    if (!signed) throw new Error('[WalletStandardAdapter] No signed transaction returned');

    const isVersioned = !('instructions' in transaction);
    if (isVersioned) {
      return VersionedTransaction.deserialize(signed) as unknown as T;
    }
    return Transaction.from(signed) as unknown as T;
  };

  const signAllTransactions = async <
    T extends Transaction | VersionedTransaction,
  >(
    transactions: T[],
  ): Promise<T[]> => {
    return Promise.all(transactions.map(signTransaction));
  };

  const signAndSendTransaction = async <
    T extends Transaction | VersionedTransaction,
  >(
    transaction: T,
  ): Promise<{ signature: string }> => {
    const sendFn = features['solana:signAndSendTransaction']?.[
      'signAndSendTransaction'
    ] as
      | ((input: {
          account: WalletAccount;
          chain: string;
          transaction: Uint8Array;
        }) => Promise<{ signature: Uint8Array }[]>)
      | undefined;

    if (!sendFn) {
      throw new Error(
        '[WalletStandardAdapter] solana:signAndSendTransaction not supported',
      );
    }

    const account = getCurrentAccount();
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
    });
    const result = await sendFn({
      account,
      chain: getChain(),
      transaction: Uint8Array.from(serializedTransaction),
    });

    const sig = result[0]?.signature;
    if (!sig) throw new Error('[WalletStandardAdapter] No signature returned');

    return { signature: bs58.encode(sig) };
  };

  const signMessage = async (
    message: Uint8Array,
  ): Promise<{ signature: Uint8Array }> => {
    const signFn = features['solana:signMessage']?.['signMessage'] as
      | ((input: {
          account: WalletAccount;
          message: Uint8Array;
        }) => Promise<{ signature: Uint8Array }[]>)
      | undefined;

    if (!signFn) {
      throw new Error(
        '[WalletStandardAdapter] solana:signMessage not supported',
      );
    }

    const account = getCurrentAccount();
    const result = await signFn({ account, message });
    const sig = result[0]?.signature;
    if (!sig) throw new Error('[WalletStandardAdapter] No signature returned');
    return { signature: sig };
  };

  const on = (event: string, listener: (...args: unknown[]) => void) => {
    const onFn = features['standard:events']?.['on'] as
      | ((
          event: string,
          listener: (...args: unknown[]) => void,
        ) => () => void)
      | undefined;

    if (!onFn || event !== 'accountChanged') return;
    return onFn('change', listener);
  };

  const noop = () => {
    /* intentional no-op for unimplemented EventEmitter methods */
  };

  return {
    addListener: noop,
    connect,
    disconnect,
    emit: noop,
    eventNames: () => [],
    isBackpack: false,
    isBraveWallet: false,
    isConnected: wallet.accounts.length > 0,
    isExodus: false,
    isGlow: false,
    isMagicEden: false,
    isPhantom: false,
    isSolflare: false,
    listenerCount: () => 0,
    listeners: () => [],
    off: noop,
    on,
    once: noop,
    providers: [],
    get publicKey() {
      const account = wallet.accounts[0];
      if (!account?.publicKey) return undefined;
      return new PublicKey(account.publicKey);
    },
    removeAllListeners: noop,
    removeListener: noop,
    signAllTransactions,
    signAndSendTransaction,
    signMessage,
    signTransaction,
  } as unknown as ISolana;
}

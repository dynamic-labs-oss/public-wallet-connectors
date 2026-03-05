import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { ISolana } from '@dynamic-labs/solana-core';
import bs58 from 'bs58';

import type { StandardWallet, WalletAccount } from './types.js';

type InvokeMethodResponse = {
  signature?: string;
  signedMessage?: string;
};

type MetaMaskWalletClient = {
  invokeMethod(input: {
    scope: string;
    request: {
      method: string;
      params: Record<string, unknown>;
    };
  }): Promise<InvokeMethodResponse>;
};

type MetaMaskWalletWithClient = StandardWallet & {
  client?: MetaMaskWalletClient;
  scope?: string;
};

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const maybeBuffer = (
    globalThis as unknown as {
      Buffer?: {
        from(input: Uint8Array): { toString(encoding: 'base64'): string };
      };
    }
  ).Buffer;

  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function getErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const directCode = (error as { code?: unknown }).code;
  if (typeof directCode === 'number') return directCode;

  const data = (error as { data?: unknown }).data;
  if (data && typeof data === 'object') {
    const nestedCode = (data as { code?: unknown }).code;
    if (typeof nestedCode === 'number') return nestedCode;
  }

  return undefined;
}

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

    console.log('[WalletStandardAdapter] signMessage', {
      hasSignFn: !!signFn,
      messageLength: message.length,
      availableFeatures: Object.keys(features),
      accountAddress: wallet.accounts[0]?.address,
      chain: getChain(),
    });

    if (!signFn) {
      throw new Error(
        '[WalletStandardAdapter] solana:signMessage not supported',
      );
    }

    const account = getCurrentAccount();
    console.log('[WalletStandardAdapter] calling solana:signMessage', {
      account: account.address,
      accountChains: account.chains,
    });

    const tryDirectInvokeFallback = async (): Promise<Uint8Array | null> => {
      const walletWithClient = wallet as MetaMaskWalletWithClient;
      const scope = walletWithClient.scope;
      const invokeMethod = walletWithClient.client?.invokeMethod;

      if (!scope || !invokeMethod) {
        console.warn(
          '[WalletStandardAdapter] signMessage fallback skipped (missing wallet client or scope)',
          {
            hasScope: !!scope,
            hasInvokeMethod: !!invokeMethod,
          },
        );
        return null;
      }

      const encodedMessage = uint8ArrayToBase64(message);
      const requests: Record<string, unknown>[] = [
        {
          message: encodedMessage,
          account: { address: account.address },
        },
        {
          message: encodedMessage,
          account: { address: account.address },
          scope,
        },
        {
          message: encodedMessage,
          account: account.address,
          scope,
        },
      ];

      for (let i = 0; i < requests.length; i++) {
        const params = requests[i]!;
        try {
          console.log(
            '[WalletStandardAdapter] signMessage fallback attempt via invokeMethod',
            {
              attempt: i + 1,
              scope,
              account: account.address,
              paramKeys: Object.keys(params),
            },
          );

          const result = await invokeMethod({
            scope,
            request: {
              method: 'signMessage',
              params,
            },
          });

          if (result.signature) {
            console.log(
              '[WalletStandardAdapter] signMessage fallback via invokeMethod succeeded',
              {
                attempt: i + 1,
                hasSignedMessage: !!result.signedMessage,
              },
            );
            return bs58.decode(result.signature);
          }

          console.warn(
            '[WalletStandardAdapter] signMessage fallback got no signature',
            {
              attempt: i + 1,
              resultKeys:
                result && typeof result === 'object'
                  ? Object.keys(result)
                  : [],
            },
          );
        } catch (fallbackError) {
          console.error(
            '[WalletStandardAdapter] signMessage fallback attempt failed',
            {
              attempt: i + 1,
              errorMessage:
                fallbackError instanceof Error
                  ? fallbackError.message
                  : String(fallbackError),
              errorCode: getErrorCode(fallbackError),
            },
          );
        }
      }

      return null;
    };

    try {
      const result = await signFn({ account, message });
      console.log('[WalletStandardAdapter] signMessage result', {
        resultLength: result?.length,
        hasSignature: !!result?.[0]?.signature,
      });
      const sig = result[0]?.signature;
      if (!sig) throw new Error('[WalletStandardAdapter] No signature returned');
      return { signature: sig };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = getErrorCode(error);
      const shouldTryFallback =
        errorCode === 53 || errorMessage.includes('RPCErr53');

      if (shouldTryFallback) {
        const fallbackSignature = await tryDirectInvokeFallback();
        if (fallbackSignature) {
          return { signature: fallbackSignature };
        }
      }

      console.error('[WalletStandardAdapter] signMessage FAILED', {
        error,
        errorMessage,
        errorCode,
        errorName: error instanceof Error ? error.name : undefined,
        errorData:
          error && typeof error === 'object'
            ? (error as { data?: unknown }).data
            : undefined,
      });
      throw error;
    }
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

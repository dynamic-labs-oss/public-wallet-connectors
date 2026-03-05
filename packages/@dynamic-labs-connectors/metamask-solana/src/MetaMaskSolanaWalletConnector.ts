import {
  logger,
  type GetAddressOpts,
} from '@dynamic-labs/wallet-connector-core';
import {
  SolanaWalletConnector,
  type SolanaWalletConnectorOpts,
  type ISolana,
} from '@dynamic-labs/solana-core';

import { MetaMaskSolanaSdkClient } from './MetaMaskSolanaSdkClient.js';
import { createWalletStandardAdapter } from './WalletStandardAdapter.js';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function extractNonce(messageToSign: string): string | undefined {
  const regex = messageToSign.match(/Nonce: (.*)/);
  if (regex && regex.length === 2) {
    return regex[1];
  }
  return undefined;
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
 * MetaMask wallet connector for Dynamic (Solana).
 * Uses @metamask/connect-solana SDK via wallet-standard.
 */
export class MetaMaskSolanaWalletConnector extends SolanaWalletConnector {
  private signer: ISolana | undefined;

  override name = 'MetaMask';
  override canConnectViaQrCode = true;

  constructor(props: SolanaWalletConnectorOpts) {
    super({
      ...props,
      metadata: {
        id: 'metamask-solana',
        name: 'MetaMask',
        icon: 'https://iconic.dynamic-static-assets.com/icons/sprite.svg#metamask',
      },
    });
  }

  /**
   * Dynamic uses this to decide whether to show "install extension" or QR code.
   * Returns true only when a real MetaMask injected provider is present.
   */
  override isInstalledOnBrowser(): boolean {
    if (typeof window === 'undefined') return false;
    const ethereum = (window as unknown as Record<string, unknown>)[
      'ethereum'
    ] as { isMetaMask?: boolean } | undefined;
    return Boolean(ethereum?.isMetaMask);
  }

  override async init(): Promise<void> {
    if (MetaMaskSolanaSdkClient.isInitialized) {
      this.walletConnectorEventsEmitter.emit('providerReady', {
        connector: this,
      });
      return;
    }

    try {
      await MetaMaskSolanaSdkClient.init({
        dappName: 'Dynamic',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        '[MetaMaskSolanaWalletConnector] SDK init failed:',
        errorMessage,
      );
    }

    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
    });

    const accounts = MetaMaskSolanaSdkClient.getAccounts();
    if (accounts.length > 0) {
      this.walletConnectorEventsEmitter.emit('autoConnect', {
        connector: this,
      });
    }
  }

  override async connect(): Promise<void> {
    if (!MetaMaskSolanaSdkClient.isInitialized) {
      await this.init();
    }

    await MetaMaskSolanaSdkClient.connect();
    this.signer = this.buildSigner();
  }

  override async getSigner(): Promise<ISolana | undefined> {
    if (!this.signer) {
      this.signer = this.buildSigner();
    }
    return this.signer;
  }

  override async signMessage(
    messageToSign: string,
  ): Promise<string | undefined> {
    console.log('[MM-SOL-Connector] signMessage START', {
      messageLength: messageToSign.length,
      messagePreview: messageToSign.substring(0, 100),
    });

    const signer = await this.getSigner();
    console.log('[MM-SOL-Connector] signMessage signer', {
      hasSigner: !!signer,
      signerPublicKey: signer?.publicKey?.toString?.(),
      isConnected: signer?.isConnected,
    });
    if (!signer) return undefined;

    const encoded = new TextEncoder().encode(messageToSign);

    try {
      const result = await signer.signMessage(encoded);
      console.log('[MM-SOL-Connector] signMessage result', {
        resultType: typeof result,
        isUint8Array: result instanceof Uint8Array,
        hasSignature: result && 'signature' in (result as object),
      });
      if (!result) return undefined;

      const signatureBytes =
        result instanceof Uint8Array
          ? result
          : (result as { signature: Uint8Array }).signature;
      if (!signatureBytes) return undefined;

      return uint8ArrayToBase64(signatureBytes);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = getErrorCode(error);
      console.error('[MM-SOL-Connector] signMessage FAILED', {
        error,
        errorMessage,
        errorName: error instanceof Error ? error.name : undefined,
        errorCode,
        errorData:
          error && typeof error === 'object'
            ? (error as { data?: unknown }).data
            : undefined,
      });
      logger.error('[MetaMaskSolanaWalletConnector] signMessage failed:', error);
      throw error;
    }
  }

  override async proveOwnership(
    address: string,
    messageToSign: string,
  ): Promise<string | undefined> {
    try {
      return await super.proveOwnership(address, messageToSign);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = getErrorCode(error);
      const shouldFallbackToTx =
        errorCode === 53 || errorMessage.includes('RPCErr53');

      if (!shouldFallbackToTx) {
        throw error;
      }

      const nonce = extractNonce(messageToSign);
      if (!nonce) {
        console.error(
          '[MM-SOL-Connector] proveOwnership fallback unavailable (nonce not found)',
          {
            errorMessage,
            errorCode,
          },
        );
        throw error;
      }

      console.warn(
        '[MM-SOL-Connector] proveOwnership fallback to signMessageViaTransaction',
        {
          errorMessage,
          errorCode,
          nonceLength: nonce.length,
        },
      );

      try {
        const signedTransactionProof = await this.signMessageViaTransaction(nonce);
        console.log(
          '[MM-SOL-Connector] proveOwnership fallback succeeded via transaction',
          {
            resultLength: signedTransactionProof.length,
          },
        );
        return signedTransactionProof;
      } catch (fallbackError) {
        console.error('[MM-SOL-Connector] proveOwnership fallback FAILED', {
          fallbackError,
          fallbackErrorMessage:
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
          fallbackErrorCode: getErrorCode(fallbackError),
        });
        throw fallbackError;
      }
    }
  }

  /**
   * Get the connected address. Triggers connection if not connected.
   * Accepts GetAddressOpts so Dynamic can pass onDisplayUri for QR code flows.
   */
  override async getAddress(
    opts?: GetAddressOpts,
  ): Promise<string | undefined> {
    const existing = MetaMaskSolanaSdkClient.getSelectedAccount();
    if (existing) return existing;

    if (!MetaMaskSolanaSdkClient.isInitialized) {
      await this.init();
    }

    // Register display_uri listener for QR code flow.
    // The multichain core emits this event with a deeplink URI that
    // Dynamic renders as a QR code for mobile wallet scanning.
    const core = MetaMaskSolanaSdkClient.getCore();
    let displayUriHandler: ((uri: string) => void) | undefined;

    if (core && opts?.onDisplayUri) {
      displayUriHandler = (uri: string) => {
        opts.onDisplayUri!(uri);
      };
      core.on('display_uri', displayUriHandler as (...args: unknown[]) => void);
    }

    try {
      return await MetaMaskSolanaSdkClient.connect();
    } finally {
      if (core && displayUriHandler) {
        core.off(
          'display_uri',
          displayUriHandler as (...args: unknown[]) => void,
        );
      }
    }
  }

  override async getConnectedAccounts(): Promise<string[]> {
    return MetaMaskSolanaSdkClient.getAccounts();
  }

  override async endSession(): Promise<void> {
    this.signer = undefined;
    await MetaMaskSolanaSdkClient.disconnect();
  }

  private buildSigner(): ISolana | undefined {
    const wallet = MetaMaskSolanaSdkClient.getWallet();
    if (!wallet) return undefined;

    return createWalletStandardAdapter(wallet, () => {
      const network = this.getSelectedNetwork();
      return network?.cluster ?? 'mainnet';
    });
  }
}

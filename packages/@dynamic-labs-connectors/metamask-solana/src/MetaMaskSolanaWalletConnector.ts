import {
  eventListenerHandlers,
  logger,
  type GetAddressOpts,
  type WalletConnector,
} from '@dynamic-labs/wallet-connector-core';
import {
  SolanaWalletConnector,
  type SolanaWalletConnectorOpts,
  type ISolana,
} from '@dynamic-labs/solana-core';

import { MetaMaskSolanaSdkClient } from './MetaMaskSolanaSdkClient.js';
import type { WalletAccount } from './types.js';
import { createWalletStandardAdapter } from './WalletStandardAdapter.js';

type StandardEventsChangeListener = (properties: {
  accounts?: readonly WalletAccount[];
}) => void;
type StandardEventsOn = (
  event: 'change',
  listener: StandardEventsChangeListener,
) => () => void;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * MetaMask wallet connector for Dynamic (Solana).
 * Uses @metamask/connect-solana SDK via wallet-standard.
 */
export class MetaMaskSolanaWalletConnector extends SolanaWalletConnector {
  private signer: ISolana | undefined;

  override name = 'MetaMask';
  override canConnectViaQrCode = true;
  override canHandleMultipleConnections = false;

  constructor(props: SolanaWalletConnectorOpts) {
    super({
      ...props,
      metadata: {
        id: 'metamasksol',
        name: 'MetaMask',
        icon: 'https://iconic.dynamic-static-assets.com/icons/sprite.svg#metamask',
        groupKey: 'metamask',
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
    try {
      await MetaMaskSolanaSdkClient.init({
        dappName: 'Dynamic',
      });
    } catch (error) {
      logger.error('[MetaMaskSolanaWalletConnector] SDK init failed:', error);
    }

    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
    });
  }

  override setupEventListeners(): void {
    const wallet = MetaMaskSolanaSdkClient.getWallet();

    if (!wallet) {
      return;
    }

    const onFn = wallet.features['standard:events']?.['on'] as
      | StandardEventsOn
      | undefined;

    if (!onFn) {
      return;
    }

    const { handleAccountChange } = eventListenerHandlers(
      this as unknown as WalletConnector,
    );

    const unsubscribe = onFn('change', (properties) => {
      if (!properties.accounts) {
        return;
      }
      void handleAccountChange(properties.accounts.map((a) => a.address));
    });

    this.teardownEventListeners = () => {
      unsubscribe();
    };
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
    const signer = await this.getSigner();
    if (!signer) return undefined;

    const encoded = new TextEncoder().encode(messageToSign);
    const result = await signer.signMessage(encoded);
    const signature = (result as { signature: Uint8Array })?.signature;
    if (!signature) return undefined;

    return uint8ArrayToBase64(signature);
  }

  override async getAddress(
    opts?: GetAddressOpts,
  ): Promise<string | undefined> {
    const existing = MetaMaskSolanaSdkClient.getSelectedAccount();
    if (existing) return existing;

    if (!MetaMaskSolanaSdkClient.isInitialized) {
      await this.init();
    }

    const unsubscribe = opts?.onDisplayUri
      ? MetaMaskSolanaSdkClient.onDisplayUri(opts.onDisplayUri)
      : undefined;

    try {
      return await MetaMaskSolanaSdkClient.connect();
    } finally {
      unsubscribe?.();
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

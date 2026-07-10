import {
  eventListenerHandlers,
  logger,
  type GetAddressOpts,
  type WalletConnector,
} from '@dynamic-labs/wallet-connector-core';
import {
  EthereumInjectedConnector,
  type IEthereum,
} from '@dynamic-labs/ethereum';
import { isIOS, PlatformService } from '@dynamic-labs/utils';

import { MetaMaskSdkClient } from './MetaMaskSdkClient.js';
import { toNumericChainId } from './utils.js';

const METAMASK_NATIVE_DEEPLINK = 'metamask://';

// EVM methods that prompt the user in the wallet and therefore need MetaMask to
// be brought to the foreground on mobile.
const DEEP_LINK_SIGNING_METHODS = [
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
];

/**
 * MetaMask wallet connector for Dynamic.
 * Uses @metamask/connect-evm SDK with headless QR code support.
 * When the MetaMask extension is installed on the browser, delegates
 * to the parent injected-provider flow for native popup behavior.
 * Falls back to the SDK protocol for QR code / mobile flows.
 */
export class MetaMaskEvmWalletConnector extends EthereumInjectedConnector {
  override name = 'MetaMask';
  override overrideKey = 'metamask';
  override canConnectViaQrCode = true;
  override canHandleMultipleConnections = false;

  /**
   * Returns true only when a real MetaMask injected provider is present.
   * Dynamic uses this to decide between "install extension" and QR code views.
   */
  override isInstalledOnBrowser() {
    if (!this.metadata?.rdns) return false;

    const metaMaskEip6963Provider =
      this.ethProviderHelper?.eip6963ProviderLookup(this.metadata.rdns);

    logger.logVerboseTroubleshootingMessage('[MetaMaskEvmWalletConnector] isInstalledOnBrowser', {
      metaMaskEip6963Provider,
      metadata: this.metadata,
    });

    const isInstalled = Boolean(metaMaskEip6963Provider);

    return isInstalled;
  }

  override async init(): Promise<void> {
    this.walletConnectorEventsEmitter.emit(
      'connectorInitStarted',
      this.overrideKey,
    );

    try {
      await MetaMaskSdkClient.init({
        evmNetworks: this.evmNetworks,
        dappName: 'Dynamic',
      });
    } catch (error) {
      logger.error('[MetaMaskEvmWalletConnector] SDK init failed:', error);
    }

    this.walletConnectorEventsEmitter.emit(
      'connectorInitCompleted',
      this.overrideKey
    );
  }

  /**
   * When the extension is installed, returns its injected provider directly
   * so all RPC calls (eth_requestAccounts, etc.) go through the extension
   * and trigger native popups. Falls back to the SDK provider for QR/mobile.
   */
  override findProvider(): IEthereum | undefined {
    if (this.isInstalledOnBrowser()) {
      return super.findProvider();
    }

    const provider = MetaMaskSdkClient.getProvider();

    logger.logVerboseTroubleshootingMessage('[MetaMaskEvmWalletConnector] findProvider (SDK)', {
      provider,
    });

    if (!provider?.selectedAccount) return undefined;

    return {
      ...provider,
      request: async (args: { method: string; params?: unknown[] }) => {
        this.openDeepLinkForSigningRequest(args.method);
        const result = await provider.request(args);
        if (
          args.method === 'eth_requestAccounts' &&
          result &&
          typeof result === 'object' &&
          'accounts' in result
        ) {
          return (result as { accounts: string[] }).accounts;
        }
        return result;
      },
      on: provider.on?.bind(provider),
      removeListener: provider.removeListener?.bind(provider),
    } as unknown as IEthereum;
  }

  /**
   * On iOS Safari the MetaMask SDK opens its own deep link via `window.open`
   * outside a user gesture, which the popup blocker suppresses — so the app
   * never surfaces for signing/transaction requests (Android is unaffected).
   * Navigate to MetaMask's native scheme instead (`location.assign` via
   * openURL 'self'), which iOS honours, right before the request is
   * dispatched. Scoped to iOS and to methods that prompt in the wallet.
   */
  private openDeepLinkForSigningRequest(method: string): void {
    if (
      this.isInstalledOnBrowser() ||
      !isIOS() ||
      !DEEP_LINK_SIGNING_METHODS.includes(method)
    ) {
      return;
    }

    const nativeDeepLink =
      this.metadata?.deepLinks?.mobile?.native ?? METAMASK_NATIVE_DEEPLINK;

    void PlatformService.openURL(nativeDeepLink, 'self');
  }

  override async setupEventListeners(): Promise<void> {
    if (this.isInstalledOnBrowser()) {
      return super.setupEventListeners();
    }

    const provider = MetaMaskSdkClient.getProvider();

    if (!provider) {
      return;
    }

    const { handleAccountChange, handleChainChange, handleDisconnect } =
      eventListenerHandlers(this as unknown as WalletConnector);

    provider.on('accountsChanged', handleAccountChange);
    provider.on('chainChanged', handleChainChange);
    provider.on('disconnect', handleDisconnect);

    this.teardownEventListeners = () => {
      provider.off('accountsChanged', handleAccountChange);
      provider.off('chainChanged', handleChainChange);
      provider.off('disconnect', handleDisconnect);
    };
  }

  override async getAddress(
    opts?: GetAddressOpts,
  ): Promise<string | undefined> {
    // When extension is installed, use the standard injected flow
    // (eth_requestAccounts → extension popup for account selection)
    if (this.isInstalledOnBrowser()) {
      return super.getAddress();
    }

    // SDK flow for QR code / mobile connections
    if (!MetaMaskSdkClient.isInitialized) {
      await this.init();
    }

    if (!opts?.onDisplayUri) {
      try {
        const sdk = MetaMaskSdkClient.getInstance();
        if (sdk.selectedAccount) return sdk.selectedAccount;
      } catch {
        // SDK not initialized
      }
    }

    const unsubscribe = opts?.onDisplayUri
      ? MetaMaskSdkClient.onDisplayUri(opts.onDisplayUri)
      : undefined;

    try {
      if (opts?.onDisplayUri) {
        await MetaMaskSdkClient.disconnect();
      }
      const chainIds = this.evmNetworks.map((n) =>
        toNumericChainId(n.chainId),
      );
      const { accounts } = await MetaMaskSdkClient.connect(chainIds);
      return accounts?.[0];
    } catch (error) {
      logger.error('[MetaMaskEvmWalletConnector] getAddress failed:', error);
      throw error;
    } finally {
      unsubscribe?.();
    }
  }

  override async getConnectedAccounts(): Promise<string[]> {
    // When extension is installed, query it directly via eth_accounts
    if (this.isInstalledOnBrowser()) {
      const provider = this.ethProviderHelper?.getInstalledProvider();
      if (provider) {
        try {
          const accounts = (await provider.request({
            method: 'eth_accounts',
          })) as string[];
          if (Array.isArray(accounts) && accounts.length) {
            return accounts;
          }
        } catch {
          // provider not available or errored
        }
      }
      return [];
    }

    // SDK flow for QR/mobile
    if (!MetaMaskSdkClient.isInitialized) {
      try {
        await this.init();
      } catch {
        // init failed — fall through to provider check below
      }
    }

    try {
      const accounts = MetaMaskSdkClient.getInstance().accounts;
      if (accounts?.length) {
        return accounts;
      }
    } catch {
      // SDK not available
    }

    // Fall back to checking the injected provider directly via eth_accounts.
    // Covers edge cases where EIP-6963 announcement hasn't fired yet but
    // the extension is present and holds an active session.
    const provider = this.ethProviderHelper?.getInstalledProvider();
    if (provider) {
      try {
        const accounts = (await provider.request({
          method: 'eth_accounts',
        })) as string[];
        if (Array.isArray(accounts) && accounts.length) {
          return accounts;
        }
      } catch {
        // provider not available or errored
      }
    }

    return [];
  }

  override async endSession(): Promise<void> {
    if (this.isInstalledOnBrowser()) {
      return super.endSession();
    }

    // SDK flow: tear down event listeners BEFORE disconnecting to prevent
    // the SDK's 'disconnect' event from propagating back to Dynamic's
    // multi-wallet manager as an unexpected external disconnect.
    this.teardownEventListeners?.();
    await MetaMaskSdkClient.disconnect();
  }

  public getConnectionUri(): string | undefined {
    return MetaMaskSdkClient.getDisplayUri();
  }

  override retryDeeplinkConnection(): void {
    MetaMaskSdkClient.retryDeepLink();
  }

  async getSupportedNetworks(): Promise<string[]> {
    return this.evmNetworks.map((n) => String(toNumericChainId(n.chainId)));
  }
}

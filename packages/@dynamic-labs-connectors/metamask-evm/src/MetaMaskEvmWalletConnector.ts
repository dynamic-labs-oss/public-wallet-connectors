import {
  logger,
  type GetAddressOpts,
} from '@dynamic-labs/wallet-connector-core';
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import {
  EthereumInjectedConnector,
  type IEthereum,
} from '@dynamic-labs/ethereum';

import { MetaMaskSdkClient } from './MetaMaskSdkClient.js';
import { toNumericChainId } from './utils.js';

/**
 * MetaMask wallet connector for Dynamic.
 * Uses @metamask/connect-evm SDK with headless QR code support.
 */
export class MetaMaskEvmWalletConnector extends EthereumInjectedConnector {
  private autoConnectEmitted = false;

  override name = 'MetaMask';
  override canConnectViaQrCode = true;
  override canHandleMultipleConnections = false;

  constructor(props: EthereumWalletConnectorOpts) {
    super({
      ...props,
      metadata: {
        id: 'metamask',
        name: 'MetaMask',
        icon: 'https://iconic.dynamic-static-assets.com/icons/sprite.svg#metamask',
        rdns: 'io.metamask',
      },
    });
  }

  /**
   * Returns true only when a real MetaMask injected provider is present.
   * Dynamic uses this to decide between "install extension" and QR code views.
   */
  override isInstalledOnBrowser(): boolean {
    try {
      const helper = (
        this as unknown as {
          ethProviderHelper?: {
            eip6963ProviderLookup?: (rdns: string) => unknown;
          };
        }
      ).ethProviderHelper;
      if (helper?.eip6963ProviderLookup?.('io.metamask')) return true;
    } catch {
      // fallback below
    }

    if (typeof window === 'undefined') return false;
    const eth = (window as unknown as { ethereum?: unknown }).ethereum as
      | { isMetaMask?: boolean; providers?: unknown[] }
      | undefined;
    if (!eth) return false;
    if (Array.isArray(eth.providers)) {
      return eth.providers.some((p) =>
        Boolean((p as { isMetaMask?: boolean } | undefined)?.isMetaMask),
      );
    }
    return Boolean(eth.isMetaMask);
  }

  override async init(): Promise<void> {
    if (MetaMaskSdkClient.isInitialized) {
      this.emitAutoConnectIfNeeded();
      return;
    }

    try {
      await MetaMaskSdkClient.init({
        evmNetworks: this.evmNetworks,
        dappName: 'Dynamic',
      });
    } catch (error) {
      logger.error('[MetaMaskEvmWalletConnector] SDK init failed:', error);
    }

    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
    });
    this.emitAutoConnectIfNeeded();
  }

  private emitAutoConnectIfNeeded(): void {
    if (this.autoConnectEmitted) return;
    try {
      const sdk = MetaMaskSdkClient.getInstance();
      if (sdk.accounts?.length && sdk.selectedChainId) {
        this.autoConnectEmitted = true;
        this.walletConnectorEventsEmitter.emit('autoConnect', {
          connector: this,
        });
      }
    } catch {
      // SDK not initialized yet
    }
  }

  /**
   * Returns the SDK's EIP-1193 provider with minimal normalization.
   * Only intercepts eth_requestAccounts to fix the SDK's non-standard
   * response format ({accounts, chainId} -> accounts[]).
   */
  override findProvider(): IEthereum | undefined {
    const provider = MetaMaskSdkClient.getProvider();
    if (!provider) return undefined;

    return {
      ...provider,
      request: async (args: { method: string; params?: unknown[] }) => {
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

  override async getAddress(
    opts?: GetAddressOpts,
  ): Promise<string | undefined> {
    if (!MetaMaskSdkClient.isInitialized) {
      await this.init();
    }

    try {
      const sdk = MetaMaskSdkClient.getInstance();
      if (sdk.selectedAccount) return sdk.selectedAccount;
    } catch {
      // SDK not initialized
    }

    const unsubscribe = opts?.onDisplayUri
      ? MetaMaskSdkClient.onDisplayUri(opts.onDisplayUri)
      : undefined;

    try {
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
    try {
      return MetaMaskSdkClient.getInstance().accounts ?? [];
    } catch {
      return [];
    }
  }

  override async endSession(): Promise<void> {
    await MetaMaskSdkClient.disconnect();
  }

  async getSupportedNetworks(): Promise<string[]> {
    return this.evmNetworks.map((n) => String(toNumericChainId(n.chainId)));
  }
}

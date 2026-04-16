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
  override overrideKey = 'metamask';
  override canConnectViaQrCode = true;
  override canHandleMultipleConnections = false;

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
    // The new SDK always has a EIP-1193 provider available even if there is no established connection.
    // If Dynamic assumes that a provider can only be available if there is an established connection,
    // then this check is needed. If wrong, then this check can be removed.
    if (!provider?.selectedAccount) return undefined;

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

    // Not sure if this is needed. Was added in an attempt to fix the personal sign / linking account issues.
    // I believe if getAddress() is called without onDisplayUri, the intention is that want to return the existing selected account if
    // there is one. If onDisplayUri is provided, we don't want to return the existing selected account if there is one, instead we want to
    // cause a connection prompt to be shown to the user so that they can establish a new connection.
    // Delete this block if this assumption is incorrect. I don't have a strong thoughts on this, simply leaving it here since it was here while,
    // we were debugging with Carla.
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
      // Not sure if this is needed. Was added in an attempt to fix the personal sign / linking account issues.
      // If onDisplayUri is provided, then I assume we want to cause a connection prompt to be shown to the user. Explicitly disconnecting would guarantee
      // that a new connection prompt is shown to the user, but that isn't strictly required.
      // Delete this block if the above block that returns the selectedAccount early is not needed.
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
    try {
      return MetaMaskSdkClient.getInstance().accounts ?? [];
    } catch {
      return [];
    }
  }

  override async endSession(): Promise<void> {
    await MetaMaskSdkClient.disconnect();
  }

  public getConnectionUri(): string | undefined {
    return MetaMaskSdkClient.getDisplayUri();
  }

  async getSupportedNetworks(): Promise<string[]> {
    return this.evmNetworks.map((n) => String(toNumericChainId(n.chainId)));
  }
}

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

/** Number of times to poll for accounts when SDK status is 'connected' */
const ACCOUNTS_POLL_ATTEMPTS = 10;

/** Delay between account polling attempts (ms) */
const ACCOUNTS_POLL_DELAY_MS = 100;

/**
 * MetaMask wallet connector for Dynamic.
 * Uses @metamask/connect-evm SDK.
 */
export class MetaMaskEvmWalletConnector extends EthereumInjectedConnector {
  private static getAddressPromise: Promise<string | undefined> | null = null;

  override name = 'MetaMask';
  override canConnectViaQrCode = true;

  /**
   * Note: we intentionally do NOT set `isWalletConnect = true`.
   * Dynamic uses `isWalletConnect` to drive WalletConnect-specific UX and checks.
   * MetaMask is not a WalletConnect connector, even though it supports QR in our headless SDK flow.
   */

  constructor(props: EthereumWalletConnectorOpts) {
    try {
      super({
        ...props,
        metadata: {
          id: 'metamask',
          name: 'MetaMask',
          icon: 'https://iconic.dynamic-static-assets.com/icons/sprite.svg#metamask',
          // Enables EIP-6963 based MetaMask detection in Dynamic's ethProviderHelper
          rdns: 'io.metamask',
        },
      });
    } catch (error) {
      logger.error(
        '[MetaMaskEvmWalletConnector] constructor super() failed:',
        error,
      );
      throw error;
    }
  }

  /**
   * Dynamic decides whether to show the QR code view based on this method.
   * The base injected connector checks "is there any provider?" which becomes true
   * once the MetaMask SDK provider exists, even when the browser extension is NOT installed.
   * So here we only return true when a real MetaMask *injected* provider is present.
   */
  override isInstalledOnBrowser(): boolean {
    // Prefer EIP-6963 detection via ethProviderHelper
    try {
      const helper = (
        this as unknown as {
          ethProviderHelper?: {
            eip6963ProviderLookup?: (rdns: string) => unknown;
          };
        }
      ).ethProviderHelper;
      const eip6963Provider = helper?.eip6963ProviderLookup?.('io.metamask');
      if (eip6963Provider) return true;
    } catch {
      // ignore and fallback below
    }

    // Fallback to legacy injected detection (window.ethereum)
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

  /**
   * Initializes the MetaMask SDK and emits providerReady event.
   * With the factory pattern in connect-evm v13+, session recovery is awaited
   * before createEVMClient returns, so state is immediately available.
   */
  override async init(): Promise<void> {
    // Only initialize once (MetaMaskSdkClient handles concurrent calls)
    if (MetaMaskSdkClient.isInitialized) {
      const accounts = MetaMaskSdkClient.getAccounts();

      // If already initialized and has session, emit autoConnect (deduped globally)
      if (accounts.length > 0 && !MetaMaskSdkClient.hasEmittedAutoConnect()) {
        MetaMaskSdkClient.markAutoConnectEmitted();
        this.walletConnectorEventsEmitter.emit('autoConnect', {
          connector: this,
        });
      }
      return;
    }

    try {
      await MetaMaskSdkClient.init({
        evmNetworks: this.evmNetworks,
        dappName: 'Dynamic',
        callbacks: {
          onDisplayUri: (uri: string) => {
            logger.debug('[MetaMaskEvmWalletConnector] QR code URI available');
            const provider = this.findProvider();
            if (provider && typeof provider.emit === 'function') {
              provider.emit('display_uri', uri);
            }
          },
          onConnect: () => undefined,
          onAccountsChanged: () => undefined,
          onChainChanged: () => undefined,
          onDisconnect: () => undefined,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        '[MetaMaskEvmWalletConnector] SDK init failed:',
        errorMessage,
      );
      // Still emit providerReady so the connector shows up
    }

    // Emit providerReady so Dynamic can show this connector
    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
    });

    // If session was recovered, emit autoConnect
    const accounts = MetaMaskSdkClient.getAccounts();
    const chainId = MetaMaskSdkClient.getSelectedChainId();

    if (
      accounts.length > 0 &&
      chainId &&
      !MetaMaskSdkClient.hasEmittedAutoConnect()
    ) {
      MetaMaskSdkClient.markAutoConnectEmitted();
      this.walletConnectorEventsEmitter.emit('autoConnect', {
        connector: this,
      });
    }
  }

  /**
   * Find and return the MetaMask provider from the SDK.
   * Wraps the SDK provider to fix EIP-1193 compatibility issues:
   * the SDK's eth_requestAccounts returns { accounts, chainId } instead of just accounts[].
   */
  override findProvider(): IEthereum | undefined {
    const sdkProvider = MetaMaskSdkClient.getProvider();
    if (!sdkProvider) return undefined;

    return {
      ...sdkProvider,
      request: (args: { method: string; params?: unknown[] }) =>
        this.handleProviderRequest(sdkProvider, args),
      on: sdkProvider.on?.bind(sdkProvider),
      removeListener: sdkProvider.removeListener?.bind(sdkProvider),
    } as unknown as IEthereum;
  }

  /**
   * Handle provider requests, with special handling for account-related methods.
   * Normalizes the SDK's non-standard eth_requestAccounts response format.
   */
  private async handleProviderRequest(
    sdkProvider: NonNullable<ReturnType<typeof MetaMaskSdkClient.getProvider>>,
    args: { method: string; params?: unknown[] },
  ): Promise<unknown> {
    const cachedAccounts = MetaMaskSdkClient.getAccounts();

    // Return cached accounts immediately for both eth_accounts and eth_requestAccounts
    // This prevents unnecessary SDK calls and duplicate connection prompts
    if (
      args.method === 'eth_accounts' ||
      args.method === 'eth_requestAccounts'
    ) {
      if (cachedAccounts.length > 0) {
        return cachedAccounts;
      }
    }

    // For eth_requestAccounts when no cached accounts, use lock to prevent concurrent calls
    if (args.method === 'eth_requestAccounts') {
      return MetaMaskSdkClient.withRequestAccountsLock(async () => {
        // Re-check cache inside lock
        const accounts = MetaMaskSdkClient.getAccounts();
        if (accounts.length > 0) return accounts;

        const result = await sdkProvider.request(args);
        return this.normalizeAccountsResponse(result);
      });
    }

    return sdkProvider.request(args);
  }

  /**
   * Normalize eth_requestAccounts response.
   * SDK returns { accounts, chainId }, but EIP-1193 expects just accounts[].
   */
  private normalizeAccountsResponse(result: unknown): unknown {
    if (result && typeof result === 'object' && 'accounts' in result) {
      const accounts = (result as { accounts: string[] }).accounts ?? [];
      MetaMaskSdkClient.setCachedAccounts(accounts);

      const chainId = (result as { chainId?: string }).chainId;
      if (typeof chainId === 'string') {
        MetaMaskSdkClient.setCachedSelectedChainId(chainId);
      }

      return accounts;
    }

    // Some providers may return accounts[] directly
    if (Array.isArray(result)) {
      MetaMaskSdkClient.setCachedAccounts(result as string[]);
      return result;
    }

    return result;
  }

  /**
   * Get the connected address. Triggers connection if not connected.
   * Main entry point for wallet connection.
   */
  override async getAddress(
    opts?: GetAddressOpts,
  ): Promise<string | undefined> {
    // Deduplicate concurrent getAddress calls
    if (MetaMaskEvmWalletConnector.getAddressPromise) {
      return MetaMaskEvmWalletConnector.getAddressPromise;
    }

    MetaMaskEvmWalletConnector.getAddressPromise = (async () => {
      // Check if already connected via cached SDK state first
      const existingAccount = MetaMaskSdkClient.getSelectedAccount();
      if (existingAccount) {
        return existingAccount;
      }

      // Ensure SDK is initialized before we attempt provider calls
      if (!MetaMaskSdkClient.isInitialized) {
        await this.init();
      }

      const provider = this.findProvider();
      if (!provider) {
        throw new Error('[MetaMaskEvmWalletConnector] No provider available');
      }

      // Register the onDisplayUri callback if provided
      if (opts?.onDisplayUri) {
        MetaMaskSdkClient.setOnDisplayUriCallback(opts.onDisplayUri);
      }

      try {
        // Try eth_accounts first (no prompt). If SDK reports "connected" but accounts
        // haven't populated yet, poll briefly before prompting.
        const status = MetaMaskSdkClient.getStatus();
        const shouldPollAccounts = status === 'connected';
        const pollAttempts = shouldPollAccounts ? ACCOUNTS_POLL_ATTEMPTS : 1;

        for (let i = 0; i < pollAttempts; i++) {
          const accounts = (await provider.request({
            method: 'eth_accounts',
          })) as string[] | undefined;

          if (Array.isArray(accounts) && accounts.length > 0) {
            MetaMaskSdkClient.setCachedAccounts(accounts);
            try {
              const chainIdResult = await provider.request({
                method: 'eth_chainId',
              });
              const chainId =
                typeof chainIdResult === 'string' ? chainIdResult : undefined;
              MetaMaskSdkClient.setCachedSelectedChainId(chainId);
            } catch {
              // ignore
            }
            return accounts[0];
          }

          if (i < pollAttempts - 1) {
            await new Promise((r) => setTimeout(r, ACCOUNTS_POLL_DELAY_MS));
          }
        }

        // If we still have no accounts, use SDK connect().
        // Important: we must use sdk.connect({ chainIds }) even when the extension is installed.
        // eth_requestAccounts only authorizes the current chain, which leads to repeated
        // "Review permissions" prompts when switching chains.
        const chainIds = this.evmNetworks.map((n) =>
          toNumericChainId(n.chainId),
        );
        const { accounts } = await MetaMaskSdkClient.connect(chainIds);
        if (!accounts?.length) return undefined;
        return accounts[0];
      } catch (error) {
        logger.error('[MetaMaskEvmWalletConnector] getAddress failed:', error);
        throw error;
      } finally {
        MetaMaskSdkClient.clearOnDisplayUriCallback();
      }
    })().finally(() => {
      MetaMaskEvmWalletConnector.getAddressPromise = null;
    });

    return MetaMaskEvmWalletConnector.getAddressPromise;
  }

  override async getConnectedAccounts(): Promise<string[]> {
    return MetaMaskSdkClient.getAccounts();
  }

  override async endSession(): Promise<void> {
    await MetaMaskSdkClient.disconnect();
  }

  /** Get supported networks as chain IDs (decimal strings) */
  async getSupportedNetworks(): Promise<string[]> {
    return this.evmNetworks.map((n) => String(toNumericChainId(n.chainId)));
  }
}

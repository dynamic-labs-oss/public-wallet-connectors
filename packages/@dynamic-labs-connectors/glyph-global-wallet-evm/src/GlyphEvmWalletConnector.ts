import {
  EthereumInjectedConnector,
  type IEthereum,
} from '@dynamic-labs/ethereum';
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { DynamicError } from '@dynamic-labs/utils';
import { toPrivyWalletProvider } from '@privy-io/cross-app-connect';
import { toHex, type Chain as ViemChain } from 'viem';
import { apeChain, curtis } from 'viem/chains';
import {
  GLYPH_APP_ID,
  glyphConnectorDetails,
  STAGING_GLYPH_APP_ID,
} from './constants.js';

export class GlyphEvmWalletConnector extends EthereumInjectedConnector {
  /**
   * The name of the wallet connector
   * @override Required override from the base connector class
   */
  override name = 'Glyph';

  useStagingTenant: boolean;

  apeChainNetworks: ViemChain[];

  static initHasRun = false;

  /**
   * The constructor for the connector, with the relevant metadata
   * @param props The options for the connector
   */
  constructor(props: EthereumWalletConnectorOpts, useStagingTenant?: boolean) {
    super({
      ...props,
      metadata: {
        id: glyphConnectorDetails.id,
        name: glyphConnectorDetails.name,
        icon: glyphConnectorDetails.iconUrl,
      },
    });

    this.useStagingTenant = useStagingTenant || false;

    this.apeChainNetworks = [];

    if (props.evmNetworks.find((c) => c.chainId === apeChain.id)) {
      this.apeChainNetworks.push(apeChain);
    }
    if (props.evmNetworks.find((c) => c.chainId === curtis.id)) {
      this.apeChainNetworks.push(curtis);
    }
  }

  // Returns false because we don't want to switch networks and only support apeChain and curtis
  override supportsNetworkSwitching(): boolean {
    return false;
  }

  override isInstalledOnBrowser(): boolean {
    return true;
  }

  override async init(): Promise<void> {
    // this function can be called multiple times, so you must have a flag that indicates if the connector is already initialized
    // (can't be an instance variable, because it will be reset every time the connector is instantiated)
    // once the provider is initialized, you should emit the providerReady event once, and only once
    if (GlyphEvmWalletConnector.initHasRun) {
      return;
    }
    // if there are no apeChain or curtis networks configured, we can't initialize the connector
    if (this.apeChainNetworks.length === 0) {
      return;
    }
    GlyphEvmWalletConnector.initHasRun = true;

    console.log('[GlyphEvmWalletConnector] onProviderReady');
    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
    });
  }

  override findProvider(): IEthereum | undefined {
    const chain =
      this.getActiveChain() || this.apeChainNetworks?.[0] || apeChain;
    this.setActiveChain(chain);

    const privyProvider = toPrivyWalletProvider({
      providerAppId: this.useStagingTenant
        ? STAGING_GLYPH_APP_ID
        : GLYPH_APP_ID,
      chains: [chain],
      chainId: chain.id,
      smartWalletMode: false,
    });

    return privyProvider as unknown as IEthereum;
  }

  override async getAddress(): Promise<string | undefined> {
    const accounts = await this.findProvider()?.request({
      method: 'eth_requestAccounts',
    });
    return accounts?.[0] as string | undefined;
  }

  override async getConnectedAccounts(): Promise<string[]> {
    return (
      (await this.findProvider()?.request({ method: 'eth_requestAccounts' })) ??
      []
    );
  }

  override async signMessage(message: string): Promise<string> {
    const provider = this.findProvider();
    if (!provider) {
      throw new DynamicError('No provider found', 'no_provider_found');
    }
    const address = await this.getAddress();
    return (await provider.request({
      method: 'personal_sign',
      params: [toHex(message), address],
    })) as unknown as string;
  }
}

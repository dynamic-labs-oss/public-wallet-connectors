import {
  EthereumInjectedConnector,
  type IEthereum,
} from '@dynamic-labs/ethereum';
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { DynamicError } from '@dynamic-labs/utils';
import { toPrivyWalletProvider } from '@privy-io/cross-app-connect';
import { toHex, type Chain } from 'viem';
import {
  GLYPH_APP_ID,
  glyphConnectorDetails,
  STAGING_GLYPH_APP_ID,
  VIEM_CHAINS,
} from './constants.js';
import { GlyphSupportedChainsResponse } from './types.js';
import { apeChain } from 'viem/chains';

export class GlyphEvmWalletConnector extends EthereumInjectedConnector {
  /**
   * The name of the wallet connector
   * @override Required override from the base connector class
   */
  override name = 'Glyph';

  static initHasRun = false;

  useStagingTenant: boolean;

  supportedNetworkIds: number[] = [];

  // networks from constructor `props.evmNetworks`
  _networkIdsFromProps: (string | number)[] = [];

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

    this._networkIdsFromProps = props.evmNetworks.map((c) => c.chainId);
  }

  // Returns false because we don't want to switch networks and only support certain chains
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

    await this.setupSupportedNetworks();
    // if there are no apeChain or curtis networks configured, we can't initialize the connector
    if (this.supportedNetworkIds.length === 0)
      return;

    GlyphEvmWalletConnector.initHasRun = true;

    console.log('[GlyphEvmWalletConnector] onProviderReady');
    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
    });
  }

  override findProvider(): IEthereum | undefined {
    let chain = this.getActiveChain();
    // chain in case no active chain is set, or if active chain is not supported
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const fallbackChain: Chain = this.supportedNetworkIds.length ?  VIEM_CHAINS[this.supportedNetworkIds[0]!]! : apeChain;

    if(!chain || !this.supportedNetworkIds.includes(chain.id))
      chain = fallbackChain;

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
      throw new DynamicError('No provider found');
    }
    const address = await this.getAddress();
    return (await provider.request({
      method: 'personal_sign',
      params: [toHex(message), address],
    })) as unknown as string;
  }

  private async setupSupportedNetworks(): Promise<void> {
    const chainsEndpoint = this.useStagingTenant ? 'https://staging.useglyph.io/api/public/supported_chains' : 'https://useglyph.io/api/public/supported_chains';
    const response = await fetch(chainsEndpoint);
    const data = (await response.json()) as GlyphSupportedChainsResponse;
    for (const chain of data.chains) {
      if (this._networkIdsFromProps.includes(chain.id)) {
        this.supportedNetworkIds.push(chain.id);
      }
    }
  }
}

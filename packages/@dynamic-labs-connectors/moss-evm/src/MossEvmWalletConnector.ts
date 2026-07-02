import { type Hex } from 'viem';

import { logger } from '@dynamic-labs/wallet-connector-core';
import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { EthereumInjectedConnector, type IEthereum } from '@dynamic-labs/ethereum';

import { MossWalletSdkClient } from './MossWalletSdkClient.js';

const MOSS_ICON =
  'data:image/png;base64,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';

export class MossEvmWalletConnector extends EthereumInjectedConnector {
  override name = 'MOSS Wallet';

  override canConnectViaCustodialService = true;

  constructor(props: EthereumWalletConnectorOpts) {
    super({
      ...props,
      metadata: {
        id: 'mossWallet',
        name: 'MOSS Wallet',
        icon: MOSS_ICON,
      },
    });
  }

  override async init(): Promise<void> {
    if (MossWalletSdkClient.isInitialized) {
      return;
    }

    await MossWalletSdkClient.init();
    this.onProviderReady();
  }

  private onProviderReady = async (): Promise<void> => {
    logger.debug('[MossEvmWalletConnector] onProviderReady');

    this.walletConnectorEventsEmitter.emit('providerReady', {
      connector: this,
      shouldAutoConnect: await this.shouldAutoConnect(),
    });
  };

  private async shouldAutoConnect(): Promise<boolean> {
    const address = await this.getAddress();

    logger.debug(
      '[MossEvmWalletConnector] shouldAutoConnect - address:',
      address,
    );

    return Boolean(address);
  }

  override supportsNetworkSwitching(): boolean {
    return false;
  }

  override findProvider(): IEthereum | undefined {
    return MossWalletSdkClient.getProvider();
  }

  override async getAddress(): Promise<string | undefined> {
    return MossWalletSdkClient.getAddress();
  }

  override async getConnectedAccounts(): Promise<string[]> {
    const account = await this.getAddress();

    if (!account) {
      return [];
    }

    this.setActiveAccount(account as Hex);

    return [account];
  }

  override async signMessage(
    messageToSign: string,
  ): Promise<string | undefined> {
    const client = this.getWalletClient();

    if (!client) {
      return undefined;
    }

    return client.signMessage({
      message: messageToSign,
    });
  }

  override filter(): boolean {
    return Boolean(MossWalletSdkClient.getProvider());
  }
}

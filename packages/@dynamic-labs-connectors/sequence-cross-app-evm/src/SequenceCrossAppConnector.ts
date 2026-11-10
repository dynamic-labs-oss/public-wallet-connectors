import { type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import {
  EthereumInjectedConnector,
  type IEthereum,
} from '@dynamic-labs/ethereum';
import { DynamicError } from '@dynamic-labs/utils';
import { toHex } from 'viem';

import { SequenceWaasTransportProvider } from './SequenceWaasTransportProvider.js';

export type CrossAppTransportConfig = {
  projectAccessKey: string;
  walletUrl: string;
  initialChainId: number;
};

export class SequenceCrossAppConnector extends EthereumInjectedConnector {
  private readonly nodesUrl = 'https://nodes.sequence.app';
  private readonly walletName: string;
  sequenceWaasTransportProvider: SequenceWaasTransportProvider;

  override get name() {
    return this.walletName;
  }

  constructor(
    props: EthereumWalletConnectorOpts & {
      transportConfig: CrossAppTransportConfig;
    },
  ) {
    super(props);

    if (!props.metadata?.id) {
      throw new Error('Metadata prop id is required');
    }

    this.walletName = props.metadata.id;
    this.sequenceWaasTransportProvider = new SequenceWaasTransportProvider(
      props.transportConfig.projectAccessKey,
      props.transportConfig.walletUrl,
      props.transportConfig.initialChainId,
      this.nodesUrl,
    );
  }

  override supportsNetworkSwitching(): boolean {
    return true;
  }

  override isInstalledOnBrowser(): boolean {
    return true;
  }

  override findProvider(): IEthereum | undefined {
    return this.sequenceWaasTransportProvider as unknown as IEthereum;
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

  override endSession(): Promise<void> {
    this.sequenceWaasTransportProvider.disconnect();
    return Promise.resolve();
  }
}

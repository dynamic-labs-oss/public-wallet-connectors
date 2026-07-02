import { mega } from '@megaeth-labs/wallet-sdk';
import type { Config as MossConfig, ConnectionStatus } from '@megaeth-labs/wallet-sdk';
import { logger } from '@dynamic-labs/wallet-connector-core';
import type { IEthereum } from '@dynamic-labs/ethereum';
import { hexToString, isAddress, isHex } from 'viem';
import { megaeth, megaethTestnet } from 'viem/chains';

const NETWORK_TO_CHAIN_ID = {
  mainnet: megaeth.id,
  testnet: megaethTestnet.id,
} as const satisfies Record<string, number>;

type Listener = (...args: unknown[]) => void;

class MossEip1193Provider {
  private readonly listeners = new Map<string, Set<Listener>>();
  private account: `0x${string}` | undefined;
  private chainIdHex: string;

  constructor(chainId: number) {
    this.chainIdHex = `0x${chainId.toString(16)}`;
  }

  applyStatus(status: ConnectionStatus | undefined) {
    const next =
      status?.status === 'connected' && status.address
        ? (status.address as `0x${string}`)
        : undefined;
    const prev = this.account;
    this.account = next;

    if (prev !== next) {
      this.emit('accountsChanged', next ? [next] : []);
    }
    if (!prev && next) {
      this.emit('connect', { chainId: this.chainIdHex });
    }
    if (prev && !next) {
      this.emit('disconnect', new Error('MOSS Wallet disconnected.'));
    }
  }

  async request({
    method,
    params,
  }: {
    method: string;
    params?: unknown[];
  }): Promise<unknown> {
    switch (method) {
      case 'eth_accounts':
        return this.account ? [this.account] : [];

      case 'eth_chainId':
        return this.chainIdHex;

      case 'eth_requestAccounts': {
        const status = await mega.connect();
        this.applyStatus(status);
        if (status.status !== 'connected' || !status.address) {
          throw new Error('User rejected the connection request.');
        }
        return [status.address];
      }

      case 'personal_sign': {
        if (!this.account) {
          throw new Error('Not connected to MOSS Wallet.');
        }
        const args = params as [string, string];
        const [first, second] = args;

        // Handle legacy reversed order [address, message]
        let message = first;
        if (isAddress(first) && !isAddress(second)) {
          message = second;
        }

        if (isHex(message)) {
          message = hexToString(message);
        }

        const result = await mega.signMessage(message);
        if (result.status !== 'success' || !result.signature) {
          throw new Error(result.error ?? 'MOSS Wallet sign message failed.');
        }
        return result.signature;
      }

      case 'eth_signTypedData_v4': {
        if (!this.account) {
          throw new Error('Not connected to MOSS Wallet.');
        }
        const [, rawTypedData] = params as [string, string | object];
        const data =
          typeof rawTypedData === 'string'
            ? JSON.parse(rawTypedData)
            : rawTypedData;
        const result = await mega.signData({ data });
        if (result.status !== 'success' || !result.signature) {
          throw new Error(result.error ?? 'MOSS Wallet sign typed data failed.');
        }
        return result.signature;
      }

      case 'eth_sendTransaction': {
        if (!this.account) {
          throw new Error('Not connected to MOSS Wallet.');
        }
        const [tx] = params as [
          { to: `0x${string}`; value?: string; data?: `0x${string}` },
        ];
        const result = await mega.callContract({
          address: tx.to,
          value: tx.value !== undefined ? BigInt(tx.value) : 0n,
          data: tx.data,
        });
        if (result.status !== 'approved' || !result.receipt?.hash) {
          throw new Error(result.error ?? 'MOSS Wallet transaction failed.');
        }
        return result.receipt.hash;
      }

      default:
        throw new Error(`Method not supported: ${method}`);
    }
  }

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  removeListener(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

export class MossWalletSdkClient {
  static isInitialized = false;
  static provider: MossEip1193Provider | undefined;

  private constructor() {
    throw new Error('MossWalletSdkClient is not instantiable');
  }

  static init = async (config?: Partial<MossConfig>): Promise<void> => {
    if (MossWalletSdkClient.isInitialized) {
      return;
    }

    MossWalletSdkClient.isInitialized = true;

    logger.debug('[MossWalletSdkClient] initializing');

    const mergedConfig: MossConfig = { network: 'mainnet', ...config };
    const initialStatus =
      (await mega.initialise(mergedConfig)) ?? (await mega.status());

    const network = initialStatus.network as keyof typeof NETWORK_TO_CHAIN_ID;
    const chainId = NETWORK_TO_CHAIN_ID[network] ?? NETWORK_TO_CHAIN_ID.mainnet;
    const provider = new MossEip1193Provider(chainId);
    provider.applyStatus(initialStatus);

    mega.events.onStatusChange((status) => {
      provider.applyStatus(status);
    });

    MossWalletSdkClient.provider = provider;

    logger.debug('[MossWalletSdkClient] initialized');
  };

  static getAddress = async (): Promise<string | undefined> => {
    if (!MossWalletSdkClient.provider) {
      return undefined;
    }
    const accounts = (await MossWalletSdkClient.provider.request({
      method: 'eth_accounts',
    })) as string[];
    return accounts[0];
  };

  static getProvider = (): IEthereum | undefined => {
    return MossWalletSdkClient.provider as unknown as IEthereum | undefined;
  };
}

import { logger } from '@dynamic-labs/wallet-connector-core';
import { type IEthereum } from '@dynamic-labs/ethereum';

export class LedgerSdkClient {
  static isInitialized = false;
  static provider: IEthereum | undefined;

  private constructor() {
    throw new Error('LedgerSdkClient is not instantiable');
  }

  static init = async () => {
    if (LedgerSdkClient.isInitialized) return;

    LedgerSdkClient.isInitialized = true;
    logger.debug('[LedgerSdkClient] Initializing Ledger provider');

    LedgerSdkClient.provider = window.ethereum as unknown as IEthereum;
    logger.debug('[LedgerSdkClient] Ledger provider initialized');
  };

  static getAddress = async (): Promise<string | undefined> => {
    try {
      const accounts = (await window.ethereum?.request({
        method: 'eth_accounts',
      })) as string[];

      return accounts.length ? accounts[0] : undefined;
    } catch (error) {
      logger.error('[LedgerSdkClient] getAddress error:', error);
      return undefined;
    }
  };

  static getProvider = () => {
    // Casting to IEthereum because the Ledger provider implements the eip-1193 interface
    // And that the expected type for the parent class EthereumInjectedConnector
    return LedgerSdkClient.provider as unknown as IEthereum;
  };

  static isLedgerLive = () => {
    // @ts-expect-error: isLedgerLive is a custom property not in IEthereum type
    return !!window.ethereum?.isLedgerLive;
  };
}

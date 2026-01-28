import { logger } from '@dynamic-labs/wallet-connector-core';

/**
 * Static singleton client for MetaMask SDK.
 * Phase 1: Placeholder implementation.
 */
export class MetaMaskSdkClient {
  static isInitialized = false;

  private constructor() {
    throw new Error('MetaMaskSdkClient is not instantiable');
  }

  /**
   * Initialize the MetaMask SDK.
   * Phase 1: Just logs and sets initialized flag.
   */
  static init = async (): Promise<void> => {
    if (MetaMaskSdkClient.isInitialized) {
      return;
    }

    logger.debug('[MetaMaskSdkClient] init called (placeholder)');
    MetaMaskSdkClient.isInitialized = true;
    logger.debug('[MetaMaskSdkClient] initialized');
  };

  /**
   * Get the EIP-1193 provider.
   * Phase 1: Returns undefined (no real SDK yet).
   */
  static getProvider = (): undefined => {
    return undefined;
  };

  /**
   * Reset the singleton (for testing).
   */
  static reset = (): void => {
    MetaMaskSdkClient.isInitialized = false;
  };
}

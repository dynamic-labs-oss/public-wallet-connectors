import { SafeAppProvider } from '@safe-global/safe-apps-provider';
import SafeAppsSDK, { type SafeInfo } from '@safe-global/safe-apps-sdk';
import { logger } from '@dynamic-labs/wallet-connector-core';
import { type IEthereum } from '@dynamic-labs/ethereum';

export class SafeSdkClient {
  static isInitialized = false;

  // This is what we use to fetch the safe wallet data and initialize the provider
  static safeSdk: SafeAppsSDK;

  // This is injected by the safe app
  // It contains the safe wallet data
  static safeInfo: SafeInfo | undefined;

  // This is the eip-1193 provider
  static provider: SafeAppProvider;

  private constructor() {
    throw new Error('SafeSdkClient is not instantiable');
  }

  static init = async () => {
    if (SafeSdkClient.isInitialized) {
      return;
    }

    SafeSdkClient.isInitialized = true;

    try {
      await SafeSdkClient.initializeProvider();
    } finally {
      // Keep concurrent calls guarded, but allow retries if no provider was created.
      SafeSdkClient.isInitialized = Boolean(SafeSdkClient.provider);
    }
  };

  private static initializeProvider = async () => {
    logger.debug('[SafeSdkClient] initializing sdk');

    SafeSdkClient.safeSdk = new SafeAppsSDK();

    logger.debug('[SafeSdkClient] sdk initialized');

    // Times out after 1 second if the safe info is not loaded
    SafeSdkClient.safeInfo = await Promise.race([
      SafeSdkClient.safeSdk.safe.getInfo(),
      new Promise<undefined>((resolve) => setTimeout(resolve, 1000)),
    ]);

    if (!SafeSdkClient.safeInfo) {
      logger.debug('[SafeSdkClient] unable to load safe data');
      return;
    }

    logger.debug('[SafeSdkClient] initializing provider');

    SafeSdkClient.provider = new SafeAppProvider(
      SafeSdkClient.safeInfo,
      SafeSdkClient.safeSdk,
    );

    logger.debug('[SafeSdkClient] provider initialized');
  };

  static getAddress = () => {
    return SafeSdkClient.safeInfo?.safeAddress;
  };

  static getProvider = () => {
    // Casting to IEthereum because the Safe provider implements the eip-1193 interface
    // And that the expected type for the parent class EthereumInjectedConnector
    return SafeSdkClient.provider as unknown as IEthereum;
  };
}

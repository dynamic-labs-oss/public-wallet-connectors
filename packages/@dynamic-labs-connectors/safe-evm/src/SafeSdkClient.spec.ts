import { SafeAppProvider } from '@safe-global/safe-apps-provider';
import SafeAppsSDK, { type SafeInfo } from '@safe-global/safe-apps-sdk';
import { SafeSdkClient } from './SafeSdkClient.js';

jest.mock('@safe-global/safe-apps-provider');
jest.mock('@safe-global/safe-apps-sdk');
jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: {
    debug: jest.fn(),
  },
}));

describe('SafeSdkClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset static properties
    SafeSdkClient.isInitialized = false;
    SafeSdkClient.safeInfo = undefined;
    SafeSdkClient.safeSdk = undefined as any;
    SafeSdkClient.provider = undefined as any;
  });

  describe('init', () => {
    it('should retry initialization after safe info times out', async () => {
      jest.useFakeTimers();
      try {
        const safeInfo: SafeInfo = {
          chainId: 1,
          isReadOnly: false,
          owners: [],
          safeAddress: '0x123',
          threshold: 1,
        };
        const getInfo = jest
          .fn()
          .mockImplementationOnce(() => new Promise(() => undefined))
          .mockResolvedValueOnce(safeInfo);
        (SafeAppsSDK as jest.Mock).mockImplementation(() => ({
          safe: { getInfo },
        }));

        const firstAttempt = SafeSdkClient.init();
        await jest.advanceTimersByTimeAsync(1000);
        await firstAttempt;

        await SafeSdkClient.init();

        expect(getInfo).toHaveBeenCalledTimes(2);
        expect(SafeSdkClient.isInitialized).toBe(true);
        expect(SafeAppProvider).toHaveBeenCalledWith(
          safeInfo,
          SafeSdkClient.safeSdk,
        );
      } finally {
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    });

    it('should retry initialization after safe info fails to load', async () => {
      const error = new Error('Safe app is not ready');
      const safeInfo: SafeInfo = {
        chainId: 1,
        isReadOnly: false,
        owners: [],
        safeAddress: '0x123',
        threshold: 1,
      };
      const getInfo = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(safeInfo);
      (SafeAppsSDK as jest.Mock).mockImplementation(() => ({
        safe: { getInfo },
      }));

      await expect(SafeSdkClient.init()).rejects.toBe(error);
      await SafeSdkClient.init();

      expect(getInfo).toHaveBeenCalledTimes(2);
      expect(SafeSdkClient.isInitialized).toBe(true);
      expect(SafeSdkClient.getAddress()).toBe(safeInfo.safeAddress);
    });

    it('should only initialize once', async () => {
      const mockGetInfo = jest.fn().mockResolvedValue({
        chainId: 1,
        isReadOnly: false,
        owners: [],
        safeAddress: '0x123',
        threshold: 1,
      });
      (SafeAppsSDK as jest.Mock).mockImplementation(() => ({
        safe: {
          getInfo: mockGetInfo,
        },
      }));

      await SafeSdkClient.init();
      const firstSdk = SafeSdkClient.safeSdk;
      expect(firstSdk).toBeDefined();
      expect(SafeSdkClient.isInitialized).toBe(true);

      await SafeSdkClient.init();
      expect(SafeSdkClient.safeSdk).toBe(firstSdk);
      expect(mockGetInfo).toHaveBeenCalledTimes(1);
    });

    it('should not initialize another provider while safe info is loading', async () => {
      let resolveInfo!: (info: SafeInfo) => void;
      const getInfo = jest.fn().mockReturnValue(
        new Promise<SafeInfo>((resolve) => {
          resolveInfo = resolve;
        }),
      );
      (SafeAppsSDK as jest.Mock).mockImplementation(() => ({
        safe: { getInfo },
      }));

      const firstAttempt = SafeSdkClient.init();
      await SafeSdkClient.init();

      expect(SafeAppsSDK).toHaveBeenCalledTimes(1);
      expect(SafeAppProvider).not.toHaveBeenCalled();

      resolveInfo({
        chainId: 1,
        isReadOnly: false,
        owners: [],
        safeAddress: '0x123',
        threshold: 1,
      });
      await firstAttempt;
      await SafeSdkClient.init();

      expect(getInfo).toHaveBeenCalledTimes(1);
      expect(SafeAppProvider).toHaveBeenCalledTimes(1);
    });

    it('should initialize provider when safe info is available', async () => {
      const mockSafeInfo: SafeInfo = {
        chainId: 1,
        isReadOnly: false,
        owners: [],
        safeAddress: '0x123',
        threshold: 1,
      };
      (SafeAppsSDK as jest.Mock).mockImplementation(() => ({
        safe: {
          getInfo: jest.fn().mockResolvedValue(mockSafeInfo),
        },
      }));

      await SafeSdkClient.init();

      expect(SafeSdkClient.safeInfo).toEqual(mockSafeInfo);
      expect(SafeAppProvider).toHaveBeenCalledWith(
        mockSafeInfo,
        SafeSdkClient.safeSdk,
      );
    });

    it('should handle timeout when safe info is not available', async () => {
      (SafeAppsSDK as jest.Mock).mockImplementation(() => ({
        safe: {
          getInfo: jest
            .fn()
            .mockImplementation(
              () => new Promise((resolve) => setTimeout(resolve, 2000)),
            ),
        },
      }));

      await SafeSdkClient.init();

      expect(SafeSdkClient.safeInfo).toBeUndefined();
      expect(SafeAppProvider).not.toHaveBeenCalled();
    });

    it('should handle no safe info', async () => {
      (SafeAppsSDK as jest.Mock).mockImplementation(() => ({
        safe: {
          getInfo: jest.fn().mockResolvedValue(undefined),
        },
      }));

      await SafeSdkClient.init();

      expect(SafeSdkClient.safeInfo).toBeUndefined();
      expect(SafeAppProvider).not.toHaveBeenCalled();
    });
  });

  describe('getAddress', () => {
    it('should return undefined when safe info is not available', () => {
      SafeSdkClient.safeInfo = undefined;
      expect(SafeSdkClient.getAddress()).toBeUndefined();
    });

    it('should return safe address when safe info is available', () => {
      SafeSdkClient.safeInfo = {
        chainId: 1,
        isReadOnly: false,
        owners: [],
        safeAddress: '0x123',
        threshold: 1,
      };
      expect(SafeSdkClient.getAddress()).toBe('0x123');
    });
  });

  describe('getProvider', () => {
    it('should return the provider cast as IEthereum', () => {
      const mockProvider = new SafeAppProvider({} as any, {} as any);
      SafeSdkClient.provider = mockProvider;

      const provider = SafeSdkClient.getProvider();
      expect(provider).toBe(mockProvider);
    });
  });

  describe('constructor', () => {
    it('should not be instantiable', () => {
      // @ts-expect-error testing private constructor
      expect(() => new SafeSdkClient()).toThrow();
    });
  });
});

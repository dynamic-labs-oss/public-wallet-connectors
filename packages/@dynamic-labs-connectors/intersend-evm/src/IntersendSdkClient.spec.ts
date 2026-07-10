import {
  DEFAULT_INTERSEND_ALLOWED_ORIGINS,
  IntersendSdkClient,
} from './IntersendSdkClient.js';

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: {
    debug: jest.fn(),
  },
}));

const ALLOWED_ORIGIN = DEFAULT_INTERSEND_ALLOWED_ORIGINS[0];
const UNTRUSTED_ORIGIN = 'https://evil.example';

const mockPostMessage = jest.fn();
const mockAddEventListener = jest.fn();

/** Handlers registered via `window.addEventListener('message', ...)`. */
let messageHandlers: ((event: any) => void)[] = [];

/**
 * Drives the connect handshake by replaying an `INTERSEND_CONNECT_RESPONSE`
 * back to the connect handler as soon as it registers. The response echoes the
 * `requestId` from the outbound connect request unless overridden.
 */
const setupConnectResponse = (
  payload: unknown,
  {
    origin = ALLOWED_ORIGIN,
    requestId,
  }: { origin?: string; requestId?: string } = {},
) => {
  mockAddEventListener.mockImplementation((event, handler) => {
    if (event !== 'message') return;
    messageHandlers.push(handler);

    const connectCall = mockPostMessage.mock.calls.find(
      ([msg]) => msg?.type === 'INTERSEND_CONNECT_REQUEST',
    );
    // The persistent handleMessage listener registers before any connect
    // request is posted; only the connect handler should receive the response.
    if (!connectCall) return;

    handler({
      origin,
      source: global.window.parent,
      data: {
        type: 'INTERSEND_CONNECT_RESPONSE',
        requestId: requestId ?? connectCall[0].requestId,
        payload,
      },
    });
  });
};

describe('IntersendSdkClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    messageHandlers = [];

    // Reset static properties
    IntersendSdkClient.isInitialized = false;
    IntersendSdkClient.intersendInfo = undefined;
    IntersendSdkClient.walletOrigin = undefined;
    IntersendSdkClient.provider = undefined as any;
    // Reset the (private) allowlist so tests overriding it don't leak.
    (IntersendSdkClient as any).allowedOrigins = [
      ...DEFAULT_INTERSEND_ALLOWED_ORIGINS,
    ];

    // Setup window mocks
    global.window = Object.create(window);
    Object.defineProperty(global.window, 'postMessage', {
      configurable: true,
      value: mockPostMessage,
    });
    Object.defineProperty(global.window, 'addEventListener', {
      configurable: true,
      value: mockAddEventListener,
    });
    // The connector talks to window.parent; point it at the mocked window so
    // outbound postMessage calls are observable.
    Object.defineProperty(global.window, 'parent', {
      configurable: true,
      value: global.window,
    });

    Object.defineProperty(global.window, 'crypto', {
      configurable: true,
      value: {
        randomUUID: jest.fn().mockReturnValue('123'),
      },
    });

    // Default: register handlers without injecting a connect response.
    mockAddEventListener.mockImplementation((event, handler) => {
      if (event === 'message') messageHandlers.push(handler);
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should not be instantiable', () => {
      expect(() => new (IntersendSdkClient as any)()).toThrow();
    });
  });

  describe('init', () => {
    it('should only initialize once', async () => {
      const mockInfo = { address: '0x123', chainId: 1 };
      setupConnectResponse(mockInfo);

      await IntersendSdkClient.init();
      expect(IntersendSdkClient.isInitialized).toBe(true);
      expect(IntersendSdkClient.intersendInfo).toEqual(mockInfo);
      expect(IntersendSdkClient.walletOrigin).toBe(ALLOWED_ORIGIN);
      expect(mockAddEventListener).toHaveBeenCalledTimes(2);

      // Second init should not reinitialize
      await IntersendSdkClient.init();
      expect(mockAddEventListener).toHaveBeenCalledTimes(2);
    });

    it('should handle timeout when info is not received', async () => {
      jest.useFakeTimers();

      const initPromise = IntersendSdkClient.init();
      jest.advanceTimersByTime(1000);

      await initPromise;
      expect(IntersendSdkClient.intersendInfo).toBeUndefined();
      expect(IntersendSdkClient.walletOrigin).toBeUndefined();

      jest.useRealTimers();
    });

    it('sends connect requests pinned to allowed origins and never uses "*"', async () => {
      setupConnectResponse({ address: '0x123', chainId: 1 });

      await IntersendSdkClient.init();

      const connectCalls = mockPostMessage.mock.calls.filter(
        ([msg]) => msg?.type === 'INTERSEND_CONNECT_REQUEST',
      );
      expect(connectCalls.length).toBe(DEFAULT_INTERSEND_ALLOWED_ORIGINS.length);
      for (const [, targetOrigin] of connectCalls) {
        expect(targetOrigin).not.toBe('*');
        expect(DEFAULT_INTERSEND_ALLOWED_ORIGINS).toContain(targetOrigin);
      }
    });

    it('rejects a connect response from an untrusted origin', async () => {
      jest.useFakeTimers();
      setupConnectResponse(
        { address: '0xAttacker', chainId: 137 },
        { origin: UNTRUSTED_ORIGIN },
      );

      const initPromise = IntersendSdkClient.init();
      jest.advanceTimersByTime(1000);
      await initPromise;

      expect(IntersendSdkClient.intersendInfo).toBeUndefined();
      expect(IntersendSdkClient.walletOrigin).toBeUndefined();
      jest.useRealTimers();
    });

    it('rejects a connect response with a mismatched requestId', async () => {
      jest.useFakeTimers();
      setupConnectResponse(
        { address: '0xAttacker', chainId: 137 },
        { requestId: 'not-the-real-id' },
      );

      const initPromise = IntersendSdkClient.init();
      jest.advanceTimersByTime(1000);
      await initPromise;

      expect(IntersendSdkClient.intersendInfo).toBeUndefined();
      expect(IntersendSdkClient.walletOrigin).toBeUndefined();
      jest.useRealTimers();
    });

    it('honors a custom allowedOrigins allowlist', async () => {
      const customOrigin = 'https://wallet.custom.example';
      setupConnectResponse(
        { address: '0x123', chainId: 1 },
        { origin: customOrigin },
      );

      await IntersendSdkClient.init({ allowedOrigins: [customOrigin] });

      expect(IntersendSdkClient.walletOrigin).toBe(customOrigin);
      const connectCalls = mockPostMessage.mock.calls.filter(
        ([msg]) => msg?.type === 'INTERSEND_CONNECT_REQUEST',
      );
      expect(connectCalls.map(([, target]) => target)).toEqual([customOrigin]);
    });
  });

  describe('getAddress', () => {
    it('should return undefined when info is not available', () => {
      IntersendSdkClient.intersendInfo = undefined;
      expect(IntersendSdkClient.getAddress()).toBeUndefined();
    });

    it('should return address when info is available', () => {
      IntersendSdkClient.intersendInfo = { address: '0x123', chainId: 1 };
      expect(IntersendSdkClient.getAddress()).toBe('0x123');
    });
  });

  describe('getProvider', () => {
    it('should return the provider', () => {
      const mockProvider = {} as any;
      IntersendSdkClient.provider = mockProvider;
      expect(IntersendSdkClient.getProvider()).toBe(mockProvider);
    });
  });

  describe('provider methods', () => {
    const mockInfo = { address: '0x123', chainId: 1 };

    beforeEach(async () => {
      setupConnectResponse(mockInfo);
      await IntersendSdkClient.init();
    });

    it('should handle eth_requestAccounts', async () => {
      const provider = IntersendSdkClient.getProvider();
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
        params: [],
      });
      expect(accounts).toEqual(['0x123']);
    });

    it('should handle eth_chainId', async () => {
      const provider = IntersendSdkClient.getProvider();
      const chainId = await provider.request({
        method: 'eth_chainId',
        params: [],
      });
      expect(chainId).toBe('0x1');
    });

    it('should throw error for unsupported methods', async () => {
      const provider = IntersendSdkClient.getProvider();
      await expect(
        provider.request({ method: 'unsupported_method', params: [] }),
      ).rejects.toThrow('Unsupported method: unsupported_method');
    });

    it('pins outbound sign requests to the verified wallet origin and resolves on a matching response', async () => {
      const provider = IntersendSdkClient.getProvider();
      const resultPromise = provider.request({
        method: 'personal_sign',
        params: ['hello'],
      });

      const signCall = mockPostMessage.mock.calls.find(
        ([msg]) => msg?.type === 'SIGN_MESSAGE_REQUEST',
      );
      expect(signCall).toBeDefined();
      expect(signCall![1]).toBe(ALLOWED_ORIGIN);
      expect(signCall![1]).not.toBe('*');

      const handleMessage = messageHandlers[0];
      handleMessage({
        origin: ALLOWED_ORIGIN,
        data: {
          type: 'SIGN_MESSAGE_RESPONSE',
          requestId: signCall![0].requestId,
          payload: '0xsignature',
        },
      });

      await expect(resultPromise).resolves.toBe('0xsignature');
    });

    it('ignores a response injected from a non-wallet origin', async () => {
      const provider = IntersendSdkClient.getProvider();
      const resultPromise = provider.request({
        method: 'eth_sendTransaction',
        params: [{ to: '0xabc' }],
      });

      const txCall = mockPostMessage.mock.calls.find(
        ([msg]) => msg?.type === 'TRANSACTION_REQUEST',
      );
      expect(txCall).toBeDefined();

      const handleMessage = messageHandlers[0];
      handleMessage({
        origin: UNTRUSTED_ORIGIN,
        data: {
          type: 'TRANSACTION_RESPONSE',
          requestId: txCall![0].requestId,
          payload: '0xFORGED_BY_ATTACKER',
        },
      });

      let settled = false;
      void resultPromise.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
    });
  });
});

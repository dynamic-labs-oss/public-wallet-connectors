import { createWalletClient, custom, type WalletClient } from 'viem';
import { polygon } from 'viem/chains';
import { logger } from '@dynamic-labs/wallet-connector-core';
import { type IEthereum } from '@dynamic-labs/ethereum';
import { EventEmitter } from 'events';

interface IntersendInfo {
  address: string;
  chainId: number;
}

/**
 * Origins of the Interspace (Intersend) wallet host that is allowed to embed
 * the dapp and exchange `postMessage` traffic with this connector.
 *
 * Every outbound message is pinned to one of these origins (never `'*'`) and
 * every inbound message whose `event.origin` is not the verified wallet origin
 * is dropped. Override at runtime via `IntersendSdkClient.init({ allowedOrigins })`
 * if the wallet host is served from a different origin.
 */
export const DEFAULT_INTERSEND_ALLOWED_ORIGINS = [
  'https://app.intersend.io',
  'https://app.interspace.fi',
];

// Create a proper provider type that extends IEthereum
class IntersendProvider extends EventEmitter {
  public readonly isIntersend = true;
  public readonly selectedAddress: string | null = null;
  public readonly providers?: object[];

  constructor(private intersendInfo?: IntersendInfo) {
    super();
    this.selectedAddress = intersendInfo?.address || null;
  }

  async request<T extends string>(params: { method: T; params?: any[] }): Promise<T extends "eth_requestAccounts" ? [string] : any> {
    const { method, params: methodParams = [] } = params;
    const requestId = `${Date.now()}-${Math.random()}`;

    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [this.intersendInfo?.address] as any;

      case 'eth_chainId':
        return `0x${this.intersendInfo?.chainId.toString(16)}` as any;

      case 'eth_sendTransaction':
        return new Promise((resolve) => {
          IntersendSdkClient.setPendingRequest(requestId, resolve);
          IntersendSdkClient.postToWallet({
            type: 'TRANSACTION_REQUEST',
            payload: { params: methodParams[0] },
            requestId
          });
        });

      case 'personal_sign':
      case 'eth_sign':
        return new Promise((resolve) => {
          IntersendSdkClient.setPendingRequest(requestId, resolve);
          IntersendSdkClient.postToWallet({
            type: 'SIGN_MESSAGE_REQUEST',
            payload: { message: methodParams[0] },
            requestId
          });
        });

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }
}

export class IntersendSdkClient {
  static isInitialized = false;
  static provider: IntersendProvider;
  static walletClient: WalletClient;
  static intersendInfo: IntersendInfo | undefined;
  /**
   * Origin of the wallet host verified during the connect handshake. Outbound
   * messages are pinned to it and inbound messages from any other origin are
   * rejected. Stays `undefined` until a trusted host answers the connect
   * request, so nothing is trusted before the handshake completes.
   */
  static walletOrigin: string | undefined;
  private static allowedOrigins: string[] = DEFAULT_INTERSEND_ALLOWED_ORIGINS;
  private static pendingRequests = new Map<string, (value: any) => void>();

  private static isAllowedOrigin = (origin: string): boolean =>
    IntersendSdkClient.allowedOrigins.includes(origin);

  /**
   * Sends a message to the wallet host, pinned to the origin verified during
   * the connect handshake. Drops the message if no trusted origin is known.
   */
  static postToWallet = (message: Record<string, unknown>): void => {
    const targetOrigin = IntersendSdkClient.walletOrigin;
    if (!targetOrigin) {
      logger.debug(
        '[IntersendSdkClient] no verified wallet origin; dropping message',
      );
      return;
    }
    window.parent.postMessage(message, targetOrigin);
  };

  private constructor() {
    throw new Error('IntersendSdkClient is not instantiable');
  }

  static init = async (options?: { allowedOrigins?: string[] }) => {
    if (IntersendSdkClient.isInitialized) {
      return;
    }

    IntersendSdkClient.isInitialized = true;
    if (options?.allowedOrigins?.length) {
      IntersendSdkClient.allowedOrigins = options.allowedOrigins;
    }
    logger.debug('[IntersendSdkClient] initializing sdk');

    // Setup message listener for communication with parent frame
    window.addEventListener('message', IntersendSdkClient.handleMessage);

    // Bind the connect handshake to a per-init id so a connect response cannot
    // be injected out of band.
    const connectRequestId = `${Date.now()}-${Math.random()}`;

    // Request initial connection info from the parent. Pin each request to a
    // trusted origin: the browser only delivers a message to the parent when
    // its origin matches the targetOrigin, so an untrusted embedder never
    // receives the request and cannot answer it.
    for (const origin of IntersendSdkClient.allowedOrigins) {
      window.parent.postMessage(
        { type: 'INTERSEND_CONNECT_REQUEST', requestId: connectRequestId },
        origin,
      );
    }

    // Wait for connection response
    IntersendSdkClient.intersendInfo = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(undefined), 1000);
      
      const handler = (event: MessageEvent) => {
        // Only trust a connect response from an allowed origin that echoes the
        // id we just issued.
        if (!IntersendSdkClient.isAllowedOrigin(event.origin)) {
          return;
        }
        if (event.data?.type !== 'INTERSEND_CONNECT_RESPONSE') {
          return;
        }
        if (event.data?.requestId !== connectRequestId) {
          return;
        }

        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        IntersendSdkClient.walletOrigin = event.origin;
        resolve(event.data.payload);
      };

      window.addEventListener('message', handler);
    });

    if (!IntersendSdkClient.intersendInfo) {
      logger.debug('[IntersendSdkClient] unable to load intersend data');
      return;
    }

    logger.debug('[IntersendSdkClient] initializing provider');

    // Create provider instance
    IntersendSdkClient.provider = new IntersendProvider(IntersendSdkClient.intersendInfo);

    // Initialize viem wallet client
    IntersendSdkClient.walletClient = createWalletClient({
      chain: polygon,
      transport: custom(IntersendSdkClient.provider)
    });

    // Announce wallet following EIP-6963
    IntersendSdkClient.announceProvider();

    logger.debug('[IntersendSdkClient] provider initialized');
  };

  private static handleMessage = (event: MessageEvent) => {
    // Reject any message that is not from the wallet host verified during the
    // connect handshake.
    if (
      !IntersendSdkClient.walletOrigin ||
      event.origin !== IntersendSdkClient.walletOrigin
    ) {
      return;
    }

    const { type, payload, requestId } = event.data ?? {};
    
    switch (type) {
      case 'TRANSACTION_RESPONSE':
      case 'SIGN_MESSAGE_RESPONSE': {
        const pendingResolve = IntersendSdkClient.pendingRequests.get(requestId);
        if (pendingResolve) {
          pendingResolve(payload);
          IntersendSdkClient.pendingRequests.delete(requestId);
        }
        break;
      }
    }
  };

  // Implement EIP-6963 announcement
  private static announceProvider() {
    const info = {
      uuid: 'intersend-wallet-' + crypto.randomUUID(),
      name: 'Intersend Wallet',
      icon: 'data:image/svg+xml;base64,...', // Your wallet icon
      rdns: 'com.intersend.wallet'
    };

    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info,
          provider: IntersendSdkClient.provider
        }
      })
    );
  }

  static getAddress = () => {
    return IntersendSdkClient.intersendInfo?.address;
  };

  static getProvider = () => {
    return IntersendSdkClient.provider as unknown as IEthereum;
  };

  static getWalletClient = () => {
    return IntersendSdkClient.walletClient;
  };

  static setPendingRequest = (requestId: string, func: (value: any) => void) => {
    IntersendSdkClient.pendingRequests.set(requestId, func);
  };
}

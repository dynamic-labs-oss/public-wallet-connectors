import {
  getTransportType,
  type StoreClient,
} from '@metamask/connect-multichain';

/**
 * Custom storage backend for MetaMask Connect state. Mirrors
 * `@metamask/connect-multichain`'s `StoreClient` (minus its `TransportType`
 * enum) so consumers don't need that package's types directly --
 * `toMultichainStoreClient` bridges the two.
 */
export interface MetaMaskStorageClient {
  platform: 'web' | 'rn' | 'node';
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  getAnonId(): Promise<string>;
  setAnonId(anonId: string): Promise<void>;
  removeAnonId(): Promise<void>;
  getExtensionId(): Promise<string | null>;
  setExtensionId(extensionId: string): Promise<void>;
  removeExtensionId(): Promise<void>;
  getTransportType(): Promise<string | null>;
  setTransportType(transportType: string): Promise<void>;
  removeTransportType(): Promise<void>;
  getDebug(): Promise<string | null>;
}

/**
 * Bridges a `MetaMaskStorageClient` into the `StoreClient` shape
 * `@metamask/connect-multichain`'s `createMultichainClient` expects.
 */
export function toMultichainStoreClient(
  storage: MetaMaskStorageClient,
): StoreClient {
  const storeClient: StoreClient = {
    adapter: {
      platform: storage.platform,
      get: (key: string) => storage.get(key),
      set: (key: string, value: string) => storage.set(key, value),
      delete: (key: string) => storage.delete(key),
    },
    getAnonId: () => storage.getAnonId(),
    setAnonId: (anonId: string) => storage.setAnonId(anonId),
    removeAnonId: () => storage.removeAnonId(),
    getExtensionId: () => storage.getExtensionId(),
    setExtensionId: (extensionId: string) =>
      storage.setExtensionId(extensionId),
    removeExtensionId: () => storage.removeExtensionId(),
    getTransportType: async () => {
      const value = await storage.getTransportType();
      return value ? getTransportType(value) : null;
    },
    setTransportType: (transportType) =>
      storage.setTransportType(transportType),
    removeTransportType: () => storage.removeTransportType(),
    getDebug: () => storage.getDebug(),
  };

  return storeClient;
}

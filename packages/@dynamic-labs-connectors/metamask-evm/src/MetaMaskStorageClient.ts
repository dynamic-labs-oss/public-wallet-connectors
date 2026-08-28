import {
  getTransportType,
  type StoreClient,
} from '@metamask/connect-multichain';

const ANON_ID_KEY = 'metamask_anon_id';
const EXTENSION_ID_KEY = 'metamask_extension_id';
const TRANSPORT_TYPE_KEY = 'metamask_transport_type';

/**
 * Custom storage backend for MetaMask Connect state -- just a generic
 * key-value store. `toMultichainStoreClient` builds the fuller
 * `@metamask/connect-multichain` `StoreClient` shape on top of it.
 */
export interface MetaMaskStorageClient {
  platform: 'web' | 'rn' | 'node';
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Bridges a `MetaMaskStorageClient` into the `StoreClient` shape
 * `@metamask/connect-multichain`'s `createMultichainClient` expects.
 */
export function toMultichainStoreClient(
  storage: MetaMaskStorageClient,
): StoreClient {
  return {
    adapter: {
      platform: storage.platform,
      get: (key: string) => storage.get(key),
      set: (key: string, value: string) => storage.set(key, value),
      delete: (key: string) => storage.delete(key),
    },
    getAnonId: async () => {
      const existing = await storage.get(ANON_ID_KEY);
      if (existing) return existing;

      const anonId = crypto.randomUUID();
      await storage.set(ANON_ID_KEY, anonId);
      return anonId;
    },
    setAnonId: (anonId: string) => storage.set(ANON_ID_KEY, anonId),
    removeAnonId: () => storage.delete(ANON_ID_KEY),
    getExtensionId: () => storage.get(EXTENSION_ID_KEY),
    setExtensionId: (extensionId: string) =>
      storage.set(EXTENSION_ID_KEY, extensionId),
    removeExtensionId: () => storage.delete(EXTENSION_ID_KEY),
    getTransportType: async () => {
      const value = await storage.get(TRANSPORT_TYPE_KEY);
      return value ? getTransportType(value) : null;
    },
    setTransportType: (transportType) =>
      storage.set(TRANSPORT_TYPE_KEY, transportType),
    removeTransportType: () => storage.delete(TRANSPORT_TYPE_KEY),
    // Never persisted -- this connector always initializes the SDK with
    // `debug: false` (see MetaMaskSdkClient), so there's nothing to restore.
    getDebug: () => Promise.resolve(null),
  };
}

import {
  getTransportType,
  type StoreClient,
} from '@metamask/connect-multichain';

/**
 * Storage contract for persisting MetaMask Connect state (session cache,
 * anonymous analytics id, extension id, transport type, debug flag) through
 * a host-provided backend, in place of `@metamask/connect-multichain`'s own
 * default storage (IndexedDB on web, raw AsyncStorage on React Native).
 *
 * Structurally mirrors `@metamask/connect-multichain`'s `StoreClient`, minus
 * its `TransportType` enum (kept as plain strings here), so a host app can
 * implement this without depending on MetaMask's package directly --
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

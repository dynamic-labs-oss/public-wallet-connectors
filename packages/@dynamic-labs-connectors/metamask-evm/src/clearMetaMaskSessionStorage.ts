// MetaMask Connect persists session state in this IndexedDB database.
// The base name is hardcoded in @metamask/connect-multichain's StoreAdapterWeb
// and the suffix is "-kv-store" on web.
const METAMASK_SDK_IDB_NAME = 'mmconnect-kv-store';

/**
 * Deletes the MetaMask SDK's IndexedDB session storage so the next connect call
 * emits a fresh display_uri synchronously instead of spending the SDK's
 * 10-second resume timeout reviving a dead pairing. Safe in SSR (no-op) and
 * when the DB is held open by another tab (resolves on blocked).
 */
export const clearMetaMaskSessionStorage = (): Promise<void> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(METAMASK_SDK_IDB_NAME);

      request.onsuccess = () => resolve();
      // onerror / onblocked fire when a concurrent tab holds the DB open.
      // We still resolve so the caller's connect flow is not stalled; the
      // next tab close drops the lock and subsequent runs reach the empty DB.
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
};

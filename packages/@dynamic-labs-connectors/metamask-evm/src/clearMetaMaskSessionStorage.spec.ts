import { clearMetaMaskSessionStorage } from './clearMetaMaskSessionStorage.js';

type FakeRequest = {
  onblocked: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onsuccess: ((event?: unknown) => void) | null;
};

const MM_DB_NAME = 'mmconnect-kv-store';

describe('clearMetaMaskSessionStorage', () => {
  const originalIndexedDB = globalThis.indexedDB;
  let deleteDatabaseMock: jest.Mock;
  let fakeRequest: FakeRequest;

  beforeEach(() => {
    fakeRequest = { onblocked: null, onerror: null, onsuccess: null };
    deleteDatabaseMock = jest.fn(() => fakeRequest);
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { deleteDatabase: deleteDatabaseMock },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: originalIndexedDB,
      writable: true,
    });
  });

  it('requests deletion of the MetaMask SDK IndexedDB database', async () => {
    const promise = clearMetaMaskSessionStorage();

    expect(deleteDatabaseMock).toHaveBeenCalledTimes(1);
    expect(deleteDatabaseMock).toHaveBeenCalledWith(MM_DB_NAME);

    fakeRequest.onsuccess?.();
    await promise;
  });

  it('resolves when the delete request succeeds', async () => {
    const promise = clearMetaMaskSessionStorage();

    fakeRequest.onsuccess?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves even when the delete request errors', async () => {
    const promise = clearMetaMaskSessionStorage();

    fakeRequest.onerror?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves when the delete request is blocked by another tab', async () => {
    const promise = clearMetaMaskSessionStorage();

    fakeRequest.onblocked?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it('only resolves once even if multiple lifecycle events fire', async () => {
    const promise = clearMetaMaskSessionStorage();

    fakeRequest.onsuccess?.();
    fakeRequest.onsuccess?.();
    fakeRequest.onerror?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves when indexedDB is undefined', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    await expect(clearMetaMaskSessionStorage()).resolves.toBeUndefined();
    expect(deleteDatabaseMock).not.toHaveBeenCalled();
  });

  it('resolves when indexedDB.deleteDatabase throws synchronously', async () => {
    deleteDatabaseMock.mockImplementation(() => {
      throw new Error('synchronous delete failure');
    });

    await expect(clearMetaMaskSessionStorage()).resolves.toBeUndefined();
  });
});

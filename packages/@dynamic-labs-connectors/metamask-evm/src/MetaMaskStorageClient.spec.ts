import {
  toMultichainStoreClient,
  type MetaMaskStorageClient,
} from './MetaMaskStorageClient.js';

const mockGetTransportType = jest.fn((value: string) => value);

jest.mock('@metamask/connect-multichain', () => ({
  getTransportType: (value: string) => mockGetTransportType(value),
}));

describe('MetaMaskStorageClient', () => {
  describe('toMultichainStoreClient', () => {
    let storage: jest.Mocked<MetaMaskStorageClient>;

    beforeEach(() => {
      jest.clearAllMocks();
      mockGetTransportType.mockImplementation((value: string) => value);

      storage = {
        platform: 'rn',
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        getAnonId: jest.fn().mockResolvedValue('anon-id'),
        setAnonId: jest.fn().mockResolvedValue(undefined),
        removeAnonId: jest.fn().mockResolvedValue(undefined),
        getExtensionId: jest.fn().mockResolvedValue(null),
        setExtensionId: jest.fn().mockResolvedValue(undefined),
        removeExtensionId: jest.fn().mockResolvedValue(undefined),
        getTransportType: jest.fn().mockResolvedValue(null),
        setTransportType: jest.fn().mockResolvedValue(undefined),
        removeTransportType: jest.fn().mockResolvedValue(undefined),
        getDebug: jest.fn().mockResolvedValue(null),
      };
    });

    it('should carry the platform onto the adapter', () => {
      const storeClient = toMultichainStoreClient(storage);
      expect(storeClient.adapter.platform).toBe('rn');
    });

    it('should proxy adapter.get/set/delete to the storage client', async () => {
      const storeClient = toMultichainStoreClient(storage);

      await storeClient.adapter.get('key');
      expect(storage.get).toHaveBeenCalledWith('key');

      await storeClient.adapter.set('key', 'value');
      expect(storage.set).toHaveBeenCalledWith('key', 'value');

      await storeClient.adapter.delete('key');
      expect(storage.delete).toHaveBeenCalledWith('key');
    });

    it('should proxy anonId methods', async () => {
      const storeClient = toMultichainStoreClient(storage);

      await expect(storeClient.getAnonId()).resolves.toBe('anon-id');

      await storeClient.setAnonId('new-anon-id');
      expect(storage.setAnonId).toHaveBeenCalledWith('new-anon-id');

      await storeClient.removeAnonId();
      expect(storage.removeAnonId).toHaveBeenCalled();
    });

    it('should proxy extensionId methods', async () => {
      const storeClient = toMultichainStoreClient(storage);

      await storeClient.getExtensionId();
      expect(storage.getExtensionId).toHaveBeenCalled();

      await storeClient.setExtensionId('ext-id');
      expect(storage.setExtensionId).toHaveBeenCalledWith('ext-id');

      await storeClient.removeExtensionId();
      expect(storage.removeExtensionId).toHaveBeenCalled();
    });

    it('should map a stored transport type string through getTransportType', async () => {
      storage.getTransportType.mockResolvedValue('browser');
      mockGetTransportType.mockReturnValue('browser');

      const storeClient = toMultichainStoreClient(storage);
      const result = await storeClient.getTransportType();

      expect(mockGetTransportType).toHaveBeenCalledWith('browser');
      expect(result).toBe('browser');
    });

    it('should return null without calling getTransportType when nothing is stored', async () => {
      storage.getTransportType.mockResolvedValue(null);

      const storeClient = toMultichainStoreClient(storage);
      const result = await storeClient.getTransportType();

      expect(mockGetTransportType).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should proxy setTransportType/removeTransportType', async () => {
      const storeClient = toMultichainStoreClient(storage);

      await storeClient.setTransportType('mwp');
      expect(storage.setTransportType).toHaveBeenCalledWith('mwp');

      await storeClient.removeTransportType();
      expect(storage.removeTransportType).toHaveBeenCalled();
    });

    it('should proxy getDebug', async () => {
      storage.getDebug.mockResolvedValue('metamask-sdk:*');

      const storeClient = toMultichainStoreClient(storage);
      await expect(storeClient.getDebug()).resolves.toBe('metamask-sdk:*');
    });
  });
});

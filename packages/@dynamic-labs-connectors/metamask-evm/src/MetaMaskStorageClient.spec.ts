import {
  toMultichainStoreClient,
  type MetaMaskStorageClient,
} from './MetaMaskStorageClient.js';

const mockGetTransportType = jest.fn((value: string) => value);
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    it('should generate and persist a UUID anonId when none is stored', async () => {
      storage.get.mockResolvedValue(null);

      const storeClient = toMultichainStoreClient(storage);
      const anonId = await storeClient.getAnonId();

      expect(anonId).toMatch(UUID_V4_REGEX);
      expect(storage.set).toHaveBeenCalledWith('metamask_anon_id', anonId);
    });

    it('should reuse an existing anonId without generating a new one', async () => {
      storage.get.mockResolvedValue('existing-anon-id');

      const storeClient = toMultichainStoreClient(storage);
      const anonId = await storeClient.getAnonId();

      expect(anonId).toBe('existing-anon-id');
      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should proxy setAnonId/removeAnonId to the fixed key', async () => {
      const storeClient = toMultichainStoreClient(storage);

      await storeClient.setAnonId('new-anon-id');
      expect(storage.set).toHaveBeenCalledWith(
        'metamask_anon_id',
        'new-anon-id',
      );

      await storeClient.removeAnonId();
      expect(storage.delete).toHaveBeenCalledWith('metamask_anon_id');
    });

    it('should proxy extensionId methods to the fixed key', async () => {
      const storeClient = toMultichainStoreClient(storage);

      await storeClient.getExtensionId();
      expect(storage.get).toHaveBeenCalledWith('metamask_extension_id');

      await storeClient.setExtensionId('ext-id');
      expect(storage.set).toHaveBeenCalledWith(
        'metamask_extension_id',
        'ext-id',
      );

      await storeClient.removeExtensionId();
      expect(storage.delete).toHaveBeenCalledWith('metamask_extension_id');
    });

    it('should map a stored transport type string through getTransportType', async () => {
      storage.get.mockResolvedValue('browser');
      mockGetTransportType.mockReturnValue('browser');

      const storeClient = toMultichainStoreClient(storage);
      const result = await storeClient.getTransportType();

      expect(storage.get).toHaveBeenCalledWith('metamask_transport_type');
      expect(mockGetTransportType).toHaveBeenCalledWith('browser');
      expect(result).toBe('browser');
    });

    it('should return null without calling getTransportType when nothing is stored', async () => {
      storage.get.mockResolvedValue(null);

      const storeClient = toMultichainStoreClient(storage);
      const result = await storeClient.getTransportType();

      expect(mockGetTransportType).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should proxy setTransportType/removeTransportType to the fixed key', async () => {
      const storeClient = toMultichainStoreClient(storage);

      await storeClient.setTransportType('mwp');
      expect(storage.set).toHaveBeenCalledWith('metamask_transport_type', 'mwp');

      await storeClient.removeTransportType();
      expect(storage.delete).toHaveBeenCalledWith('metamask_transport_type');
    });

    it('should never persist debug and always resolve null', async () => {
      const storeClient = toMultichainStoreClient(storage);
      await expect(storeClient.getDebug()).resolves.toBeNull();
      expect(storage.get).not.toHaveBeenCalled();
    });
  });
});

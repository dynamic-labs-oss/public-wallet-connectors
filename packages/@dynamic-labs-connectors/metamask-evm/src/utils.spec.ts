import {
  toNumericChainId,
  toCAIP2,
  toHexChainId,
  extractRpcUrl,
  buildSupportedNetworks,
  type EvmNetwork,
} from './utils.js';

describe('utils', () => {
  describe('toNumericChainId', () => {
    it('should handle number input', () => {
      expect(toNumericChainId(1)).toBe(1);
    });

    it('should handle hex string (0x1)', () => {
      expect(toNumericChainId('0x1')).toBe(1);
    });

    it('should handle hex string (0x89 = Polygon)', () => {
      expect(toNumericChainId('0x89')).toBe(137);
    });

    it('should handle decimal string', () => {
      expect(toNumericChainId('137')).toBe(137);
    });

    it('should handle large chain ID', () => {
      expect(toNumericChainId('42161')).toBe(42161);
    });
  });

  describe('toCAIP2', () => {
    it('should convert to CAIP-2 format', () => {
      expect(toCAIP2(1)).toBe('eip155:1');
    });

    it('should handle Polygon', () => {
      expect(toCAIP2(137)).toBe('eip155:137');
    });

    it('should handle Arbitrum', () => {
      expect(toCAIP2(42161)).toBe('eip155:42161');
    });
  });

  describe('toHexChainId', () => {
    it('should convert to hex', () => {
      expect(toHexChainId(1)).toBe('0x1');
    });

    it('should convert Polygon', () => {
      expect(toHexChainId(137)).toBe('0x89');
    });

    it('should convert Arbitrum', () => {
      expect(toHexChainId(42161)).toBe('0xa4b1');
    });
  });

  describe('extractRpcUrl', () => {
    it('should return undefined when no rpcUrls', () => {
      const network: EvmNetwork = { chainId: 1 };
      expect(extractRpcUrl(network)).toBeUndefined();
    });

    it('should handle Dynamic format (string[])', () => {
      const network: EvmNetwork = {
        chainId: 1,
        rpcUrls: ['https://eth.rpc'],
      };
      expect(extractRpcUrl(network)).toBe('https://eth.rpc');
    });

    it('should return first from Dynamic array', () => {
      const network: EvmNetwork = {
        chainId: 1,
        rpcUrls: ['https://first.rpc', 'https://second.rpc'],
      };
      expect(extractRpcUrl(network)).toBe('https://first.rpc');
    });

    it('should handle viem format (object with http string)', () => {
      const network: EvmNetwork = {
        chainId: 1,
        rpcUrls: { default: { http: 'https://eth.rpc' } },
      };
      expect(extractRpcUrl(network)).toBe('https://eth.rpc');
    });

    it('should handle viem format (object with http array)', () => {
      const network: EvmNetwork = {
        chainId: 1,
        rpcUrls: { default: { http: ['https://first.rpc', 'https://second.rpc'] } },
      };
      expect(extractRpcUrl(network)).toBe('https://first.rpc');
    });

    it('should return undefined for empty viem object', () => {
      const network: EvmNetwork = {
        chainId: 1,
        rpcUrls: { default: {} },
      };
      expect(extractRpcUrl(network)).toBeUndefined();
    });

    it('should return undefined for empty Dynamic array', () => {
      const network: EvmNetwork = {
        chainId: 1,
        rpcUrls: [],
      };
      expect(extractRpcUrl(network)).toBeUndefined();
    });
  });

  describe('buildSupportedNetworks', () => {
    it('should return empty object for empty array', () => {
      expect(buildSupportedNetworks([])).toEqual({});
    });

    it('should build single network', () => {
      const networks: EvmNetwork[] = [
        { chainId: 1, rpcUrls: ['https://eth.rpc'] },
      ];
      expect(buildSupportedNetworks(networks)).toEqual({
        'eip155:1': 'https://eth.rpc',
      });
    });

    it('should build multiple networks', () => {
      const networks: EvmNetwork[] = [
        { chainId: 1, rpcUrls: ['https://eth.rpc'] },
        { chainId: 137, rpcUrls: ['https://polygon.rpc'] },
      ];
      expect(buildSupportedNetworks(networks)).toEqual({
        'eip155:1': 'https://eth.rpc',
        'eip155:137': 'https://polygon.rpc',
      });
    });

    it('should skip networks without RPC', () => {
      const networks: EvmNetwork[] = [
        { chainId: 1, rpcUrls: ['https://eth.rpc'] },
        { chainId: 137 }, // no rpcUrls
        { chainId: 42161, rpcUrls: ['https://arb.rpc'] },
      ];
      expect(buildSupportedNetworks(networks)).toEqual({
        'eip155:1': 'https://eth.rpc',
        'eip155:42161': 'https://arb.rpc',
      });
    });

    it('should handle hex chain IDs', () => {
      const networks: EvmNetwork[] = [
        { chainId: '0x89', rpcUrls: ['https://polygon.rpc'] },
      ];
      expect(buildSupportedNetworks(networks)).toEqual({
        'eip155:137': 'https://polygon.rpc',
      });
    });
  });
});

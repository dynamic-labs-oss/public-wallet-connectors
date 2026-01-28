/**
 * Minimal EvmNetwork interface for what we need.
 * The full type comes from Dynamic's SDK.
 * rpcUrls can be string[] (Dynamic) or viem-style object.
 */
export interface EvmNetwork {
  chainId: number | string;
  rpcUrls?: string[] | {
    default?: {
      http?: string | string[];
    };
  };
}

/**
 * CAIP-2 chain ID format for EVM networks.
 * @example "eip155:1" for Ethereum mainnet
 */
export type CaipChainId = `eip155:${number}`;

/**
 * Convert a Dynamic network chainId (number | string) to numeric chainId.
 * Handles hex strings (0x1), decimal strings ("1"), and numbers (1).
 */
export function toNumericChainId(chainId: number | string): number {
  if (typeof chainId === 'number') return chainId;
  if (chainId.startsWith('0x')) return parseInt(chainId, 16);
  return parseInt(chainId, 10);
}

/**
 * Convert a numeric chain ID to CAIP-2 format.
 * @example toCAIP2(1) => "eip155:1"
 */
export function toCAIP2(chainId: number): CaipChainId {
  return `eip155:${chainId}`;
}

/**
 * Convert a numeric chain ID to hex string format.
 * @example toHexChainId(1) => "0x1"
 */
export function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

/**
 * Extract the first RPC URL from an EvmNetwork.
 * Handles Dynamic's string[] format and viem's nested object format.
 */
export function extractRpcUrl(network: EvmNetwork): string | undefined {
  const rpcUrls = network.rpcUrls;
  if (!rpcUrls) return undefined;

  // Dynamic format: string[]
  if (Array.isArray(rpcUrls)) {
    return rpcUrls[0];
  }

  // Viem format: { default: { http: string | string[] } }
  const http = rpcUrls.default?.http;
  if (!http) return undefined;
  if (Array.isArray(http)) return http[0];
  return http;
}

/**
 * Build supportedNetworks map for MetaMask SDK from Dynamic's evmNetworks.
 * Maps CAIP-2 chain IDs to RPC URLs.
 * @example { "eip155:1": "https://mainnet.infura.io/..." }
 */
export function buildSupportedNetworks(
  evmNetworks: EvmNetwork[],
): Record<CaipChainId, string> {
  const result: Record<CaipChainId, string> = {};

  for (const network of evmNetworks) {
    const chainId = toNumericChainId(network.chainId);
    const rpcUrl = extractRpcUrl(network);

    if (rpcUrl) {
      result[toCAIP2(chainId)] = rpcUrl;
    }
  }

  return result;
}

/**
 * Minimal EvmNetwork interface for Dynamic SDK integration.
 */
export interface EvmNetwork {
  chainId: number | string;
  rpcUrls?: string[] | {
    default?: {
      http?: string | string[];
    };
  };
}

/** CAIP-2 chain ID for EVM (e.g., "eip155:1") */
export type CaipChainId = `eip155:${number}`;

/**
 * Convert chainId to numeric format.
 * Handles hex (0x1), decimal string ("1"), and number (1).
 */
export function toNumericChainId(chainId: number | string): number {
  if (typeof chainId === 'number') return chainId;
  if (chainId.startsWith('0x')) return parseInt(chainId, 16);
  return parseInt(chainId, 10);
}

/**
 * Extract first RPC URL from Dynamic's EvmNetwork.
 * Handles Dynamic's string[] and viem's nested object formats.
 */
export function extractRpcUrl(network: EvmNetwork): string | undefined {
  const rpcUrls = network.rpcUrls;
  if (!rpcUrls) return undefined;

  // Dynamic format: string[]
  if (Array.isArray(rpcUrls)) return rpcUrls[0];

  // Viem format: { default: { http: string | string[] } }
  const http = rpcUrls.default?.http;
  if (!http) return undefined;
  return Array.isArray(http) ? http[0] : http;
}

/**
 * Build supportedNetworks map for MetaMask SDK.
 * Maps CAIP-2 chain IDs to RPC URLs.
 * Networks without RPC URLs are skipped.
 */
export function buildSupportedNetworks(
  evmNetworks: EvmNetwork[],
): Record<CaipChainId, string> {
  const result: Record<CaipChainId, string> = {};

  for (const network of evmNetworks) {
    const rpcUrl = extractRpcUrl(network);
    if (rpcUrl) {
      const chainId = toNumericChainId(network.chainId);
      result[`eip155:${chainId}`] = rpcUrl;
    }
  }

  return result;
}

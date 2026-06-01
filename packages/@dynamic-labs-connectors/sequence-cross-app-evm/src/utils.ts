export function normalizeChainId(
  chainId: string | number | bigint | { chainId: string },
): number {
  if (typeof chainId === 'object') {
    return normalizeChainId(chainId.chainId);
  }

  let normalizedChainId: number;
  if (typeof chainId === 'string') {
    const trimmed = chainId.trim();
    const isHex = trimmed.startsWith('0x');

    if (isHex ? !/^0x[\da-f]+$/iu.test(trimmed) : !/^\d+$/u.test(trimmed)) {
      throw new Error(`Invalid chain id: ${chainId}`);
    }

    normalizedChainId = Number.parseInt(trimmed, isHex ? 16 : 10);
  } else if (typeof chainId === 'bigint') {
    if (chainId < 0n || chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Invalid chain id: ${chainId.toString()}`);
    }
    normalizedChainId = Number(chainId);
  } else {
    normalizedChainId = chainId;
  }

  if (!Number.isSafeInteger(normalizedChainId) || normalizedChainId < 0) {
    throw new Error(`Invalid chain id: ${chainId.toString()}`);
  }

  return normalizedChainId;
}

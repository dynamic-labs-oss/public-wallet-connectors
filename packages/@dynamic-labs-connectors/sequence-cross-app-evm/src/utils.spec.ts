import { normalizeChainId } from './utils.js';

describe('normalizeChainId', () => {
  it('should normalize decimal and hex chain ids', () => {
    expect(normalizeChainId(1)).toBe(1);
    expect(normalizeChainId(1n)).toBe(1);
    expect(normalizeChainId('1')).toBe(1);
    expect(normalizeChainId('0x1')).toBe(1);
    expect(normalizeChainId({ chainId: '0x2105' })).toBe(8453);
  });

  it('should reject invalid string chain ids', () => {
    expect(() => normalizeChainId('')).toThrow('Invalid chain id');
    expect(() => normalizeChainId('abc')).toThrow('Invalid chain id');
    expect(() => normalizeChainId('0x')).toThrow('Invalid chain id');
    expect(() => normalizeChainId('1abc')).toThrow('Invalid chain id');
  });

  it('should reject unsafe bigint chain ids', () => {
    expect(() => normalizeChainId(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      'Invalid chain id',
    );
  });
});

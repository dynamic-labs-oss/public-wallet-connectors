import {
  MetaMaskSolanaWalletConnector,
  MetaMaskSolanaWalletConnectors,
} from './index.js';

jest.mock('@metamask/connect-solana', () => ({
  createSolanaClient: jest.fn(),
}));

jest.mock('@dynamic-labs/wallet-connector-core', () => ({
  logger: { debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@dynamic-labs/solana-core', () => ({
  SolanaWalletConnector: class {
    walletConnectorEventsEmitter = { emit: jest.fn() };
    constructor(_opts: unknown) {
      // no-op
    }
  },
}));

jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn(),
  Transaction: { from: jest.fn() },
  VersionedTransaction: { deserialize: jest.fn() },
}));

jest.mock('bs58', () => ({
  __esModule: true,
  default: { encode: jest.fn() },
  encode: jest.fn(),
}));

describe('index exports', () => {
  it('should export MetaMaskSolanaWalletConnector', () => {
    expect(MetaMaskSolanaWalletConnector).toBeDefined();
  });

  it('should export MetaMaskSolanaWalletConnectors factory', () => {
    expect(typeof MetaMaskSolanaWalletConnectors).toBe('function');
    const connectors = MetaMaskSolanaWalletConnectors({});
    expect(Array.isArray(connectors)).toBe(true);
    expect(connectors).toHaveLength(1);
  });
});

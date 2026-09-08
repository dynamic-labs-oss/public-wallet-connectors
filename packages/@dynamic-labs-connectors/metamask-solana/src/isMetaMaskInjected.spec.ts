/* eslint-disable @typescript-eslint/no-explicit-any */
import { isMetaMaskInjected } from './isMetaMaskInjected.js';

describe('isMetaMaskInjected', () => {
  const originalWindow = global.window;

  afterEach(() => {
    global.window = originalWindow;
  });

  it('should return false when window is undefined', () => {
    // @ts-expect-error - testing SSR
    delete (global as any).window;

    expect(isMetaMaskInjected()).toBe(false);
  });

  it('should return false when ethereum is absent', () => {
    (global as any).window = {};

    expect(isMetaMaskInjected()).toBe(false);
  });

  it('should return true for a MetaMask provider', () => {
    (global as any).window = { ethereum: { isMetaMask: true } };

    expect(isMetaMaskInjected()).toBe(true);
  });

  it('should return false for a provider selection router mirroring MetaMask flags', () => {
    (global as any).window = {
      ethereum: {
        addProvider: jest.fn(),
        isMetaMask: true,
        selectExtension: jest.fn(),
      },
    };

    expect(isMetaMaskInjected()).toBe(false);
  });

  it('should return true when a router collected a MetaMask provider', () => {
    (global as any).window = {
      ethereum: {
        addProvider: jest.fn(),
        isMetaMask: true,
        providers: [{ isPhantom: true }, { isMetaMask: true }],
        selectExtension: jest.fn(),
      },
    };

    expect(isMetaMaskInjected()).toBe(true);
  });

  it('should return false when the collected providers are other wallets', () => {
    (global as any).window = {
      ethereum: {
        addProvider: jest.fn(),
        isMetaMask: true,
        providers: [{ isPhantom: true }, { isSolflare: true }],
        selectExtension: jest.fn(),
      },
    };

    expect(isMetaMaskInjected()).toBe(false);
  });
});

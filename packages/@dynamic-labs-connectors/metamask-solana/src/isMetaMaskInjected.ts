type InjectedProvider = {
  addProvider?: unknown;
  isMetaMask?: boolean;
  providers?: InjectedProvider[];
  selectExtension?: unknown;
};

/**
 * A provider selection router exposes `addProvider` and `selectExtension`,
 * which a plain wallet provider does not.
 */
const isProviderSelectionRouter = (provider: InjectedProvider): boolean =>
  typeof provider.addProvider === 'function' &&
  typeof provider.selectExtension === 'function';

/**
 * True when a MetaMask extension provider is actually present on the page.
 */
export const isMetaMaskInjected = (): boolean => {
  // No DOM means no injected wallet — e.g. server-side rendering.
  if (typeof window === 'undefined') {
    return false;
  }

  const ethereum = (window as unknown as Record<string, unknown>)[
    'ethereum'
  ] as InjectedProvider | undefined;

  // Nothing was injected, so no wallet is available.
  if (!ethereum) {
    return false;
  }

  // When more than one wallet is installed, an extension may inject a "provider
  // selection router" instead of a plain provider: it collects every injected
  // extension and forwards requests to whichever one the user picks. Phantom
  // does this when its EVM setting asks which wallet to use. A router belongs to
  // no single wallet, yet it mirrors MetaMask's identity flags for dApp
  // compatibility — so `isMetaMask` on the router alone must not be trusted.
  //
  // A router keeps the extensions it found in `providers`. When that list is
  // present we inspect each collected extension individually rather than the
  // router itself; otherwise we only have the single provider on `ethereum`.
  const collectedProviders = ethereum.providers ?? [];
  const providers = collectedProviders.length ? collectedProviders : [ethereum];

  // Trust `isMetaMask` only when it comes from a real MetaMask provider, not a
  // router mirroring the flag. This way a router faking MetaMask reads false,
  // while a genuine MetaMask sitting behind the router is still detected.
  return providers.some(
    (provider) =>
      Boolean(provider?.isMetaMask) && !isProviderSelectionRouter(provider),
  );
};

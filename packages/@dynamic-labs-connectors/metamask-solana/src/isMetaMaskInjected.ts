type InjectedProvider = {
  addProvider?: unknown;
  isMetaMask?: boolean;
  providers?: InjectedProvider[];
  selectExtension?: unknown;
};

/**
 * A provider selection router collects the other injected providers and
 * forwards requests to whichever extension the user picks, so it belongs to no
 * single wallet. Routers mirror MetaMask's identity flags for dApp
 * compatibility — Phantom injects one into `window.ethereum` when its EVM
 * setting asks which wallet to use — so `isMetaMask` on a router says nothing
 * about MetaMask being installed.
 */
const isProviderSelectionRouter = (provider: InjectedProvider): boolean =>
  typeof provider.addProvider === 'function' &&
  typeof provider.selectExtension === 'function';

/**
 * True when a MetaMask extension provider is present on the page. Providers
 * collected by a router are inspected individually.
 */
export const isMetaMaskInjected = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const ethereum = (window as unknown as Record<string, unknown>)[
    'ethereum'
  ] as InjectedProvider | undefined;

  if (!ethereum) {
    return false;
  }

  const collectedProviders = ethereum.providers ?? [];
  const providers = collectedProviders.length ? collectedProviders : [ethereum];

  return providers.some(
    (provider) =>
      Boolean(provider?.isMetaMask) && !isProviderSelectionRouter(provider),
  );
};

"use client";

import { useState, useSyncExternalStore } from "react";
import {
  DynamicWidget,
  useDynamicContext,
} from "@dynamic-labs/sdk-react-core";

export default function Home() {
  const { primaryWallet, user, handleLogOut, network } = useDynamicContext();
  const [signResult, setSignResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [networkOpsResult, setNetworkOpsResult] = useState<string | null>(null);
  const [switchChainId, setSwitchChainId] = useState("137");
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  const handleSignMessage = async () => {
    setError(null);
    setSignResult(null);
    setNetworkOpsResult(null);

    if (!primaryWallet) {
      setError("No wallet connected");
      return;
    }

    try {
      const message = "Hello from Dynamic Playground! " + new Date().toISOString();
      const signature = await primaryWallet.signMessage(message);
      setSignResult(signature || "Signature received");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    setSignResult(null);
    setNetworkOpsResult(null);
    try {
      await handleLogOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const parseChainIdArg = (): number | string => {
    const raw = switchChainId.trim();
    if (raw.startsWith("0x") || raw.startsWith("0X")) {
      const n = parseInt(raw, 16);
      return Number.isNaN(n) ? raw : n;
    }
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  };

  const handlePrimaryWalletSwitchNetwork = async () => {
    setError(null);
    setNetworkOpsResult(null);
    if (!primaryWallet) {
      setError("No wallet connected");
      return;
    }
    try {
      const chainId = parseChainIdArg();
      await primaryWallet.switchNetwork(chainId);
      setNetworkOpsResult(
        `primaryWallet.switchNetwork(${JSON.stringify(chainId)}) completed.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConnectorGetNetwork = async () => {
    setError(null);
    setNetworkOpsResult(null);
    if (!primaryWallet?.connector) {
      setError("No connector on primary wallet");
      return;
    }
    try {
      const fromConnector = await primaryWallet.connector.getNetwork();
      const fromWallet = await primaryWallet.getNetwork();
      setNetworkOpsResult(
        JSON.stringify(
          {
            "connector.getNetwork()": fromConnector,
            "primaryWallet.getNetwork()": fromWallet,
            contextNetworkFromDynamic: network,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Dynamic Wallet Playground
          </h1>
          <p className="mt-2 text-gray-600">
            Testing Dynamic wallet connectors
          </p>
        </div>

        <div className="flex justify-center">
          <DynamicWidget />
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Connection Status
          </h2>

          {mounted && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Connected:</span>
              <span
                className={`font-mono ${primaryWallet ? "text-green-600" : "text-red-600"
                  }`}
              >
                {primaryWallet ? "Yes" : "No"}
              </span>
            </div>

            {primaryWallet && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">Address:</span>
                  <span className="font-mono text-gray-900">
                    {primaryWallet.address?.slice(0, 6)}...
                    {primaryWallet.address?.slice(-4)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Wallet:</span>
                  <span className="font-mono text-gray-900">
                    {primaryWallet.connector?.name || "Unknown"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Chain ID:</span>
                  <span className="font-mono text-gray-900">
                    {network ?? "Unknown"}
                  </span>
                </div>
              </>
            )}

            {user && (
              <div className="flex justify-between">
                <span className="text-gray-600">User ID:</span>
                <span className="font-mono text-gray-900 text-xs">
                  {user.userId?.slice(0, 8)}...
                </span>
              </div>
            )}
          </div>
          )}
        </div>

        {mounted && primaryWallet && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-xl font-semibold text-gray-800">Actions</h2>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                <label className="flex flex-col gap-1 text-sm text-gray-600">
                  Chain for switchNetwork
                  <input
                    type="text"
                    value={switchChainId}
                    onChange={(e) => setSwitchChainId(e.target.value)}
                    placeholder="137 or 0x89"
                    className="px-3 py-2 border border-gray-300 rounded-lg font-mono text-gray-900 w-40"
                  />
                </label>
                <button
                  type="button"
                  onClick={handlePrimaryWalletSwitchNetwork}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  primaryWallet.switchNetwork()
                </button>
                <button
                  type="button"
                  onClick={handleConnectorGetNetwork}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  connector.getNetwork()
                </button>
              </div>

              <div className="flex flex-wrap gap-4">
                <button
                  onClick={handleSignMessage}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sign Message
                </button>

                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Disconnect
                </button>

                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Refresh Page
                </button>
              </div>
            </div>

            {networkOpsResult && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-sm font-medium text-slate-800">
                  Network API result
                </p>
                <pre className="mt-2 text-xs font-mono text-slate-700 whitespace-pre-wrap break-all">
                  {networkOpsResult}
                </pre>
              </div>
            )}

            {signResult && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800">
                  Signature received!
                </p>
                <p className="mt-1 text-xs font-mono text-green-700 break-all">
                  {signResult.slice(0, 66)}...
                </p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="mt-1 text-xs text-red-700">{error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

# MetaMask Connect Integration - Handoff Document

**Jira:** WAPI-923
**PR:** [#127](https://github.com/dynamic-labs/public-wallet-connectors/pull/127)
**Branch:** `ts/metamask-evm-connector`
**Last updated:** 2026-03-06

## What this is

MetaMask wallet connectors for Dynamic using the new MetaMask Connect SDKs
(`@metamask/connect-evm@0.8.0` and `@metamask/connect-solana@0.6.0`). These
replace the legacy `@metamask/sdk` with the multichain-capable Connect
architecture.

Two new packages:
- `@dynamic-labs-connectors/metamask-evm` - EVM connector
- `@dynamic-labs-connectors/metamask-solana` - Solana connector

## Current state

```
 What works                              Extension    QR/Mobile
 ----------------------------------------------------------------
 EVM connect                                 yes         yes
 EVM sign message                            yes         yes
 EVM disconnect + reconnect                  yes         yes
 EVM session recovery (page refresh)         yes         yes
 Solana connect                              yes         yes
 Solana sign message                         yes         yes*
 Solana disconnect + reconnect               yes         NO**
 Solana session recovery (page refresh)      yes         yes
 Multichain (EVM + Solana side by side)      yes         yes

 * Requires latest MetaMask mobile dev build (see "Mobile dev build" below)
 ** Known issue, see "Blockers" below
```

## Architecture

```
 ┌─────────────────────────────────────────────────────────┐
 │                   Dynamic SDK                           │
 ├──────────────────────────┬──────────────────────────────┤
 │  MetaMaskEvmWallet       │  MetaMaskSolanaWallet        │
 │  Connector (158 lines)   │  Connector (157 lines)       │
 │  extends                 │  extends                     │
 │  EthereumInjectedConn.   │  SolanaWalletConnector       │
 ├──────────────────────────┼──────────────────────────────┤
 │  MetaMaskSdkClient       │  MetaMaskSolanaSdkClient     │
 │  (175 lines)             │  (188 lines)                 │
 │  static singleton        │  static singleton            │
 ├──────────────────────────┤  WalletStandardAdapter       │
 │                          │  (224 lines)                 │
 │                          │  bridges wallet-standard     │
 │                          │  to Dynamic's ISolana        │
 ├──────────────────────────┴──────────────────────────────┤
 │           MetaMask Connect Multichain Transport         │
 │           (shared between EVM and Solana)                │
 └─────────────────────────────────────────────────────────┘
```

Key design decisions:
- **No redundant caching.** SDK client reads accounts/chainId directly from
  the MetaMask SDK instances. Earlier versions maintained parallel caches that
  were removed during the architectural refactor.
- **Scoped disconnect.** EVM calls `sdk.disconnect()`. Solana uses
  `standard:disconnect` to avoid tearing down the shared transport (see
  Blocker #1 below).
- **Headless QR.** Both connectors run in headless mode. The SDK emits
  `display_uri` events which Dynamic renders as QR codes.

## File map

```
packages/@dynamic-labs-connectors/metamask-evm/src/
  MetaMaskSdkClient.ts           - Singleton wrapper for @metamask/connect-evm
  MetaMaskSdkClient.spec.ts      - 40 tests
  MetaMaskEvmWalletConnector.ts  - Dynamic connector (extends EthereumInjectedConnector)
  MetaMaskEvmWalletConnector.spec.ts - 32 tests
  utils.ts                       - Chain ID conversion, RPC URL extraction
  utils.spec.ts                  - Utility tests
  index.ts                       - Entry point / connector factory
  index.spec.ts                  - Registration tests

packages/@dynamic-labs-connectors/metamask-solana/src/
  MetaMaskSolanaSdkClient.ts     - Singleton wrapper for @metamask/connect-solana
  MetaMaskSolanaSdkClient.spec.ts - 20 tests
  MetaMaskSolanaWalletConnector.ts - Dynamic connector (extends SolanaWalletConnector)
  MetaMaskSolanaWalletConnector.spec.ts - 24 tests
  WalletStandardAdapter.ts      - Bridges wallet-standard to ISolana interface
  types.ts                       - StandardWallet / WalletAccount types
  index.ts                       - Entry point / connector factory
  index.spec.ts                  - Registration tests

playground/                      - Next.js app for manual testing
```

## Mobile dev build requirement

Testing Solana flows (especially signMessage rejection and QR code) requires a
**recent MetaMask mobile dev build** from the `main` branch. The latest stable
release (v7.67.2 as of 2026-03-06) does NOT include the necessary fixes. Key
commits that landed on `main` after v7.67.2:

| Commit | PR | What it fixes |
|--------|-----|---------------|
| `ab15f172` | [#26972](https://github.com/MetaMask/metamask-mobile/pull/26972) | **Solana signMessage rejection toast.** Previously, rejecting a Solana signMessage showed "Failed to establish connection" instead of "Approval rejected". Adds proper 3-tier error categorization for SDKConnectV2 RPC responses. Also works around a bug in `@metamask/eth-snap-keyring` where rejection code `4001` gets discarded and re-thrown as `-32603`. |
| `ca668952` | [#26648](https://github.com/MetaMask/metamask-mobile/pull/26648) | **Robust deeplink parsing.** Makes MetaMask Connect deeplink parsing more resilient, fixing edge cases in the QR code flow. |

These fixes are also complemented by connect-monorepo side fixes:

| Commit | PR | What it fixes |
|--------|-----|---------------|
| `4af5513` | [#189](https://github.com/MetaMask/connect-monorepo/pull/189) | **Solana rejection error codes.** `parseWalletError` threw an uncaught exception when the wallet returned error codes outside the EIP-1193 provider range (like `-32603`). This prevented Solana request rejections from being handled gracefully. |
| `e9e2ade` | [#191](https://github.com/MetaMask/connect-monorepo/pull/191) | **Log redaction.** Removes sensitive data from SDK transport logs. |

**How to get a dev build:**
- Android: download the latest `.apk` from the [Runway public bucket](https://github.com/MetaMask/metamask-mobile#download-and-install-the-development-build)
- iOS: requires device registration with MetaMask's Apple developer account, then download `.ipa` from Runway bucket
- Once these fixes ship in a stable mobile release, dev builds are no longer needed

## Blockers before release

### Blocker 1: Solana QR disconnect/reconnect

**Problem:** After connecting Solana via QR code, disconnecting, and
reconnecting via QR code, the connection fails.

**Root cause:** `@metamask/connect-solana@0.2.0`'s `client.disconnect()` calls
`core.disconnect()` with no scope parameter, which tears down the entire
multichain transport (including EVM). We work around this with
`standard:disconnect` (wallet-standard), which preserves the transport for
extension reconnection but doesn't properly reset the QR/transport session.

**Upstream fix:** [connect-monorepo PR #193](https://github.com/MetaMask/connect-monorepo/pull/193)
(merged 2026-03-03, not yet published to npm). This changes
`client.disconnect()` to call `core.disconnect(SOLANA_CAIP_IDS)`, scoping the
disconnect to Solana only.

**What to do when the fix is released:**
1. Upgrade `@metamask/connect-solana` to the version that includes PR #193
2. In `MetaMaskSolanaSdkClient.ts`, change `disconnect()` to use
   `client.disconnect()` again (re-add `disconnectFn` from client, remove the
   `standard:disconnect` workaround)
3. Verify QR code disconnect/reconnect works

**Code pointer:** `MetaMaskSolanaSdkClient.ts` lines 151-171. The comment in
the code documents exactly what to change.

### Blocker 2: EthereumWalletConnectors coexistence

**Problem:** When using `MetaMaskEvmWalletConnectors` alongside Dynamic's
built-in `EthereumWalletConnectors`, session recovery breaks after page
refresh.

**Root cause:** Both the old `@metamask/sdk` (used internally by
`EthereumWalletConnectors`) and the new `@metamask/connect-evm` share
`window.mmsdk` as a global singleton check. The old SDK initializes first,
the new SDK sees an already-initialized `window.mmsdk`, and skips its own
initialization.

**Current workaround:** Only include `MetaMaskEvmWalletConnectors` in the
connector list, not both:
```typescript
// Works
walletConnectors: [MetaMaskEvmWalletConnectors]

// Breaks - session recovery fails after refresh
walletConnectors: [EthereumWalletConnectors, MetaMaskEvmWalletConnectors]
```

**Expected resolution:** The singleton changes in connect-monorepo (PR #157,
released in v17.0.0) should have resolved this by properly scoping SDK
instances. This belief has NOT been verified. Before release, test the
coexistence scenario and confirm.

**What to do:**
1. Set up a playground that imports both `EthereumWalletConnectors` and
   `MetaMaskEvmWalletConnectors`
2. Connect with MetaMask via the new connector
3. Refresh the page
4. Check if session recovery works
5. If it doesn't, coordinate with Dynamic core team on migration strategy
   (options: exclude MetaMask from `EthereumWalletConnectors`, use a
   different global, or phase the release)

## How to test locally

```bash
# From repo root
pnpm install
npx nx run-many --target=build --all

# Playground setup
cd playground
npm install
# Copy built connectors into playground node_modules
cp -r ../dist/packages/@dynamic-labs-connectors/* node_modules/@dynamic-labs-connectors/
npm run dev
# Open http://localhost:3000
```

The playground uses Dynamic SDK with both MetaMask EVM and Solana connectors.

**Important:** For QR code / mobile testing, you MUST use a MetaMask mobile dev
build from `main` (not the stable App Store / Play Store release). See "Mobile
dev build requirement" above for the specific fixes needed and how to get a dev
build. Extension-based testing works with any current MetaMask extension version.

## Test matrix for final verification

| Flow                              | Extension | QR/Mobile |
|-----------------------------------|:---------:|:---------:|
| EVM connect                       |     -     |     -     |
| EVM sign message                  |     -     |     -     |
| EVM disconnect + reconnect        |     -     |     -     |
| EVM session recovery (refresh)    |     -     |     -     |
| Solana connect                    |     -     |     -     |
| Solana sign message               |     -     |     -     |
| Solana disconnect + reconnect     |     -     |     -     |
| Solana session recovery (refresh) |     -     |     -     |
| EVM + Solana coexistence          |     -     |     -     |
| EthereumWalletConnectors compat   |     -     |    n/a    |

## Dependencies

| Package                      | Version | Notes                               |
|------------------------------|---------|-------------------------------------|
| `@metamask/connect-evm`     | ^0.8.0  | Stable                              |
| `@metamask/connect-solana`  | ^0.6.0  | Stable                              |
| `@solana/web3.js`           | ^1.x    | For PublicKey, Transaction types     |
| `bs58`                       | ^6.0.0  | Solana signature encoding           |

## Commit history

```
2a36e20 fix(metamask-solana): use scoped disconnect to preserve shared transport
3fe1b11 refactor(metamask-solana): add autoConnect guard, simplify display URI and signMessage
015c7a6 refactor(metamask-evm): strip defensive caching layer, trust SDK state
bd9d08f test(metamask-solana): add comprehensive connector unit tests
ecf13cd refactor(metamask-solana): remove debug logging and signMessage fallbacks
5195762 feat(metamask-solana): add Solana connector with QR code and sign message support
e4cff48 feat(metamask-evm): upgrade to @metamask/connect-evm v0.5.0
c28da57 refactor: simplify MetaMask SDK lifecycle with reinstantiation pattern
748b75a fix: update SDK types for connect-evm PR #156
2e78e3c feat(metamask-evm): integrate MetaMask Connect EVM SDK
```

## Contact

This work was done by Tamas Soos in collaboration with the MetaMask Connect
team (aphex / wenfix on GitHub for upstream SDK issues).

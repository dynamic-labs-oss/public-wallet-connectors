# @dynamic-labs-connectors/metamask-evm

MetaMask wallet connector for Dynamic using `@metamask/connect-evm`.

## Installation

```bash
npm install @dynamic-labs-connectors/metamask-evm
```

## Usage

```typescript
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { MetaMaskEvmWalletConnectors } from '@dynamic-labs-connectors/metamask-evm';

function App() {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: 'your-environment-id',
        walletConnectors: [MetaMaskEvmWalletConnectors],
      }}
    >
      {/* Your app */}
    </DynamicContextProvider>
  );
}
```

## Features

- Extension connection (desktop)
- QR code connection (mobile)
- Session persistence
- Chain switching with auto-add

## Development

```bash
# Build
nx build @dynamic-labs-connectors/metamask-evm

# Test
nx test @dynamic-labs-connectors/metamask-evm

# Lint
nx lint @dynamic-labs-connectors/metamask-evm
```

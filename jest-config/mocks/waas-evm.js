// Mock for @dynamic-labs/waas-evm
// Avoids pulling the whole waas/sdk-api-core tree into jest runs when
// @dynamic-labs/ethereum's EthereumWalletConnectors requires it.

class DynamicWaasEVMConnector {
  constructor(props) {
    this.props = props;
  }
}

const DynamicWaasEVMConnectors = () => [DynamicWaasEVMConnector];

module.exports = {
  DynamicWaasEVMConnector,
  DynamicWaasEVMConnectors,
};

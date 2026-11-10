// Mock for @dynamic-labs-connectors/metamask-evm
// This provides a CommonJS version of the ES module

class MetaMaskEvmWalletConnector {
  constructor(props) {
    this.props = props;
  }
}

const MetaMaskEvmWalletConnectors = () => [MetaMaskEvmWalletConnector];

const createMetaMaskEvmConnector = (metamaskOpts = {}) => {
  return () => [
    class extends MetaMaskEvmWalletConnector {
      constructor(props) {
        super({ ...props, ...metamaskOpts });
      }
    },
  ];
};

module.exports = {
  MetaMaskEvmWalletConnector,
  MetaMaskEvmWalletConnectors,
  createMetaMaskEvmConnector,
};

export const WETH_ADDRESSES: { [key: number]: string } = {
  11155111: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH
  84532: "0x4200000000000000000000000000000000000006",   // Base Sepolia WETH
  421614: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",  // Arbitrum Sepolia WETH
  11155420: "0x4200000000000000000000000000000000000006"  // Optimism Sepolia WETH
};

export const NETWORK_NAMES: { [key: number]: string } = {
  11155111: "sepolia",
  84532: "base-sepolia",
  421614: "arbitrum-sepolia",
  11155420: "optimism-sepolia"
};

export const USDC_ADDRESSES: { [key: number]: string } = {
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",   // Base Sepolia USDC
  421614: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",  // Arbitrum Sepolia USDC
  11155420: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7"  // Optimism Sepolia USDC
};

export const ALL_CHAIN_IDS = [11155111, 84532, 421614, 11155420];

export interface DeploymentData {
  chainId: number;
  network: string;
  contractAddress: string;
  wethAddress: string;
  usdcAddress: string;
  deployer: string;
  deploymentTx?: string;
  timestamp: string;
  supportedTokens: {
    ETH: string;
    WETH: string;
    USDC: string;
  };
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
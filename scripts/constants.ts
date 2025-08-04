export const WETH_ADDRESSES: { [key: number]: string } = {
  11155111: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia WETH
  84532: '0x4200000000000000000000000000000000000006', // Base Sepolia WETH
  421614: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', // Arbitrum Sepolia WETH
  11155420: '0x4200000000000000000000000000000000000006', // Optimism Sepolia WETH
}

export const NETWORK_NAMES: { [key: number]: string } = {
  11155111: 'sepolia',
  84532: 'base-sepolia',
  421614: 'arbitrum-sepolia',
  11155420: 'optimism-sepolia',
}

export interface DeploymentData {
  chainId: number
  network: string
  contractAddress: string
  wethAddress: string
  usdcAddress: string
  deployer: string
  deploymentTx?: string
  timestamp: string
  supportedTokens: {
    ETH: string
    WETH: string
    USDC: string
  }
}

export interface Token {
  symbol: string
  name: string
  chainId: number
  address: string
  decimals: number
}

export interface Pair {
  id: string
  fromChain: number
  toChain: number
  fromToken: string
  toToken: string
  minAmount: string
  maxAmount: string
  enabled: boolean
}

export const TOKENS: Token[] = [
  // ETH on all chains
  {
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: 11155111,
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: 84532,
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: 421614,
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: 11155420,
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
  },

  // WETH on all chains
  {
    symbol: 'WETH',
    name: 'Wrapped Ethereum',
    chainId: 11155111,
    address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    decimals: 18,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ethereum',
    chainId: 84532,
    address: '0x4200000000000000000000000000000000000006',
    decimals: 18,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ethereum',
    chainId: 421614,
    address: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    decimals: 18,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ethereum',
    chainId: 11155420,
    address: '0x4200000000000000000000000000000000000006',
    decimals: 18,
  },

  // USDC with different decimals per chain
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: 11155111,
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    decimals: 6,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: 84532,
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    decimals: 6,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: 421614,
    address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    decimals: 6,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: 11155420,
    address: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    decimals: 6,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: 56,
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    decimals: 18,
  },
]

export const PAIRS: Pair[] = [
  // ETH pairs from Sepolia
  {
    id: 'ETH_SEPOLIA_TO_BASE',
    fromChain: 11155111,
    toChain: 84532,
    fromToken: 'ETH',
    toToken: 'ETH',
    minAmount: '0.001',
    maxAmount: '1.0',
    enabled: true,
  },
  {
    id: 'ETH_SEPOLIA_TO_ARBITRUM',
    fromChain: 11155111,
    toChain: 421614,
    fromToken: 'ETH',
    toToken: 'ETH',
    minAmount: '0.001',
    maxAmount: '1.0',
    enabled: true,
  },
  {
    id: 'ETH_SEPOLIA_TO_OPTIMISM',
    fromChain: 11155111,
    toChain: 11155420,
    fromToken: 'ETH',
    toToken: 'ETH',
    minAmount: '0.001',
    maxAmount: '1.0',
    enabled: true,
  },

  // WETH pairs from Sepolia
  {
    id: 'WETH_SEPOLIA_TO_BASE',
    fromChain: 11155111,
    toChain: 84532,
    fromToken: 'WETH',
    toToken: 'WETH',
    minAmount: '0.001',
    maxAmount: '1.0',
    enabled: true,
  },

  // USDC pairs from Sepolia
  {
    id: 'USDC_SEPOLIA_TO_BASE',
    fromChain: 11155111,
    toChain: 84532,
    fromToken: 'USDC',
    toToken: 'USDC',
    minAmount: '1',
    maxAmount: '1000',
    enabled: true,
  },
  {
    id: 'USDC_SEPOLIA_TO_ARBITRUM',
    fromChain: 11155111,
    toChain: 421614,
    fromToken: 'USDC',
    toToken: 'USDC',
    minAmount: '1',
    maxAmount: '1000',
    enabled: true,
  },
  {
    id: 'USDC_SEPOLIA_TO_OPTIMISM',
    fromChain: 11155111,
    toChain: 11155420,
    fromToken: 'USDC',
    toToken: 'USDC',
    minAmount: '1',
    maxAmount: '1000',
    enabled: true,
  },
  {
    id: 'USDC_SEPOLIA_TO_BNB',
    fromChain: 11155111,
    toChain: 56,
    fromToken: 'USDC',
    toToken: 'USDC',
    minAmount: '1',
    maxAmount: '1000',
    enabled: false,
  },

  // Reverse pairs from Base
  {
    id: 'ETH_BASE_TO_SEPOLIA',
    fromChain: 84532,
    toChain: 11155111,
    fromToken: 'ETH',
    toToken: 'ETH',
    minAmount: '0.001',
    maxAmount: '1.0',
    enabled: true,
  },
  {
    id: 'USDC_BASE_TO_SEPOLIA',
    fromChain: 84532,
    toChain: 11155111,
    fromToken: 'USDC',
    toToken: 'USDC',
    minAmount: '1',
    maxAmount: '1000',
    enabled: true,
  },
]

// Helper functions
export function getToken(symbol: string, chainId: number): Token {
  const token = TOKENS.find((t) => t.symbol === symbol && t.chainId === chainId)
  if (!token) {
    throw new Error(`Token ${symbol} not found on chain ${chainId}`)
  }
  return token
}

export function getTokenAddress(symbol: string, chainId: number): string {
  return getToken(symbol, chainId).address
}

export function getTokenDecimals(symbol: string, chainId: number): number {
  return getToken(symbol, chainId).decimals
}

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

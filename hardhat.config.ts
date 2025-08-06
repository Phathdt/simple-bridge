import '@nomicfoundation/hardhat-toolbox';

import * as dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';

dotenv.config()

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    sepolia: {
      url: 'https://ethereum-sepolia-rpc.publicnode.com',
      // url: 'https://eth-sepolia.public.blastapi.io',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111
    },
    baseSepolia: {
      url: 'https://base-sepolia-rpc.publicnode.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532
    },
    arbitrumSepolia: {
      url: 'https://arbitrum-sepolia-rpc.publicnode.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 421614
    },
    optimismSepolia: {
      url: 'https://optimism-sepolia-rpc.publicnode.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155420
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainId=84532",
          browserURL: "https://sepolia.basescan.org"
        }
      },
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainId=421614",
          browserURL: "https://sepolia.arbiscan.io"
        }
      },
      {
        network: "optimismSepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainId=11155420",
          browserURL: "https://sepolia-optimism.etherscan.io"
        }
      }
    ]
  },
  sourcify: {
    enabled: true,
  },
}

export default config

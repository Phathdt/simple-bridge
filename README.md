# SimpleBridge

A simple cross-chain bridge contract compatible with Across Protocol, enabling seamless token transfers between different blockchain networks.

## Overview

SimpleBridge is a smart contract that facilitates cross-chain token transfers using a relay-based system. It supports multiple networks and tokens, providing a secure and efficient way to bridge assets between different blockchains.

## Features

- **Multi-Network Support**: Deploy on multiple testnets and mainnets
- **Token Compatibility**: Support for ETH, WETH, and USDC across chains
- **Across Protocol Compatible**: Follows the same interface and event structure as Across Protocol
- **Security Features**: Reentrancy protection, access control, and deposit limits
- **Flexible Routing**: Configurable deposit routes and limits per token pair
- **Relay System**: Support for both fast and slow relay fills

## Supported Networks

The bridge currently supports the following networks:

- **Ethereum Sepolia** (Chain ID: 11155111)
- **Base Sepolia** (Chain ID: 84532)
- **Arbitrum Sepolia** (Chain ID: 421614)
- **Optimism Sepolia** (Chain ID: 11155420)

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- Yarn package manager
- Hardhat development environment

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd simple-bridge

# Install dependencies
yarn install

# Compile contracts
yarn compile
```

### Deployment

Deploy to a specific network:

```bash
# Deploy to Sepolia testnet
yarn deploy:sepolia

# Deploy to Base Sepolia testnet
npx hardhat run scripts/deploy.ts --network base-sepolia

# Deploy to local network for testing
yarn deploy:local
```

### Testing

```bash
# Run all tests
yarn test

# Run tests with gas reporting
yarn test:gas

# Run tests with coverage
yarn test:coverage
```

### Verification

Verify contracts on block explorers:

```bash
# Verify on Sepolia
yarn verify:sepolia
```

## Contract Interaction

### Deposit Tokens

```typescript
// Example: Deposit ETH from Sepolia to Base Sepolia
const bridge = await ethers.getContractAt("SimpleBridge", bridgeAddress);
await bridge.deposit(
  ethers.ZeroAddress, // ETH address
  ethers.ZeroAddress, // ETH on destination
  1000000000000000000n, // 1 ETH in wei
  84532, // Base Sepolia chain ID
  recipientAddress,
  0, // quoteTimestamp
  0, // fillDeadline
  0, // exclusivityDeadline
  ethers.ZeroAddress, // exclusiveRelayer
  "0x" // message
);
```

### Fill Relay

```typescript
// Example: Fill a relay on destination chain
const relayData = {
  depositor: depositorAddress,
  recipient: recipientAddress,
  exclusiveRelayer: ethers.ZeroAddress,
  // ... other relay data
};

await bridge.fillRelay(relayData, relayExecutionInfo);
```

## Scripts

- `yarn compile` - Compile smart contracts
- `yarn test` - Run test suite
- `yarn test:gas` - Run tests with gas reporting
- `yarn test:coverage` - Run tests with coverage
- `yarn deploy:sepolia` - Deploy to Sepolia testnet
- `yarn deploy:local` - Deploy to local network
- `yarn verify:sepolia` - Verify contract on Sepolia
- `yarn update-readme` - Update README with latest deployments

## Deployments

| Network | Chain ID | Contract Address |
|---------|----------|------------------|
| base-sepolia | 84532 | [0xC896339ba282f1ac3EDDAa0dE91440Ee444CdaC3](https://sepolia.basescan.org/address/0xC896339ba282f1ac3EDDAa0dE91440Ee444CdaC3) |
| sepolia | 11155111 | [0x203555F3637bC17ad1d067924893f5Bb40f3C95B](https://sepolia.etherscan.io/address/0x203555F3637bC17ad1d067924893f5Bb40f3C95B) |

## Architecture

The SimpleBridge contract implements:

- **Deposit System**: Users can deposit tokens for cross-chain transfer
- **Relay System**: Relayers can fill deposits on destination chains
- **Route Management**: Admin can enable/disable deposit routes
- **Limit Management**: Configurable min/max deposit amounts
- **Security**: Reentrancy protection and access controls

## Security

- ReentrancyGuard protection against reentrancy attacks
- Ownable access control for administrative functions
- SafeERC20 for secure token transfers
- Configurable deposit limits and route restrictions

## License

MIT License - see LICENSE file for details.

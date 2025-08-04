# Cross-Chain Bridge Implementation Guide
## Tổng quan

Tài liệu này hướng dẫn xây dựng một cross-chain bridge đơn giản tương tự Across Protocol, cho phép users chuyển tiền giữa các blockchain khác nhau (Sepolia ↔ Base Sepolia).

### Kiến trúc hệ thống

```
┌─────────────┐    deposit    ┌──────────────────┐    watch     ┌─────────────┐
│   User      │ ─────────────→ │  Sepolia         │ ────────────→ │   Worker    │
│   Sepolia   │               │  Contract        │              │   Service   │
└─────────────┘               └──────────────────┘              └─────────────┘
                                                                       │
                                                                    fill │
                                                                       ▼
┌─────────────┐   receive     ┌──────────────────┐              ┌─────────────┐
│   User      │ ◄──────────── │  Base Sepolia    │ ◄──────────── │   Worker    │
│ Base Sepolia│               │  Contract        │              │   Service   │
└─────────────┘               └──────────────────┘              └─────────────┘
```

## Phase 1: Smart Contract Implementation

### 1.1 Contract Architecture

Tạo contract đơn giản nhưng tương thích với Across ABI:

```solidity
// SimpleBridge.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SimpleBridge {
    address public owner;
    address public immutable weth;
    uint32 public numberOfDeposits;

    // State mappings
    mapping(uint256 => mapping(address => mapping(address => bool))) public enabledRoutes;
    mapping(bytes32 => bool) public filledRelays;
    mapping(uint256 => mapping(address => mapping(address => uint256))) public minDeposit;
    mapping(uint256 => mapping(address => mapping(address => uint256))) public maxDeposit;

    // Events - EXACT same như Across Protocol
    event V3FundsDeposited(
        address indexed inputToken,
        address indexed outputToken,
        uint256 indexed inputAmount,
        uint256 outputAmount,
        uint256 indexed destinationChainId,
        uint32 indexed depositId,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityParameter,
        address indexed depositor,
        address recipient,
        address exclusiveRelayer,
        bytes message
    );

    event FilledV3Relay(
        address indexed inputToken,
        address indexed outputToken,
        uint256 indexed inputAmount,
        uint256 outputAmount,
        uint256 repaymentChainId,
        uint256 indexed originChainId,
        uint32 indexed depositId,
        uint32 fillDeadline,
        uint32 exclusivityParameter,
        address indexed relayer,
        address depositor,
        address recipient,
        address exclusiveRelayer,
        bytes message
    );

    struct V3RelayData {
        address depositor;
        address recipient;
        address inputToken;
        address outputToken;
        uint256 inputAmount;
        uint256 outputAmount;
        uint256 originChainId;
        uint32 depositId;
        uint32 fillDeadline;
        uint32 exclusivityParameter;
        address exclusiveRelayer;
        bytes message;
    }

    constructor(address _weth) {
        owner = msg.sender;
        weth = _weth;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // Main deposit function - Compatible với Across
    function depositV3(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        address exclusiveRelayer,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityParameter,
        bytes calldata message
    ) external payable {
        // Validations
        require(enabledRoutes[destinationChainId][inputToken][outputToken], "Route disabled");
        require(inputAmount > 0 && outputAmount > 0, "Invalid amounts");
        require(fillDeadline > block.timestamp, "Invalid deadline");
        require(recipient != address(0), "Invalid recipient");

        // Check deposit limits
        if (minDeposit[destinationChainId][inputToken][outputToken] > 0) {
            require(inputAmount >= minDeposit[destinationChainId][inputToken][outputToken], "Below minimum");
        }
        if (maxDeposit[destinationChainId][inputToken][outputToken] > 0) {
            require(inputAmount <= maxDeposit[destinationChainId][inputToken][outputToken], "Above maximum");
        }

        // Handle ETH/WETH deposits
        if (inputToken == weth && msg.value > 0) {
            require(msg.value == inputAmount, "ETH amount mismatch");
            IWETH(weth).deposit{value: msg.value}();
        } else {
            require(msg.value == 0, "Unexpected ETH");
            // Note: In production, would do IERC20(inputToken).transferFrom(depositor, address(this), inputAmount)
        }

        uint32 depositId = numberOfDeposits++;

        // Emit event for worker to detect
        emit V3FundsDeposited(
            inputToken,
            outputToken,
            inputAmount,
            outputAmount,
            destinationChainId,
            depositId,
            quoteTimestamp,
            fillDeadline,
            exclusivityParameter,
            depositor,
            recipient,
            exclusiveRelayer,
            message
        );
    }

    // Fill relay function - Chuyển tiền cho user
    function fillV3Relay(
        V3RelayData calldata relayData,
        uint256 repaymentChainId
    ) external {
        // Validations
        bytes32 relayHash = keccak256(abi.encode(relayData));
        require(!filledRelays[relayHash], "Already filled");
        require(block.timestamp <= relayData.fillDeadline, "Expired");

        // Check exclusivity period
        if (relayData.exclusivityParameter > block.timestamp) {
            require(
                relayData.exclusiveRelayer == address(0) ||
                relayData.exclusiveRelayer == msg.sender,
                "Not exclusive relayer"
            );
        }

        // Mark as filled
        filledRelays[relayHash] = true;

        // Transfer tokens to recipient - CORE LOGIC
        if (relayData.outputToken == weth) {
            // Handle WETH/ETH
            if (_isContract(relayData.recipient)) {
                // Send WETH to contract
                IWETH(weth).transfer(relayData.recipient, relayData.outputAmount);
            } else {
                // Unwrap and send ETH to EOA
                IWETH(weth).withdraw(relayData.outputAmount);
                payable(relayData.recipient).transfer(relayData.outputAmount);
            }
        } else {
            // Handle other ERC20 tokens
            // IERC20(relayData.outputToken).transfer(relayData.recipient, relayData.outputAmount);
        }

        // Handle cross-chain message (if any)
        if (relayData.message.length > 0 && _isContract(relayData.recipient)) {
            (bool success,) = relayData.recipient.call(relayData.message);
            // Don't revert if message call fails
        }

        // Emit fill event
        emit FilledV3Relay(
            relayData.inputToken,
            relayData.outputToken,
            relayData.inputAmount,
            relayData.outputAmount,
            repaymentChainId,
            relayData.originChainId,
            relayData.depositId,
            relayData.fillDeadline,
            relayData.exclusivityParameter,
            msg.sender,
            relayData.depositor,
            relayData.recipient,
            relayData.exclusiveRelayer,
            relayData.message
        );
    }

    // Admin functions
    function enableRoute(
        uint256 destinationChainId,
        address inputToken,
        address outputToken,
        bool enabled
    ) external onlyOwner {
        enabledRoutes[destinationChainId][inputToken][outputToken] = enabled;
    }

    function setDepositLimits(
        uint256 destinationChainId,
        address inputToken,
        address outputToken,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyOwner {
        minDeposit[destinationChainId][inputToken][outputToken] = minAmount;
        maxDeposit[destinationChainId][inputToken][outputToken] = maxAmount;
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner).transfer(amount);
        } else {
            IWETH(token).transfer(owner, amount);
        }
    }

    function fundContract() external payable onlyOwner {
        if (msg.value > 0) {
            IWETH(weth).deposit{value: msg.value}();
        }
    }

    // Helper functions
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }

    // View functions
    function getRelayHash(V3RelayData calldata relayData) external pure returns (bytes32) {
        return keccak256(abi.encode(relayData));
    }

    function isRelayFilled(V3RelayData calldata relayData) external view returns (bool) {
        return filledRelays[keccak256(abi.encode(relayData))];
    }

    receive() external payable {
        if (msg.sender != weth) {
            IWETH(weth).deposit{value: msg.value}();
        }
    }
}
```

### 1.2 Deployment Configuration

```javascript
// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
      chainId: 11155111
    },
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 84532
    }
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY,
      baseSepolia: process.env.BASESCAN_API_KEY
    }
  }
};
```

### 1.3 Deployment Script

```javascript
// scripts/deploy.js
const { ethers } = require("hardhat");
const fs = require('fs');

const WETH_ADDRESSES = {
  11155111: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia
  84532: "0x4200000000000000000000000000000000000006"   // Base Sepolia
};

const NETWORK_NAMES = {
  11155111: "sepolia",
  84532: "base-sepolia"
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = parseInt(await deployer.getChainId());
  const networkName = NETWORK_NAMES[chainId];
  const wethAddress = WETH_ADDRESSES[chainId];

  console.log(`🚀 Deploying on ${networkName} (${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH`);

  // Deploy SimpleBridge
  console.log("\n📦 Deploying SimpleBridge...");
  const SimpleBridge = await ethers.getContractFactory("SimpleBridge");
  const bridge = await SimpleBridge.deploy(wethAddress);
  await bridge.deployed();

  console.log(`✅ SimpleBridge deployed: ${bridge.address}`);

  // Setup initial routes
  console.log("\n⚙️ Setting up routes...");
  const otherChainId = chainId === 11155111 ? 84532 : 11155111;
  const otherWeth = WETH_ADDRESSES[otherChainId];

  await bridge.enableRoute(otherChainId, wethAddress, otherWeth, true);

  // Set deposit limits: 0.001 - 1 ETH
  await bridge.setDepositLimits(
    otherChainId,
    wethAddress,
    otherWeth,
    ethers.utils.parseEther("0.001"), // min
    ethers.utils.parseEther("1.0")    // max
  );

  console.log(`✅ Route enabled to chain ${otherChainId}`);

  // Fund contract
  console.log("\n💰 Funding contract...");
  const fundAmount = ethers.utils.parseEther("0.5"); // 0.5 ETH
  await bridge.fundContract({ value: fundAmount });
  console.log(`✅ Contract funded with ${ethers.utils.formatEther(fundAmount)} ETH`);

  // Save deployment info
  const deploymentData = {
    chainId: chainId,
    network: networkName,
    contractAddress: bridge.address,
    wethAddress: wethAddress,
    deployer: deployer.address,
    deploymentTx: bridge.deployTransaction.hash,
    timestamp: new Date().toISOString()
  };

  const filename = `deployments/${networkName}.json`;
  fs.mkdirSync('deployments', { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(deploymentData, null, 2));

  console.log("\n📋 Deployment Summary:");
  console.log("======================");
  console.log(`Network: ${networkName}`);
  console.log(`Contract: ${bridge.address}`);
  console.log(`WETH: ${wethAddress}`);
  console.log(`TX: ${bridge.deployTransaction.hash}`);
  console.log(`File: ${filename}`);

  // Verify contract
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\n🔍 Verifying contract...");
    try {
      await hre.run("verify:verify", {
        address: bridge.address,
        constructorArguments: [wethAddress],
      });
      console.log("✅ Contract verified");
    } catch (error) {
      console.log("❌ Verification failed:", error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

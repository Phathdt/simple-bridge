import fs from 'fs';
import { ethers, network } from 'hardhat';

import { NETWORK_NAMES, WETH_ADDRESSES } from './constants';

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number(network.config.chainId);
  const networkName = NETWORK_NAMES[chainId];
  const wethAddress = WETH_ADDRESSES[chainId];

  if (!networkName || !wethAddress) {
    throw new Error(`Unsupported network with chainId: ${chainId}`);
  }

  console.log(`🚀 Deploying on ${networkName} (${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  const SimpleBridge = await ethers.getContractFactory("SimpleBridge");
  const bridge = await SimpleBridge.deploy(wethAddress);

  await bridge.waitForDeployment();

  const bridgeAddress = await bridge.getAddress();
  console.log(`✅ SimpleBridge deployed: ${bridgeAddress}`);

  const deploymentData = {
    chainId: chainId,
    network: networkName,
    contractAddress: bridgeAddress,
    wethAddress: wethAddress,
    deployer: deployer.address,
    deploymentTx: bridge.deploymentTransaction()?.hash,
    timestamp: new Date().toISOString()
  };

  const filename = `deployments/${networkName}.json`;
  if (!fs.existsSync('deployments')) {
    fs.mkdirSync('deployments', { recursive: true });
  }
  fs.writeFileSync(filename, JSON.stringify(deploymentData, null, 2));

  console.log("\n📋 Deployment Summary:");
  console.log("======================");
  console.log(`Network: ${networkName}`);
  console.log(`Contract: ${bridgeAddress}`);
  console.log(`WETH: ${wethAddress}`);
  console.log(`TX: ${bridge.deploymentTransaction()?.hash}`);
  console.log(`File: ${filename}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

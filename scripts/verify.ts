import * as dotenv from 'dotenv';
import fs from 'fs';
import { run, network } from 'hardhat';
import { NETWORK_NAMES, WETH_ADDRESSES } from './constants';

dotenv.config()

async function main() {
  const chainId = Number(network.config.chainId);
  const networkName = NETWORK_NAMES[chainId];
  const wethAddress = WETH_ADDRESSES[chainId];

  if (!networkName || !wethAddress) {
    throw new Error(`Unsupported network with chainId: ${chainId}`);
  }

  // Try to read deployment file first
  const deploymentFile = `deployments/${networkName}.json`;
  let contractAddress = process.env.CONTRACT_ADDRESS;
  let constructorArgs = process.env.CONSTRUCTOR_ARGS
    ? JSON.parse(process.env.CONSTRUCTOR_ARGS)
    : [];

  if (fs.existsSync(deploymentFile)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    contractAddress = deployment.contractAddress;
    constructorArgs = [deployment.wethAddress];
    console.log(`📄 Using deployment file: ${deploymentFile}`);
  }

  if (!contractAddress) {
    throw new Error(`Contract address not found. Deploy first or set CONTRACT_ADDRESS in .env file`);
  }

  console.log(`🔍 Verifying contract on ${networkName}...`);
  console.log(`Contract: ${contractAddress}`);
  console.log(`Constructor args: ${JSON.stringify(constructorArgs)}`);
  
  let retries = 3
  while (retries > 0) {
    try {
      await run('verify:verify', {
        address: contractAddress,
        constructorArguments: constructorArgs,
      })
      console.log('Contract verified successfully!')
      return
    } catch (error: any) {
      if (error.message?.includes('Already Verified')) {
        console.log('Contract is already verified!')
        return
      }
      
      retries--
      console.log(`Verification failed, ${retries} retries left...`)
      
      if (retries === 0) {
        console.error('Error verifying contract:', error.message || error)
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

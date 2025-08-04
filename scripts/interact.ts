import fs from 'fs';
import { ethers, network } from 'hardhat';

import {
    getTokenAddress, getTokenDecimals, NETWORK_NAMES, Pair, PAIRS, Token, TOKENS
} from './constants';

async function main() {
  const [signer] = await ethers.getSigners()
  const chainId = Number(network.config.chainId)
  const networkName = NETWORK_NAMES[chainId]

  if (!networkName) {
    throw new Error(`Unsupported network with chainId: ${chainId}`)
  }

  console.log(`🔗 Configuring SimpleBridge on ${networkName} (${chainId})`)
  console.log(`Signer: ${signer.address}`)

  // Load deployment
  const deploymentFile = `deployments/${networkName}.json`
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(
      `Deployment file not found: ${deploymentFile}. Deploy first.`
    )
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))
  const bridge = await ethers.getContractAt(
    'SimpleBridge',
    deployment.contractAddress
  )

  console.log(`Contract: ${deployment.contractAddress}`)
  console.log(
    `Balance: ${ethers.formatEther(
      await ethers.provider.getBalance(signer.address)
    )} ETH`
  )

  // Use configurations from constants
  const tokens = TOKENS
  const pairs = PAIRS

  // Get action from environment variable or default to setup
  const action = process.env.ACTION || 'setup'

  try {
    switch (action) {
      case 'setup':
        await setupRoutes(bridge, chainId, pairs)
        break
      case 'status':
        await checkStatus(bridge, chainId, tokens, pairs)
        break
      default:
        console.log(
          'Usage: ACTION=<action> npx hardhat run scripts/interact.ts --network <network>'
        )
        console.log('Actions: setup (default), status, deposit')
    }
  } catch (error: any) {
    console.error('❌ Interaction failed:', error.message)
    throw error
  }
}

async function setupRoutes(
  bridge: any,
  chainId: number,
  pairs: Pair[]
) {
  console.log('\n🛠️  Configuring routes and limits...')

  // Filter pairs for current chain
  const relevantPairs = pairs.filter(
    (pair) => pair.fromChain === chainId && pair.enabled
  )

  if (relevantPairs.length === 0) {
    console.log(`No enabled pairs found for chain ${chainId}`)
    return
  }

  console.log(`Found ${relevantPairs.length} pairs to configure:`)
  relevantPairs.forEach((pair) => {
    console.log(
      `  - ${pair.id}: ${pair.fromToken} -> ${pair.toToken} (${pair.fromChain} -> ${pair.toChain})`
    )
  })

  for (const pair of relevantPairs) {
    console.log(`\n📍 Checking ${pair.id}...`)

    try {
      // Get token addresses
      const inputToken = getTokenAddress(pair.fromToken, pair.fromChain)
      const outputToken = getTokenAddress(pair.toToken, pair.toChain)

      console.log(`  Input: ${pair.fromToken} (${inputToken})`)
      console.log(`  Output: ${pair.toToken} (${outputToken})`)

      // Check current state
      const currentEnabled = await bridge.enabledRoutes(
        pair.toChain,
        inputToken,
        outputToken
      )
      const currentMinDeposit = await bridge.minDeposit(
        pair.toChain,
        inputToken,
        outputToken
      )
      const currentMaxDeposit = await bridge.maxDeposit(
        pair.toChain,
        inputToken,
        outputToken
      )

      const fromDecimals = getTokenDecimals(pair.fromToken, pair.fromChain)
      const expectedMinAmount = ethers.parseUnits(pair.minAmount, fromDecimals)
      const expectedMaxAmount = ethers.parseUnits(pair.maxAmount, fromDecimals)

      let needsUpdate = false

      // Check if route needs to be enabled/disabled
      if (!currentEnabled && pair.enabled) {
        console.log(`  🔄 Enabling route...`)
        const enableTx = await bridge.enableRoute(
          pair.toChain,
          inputToken,
          outputToken,
          true
        )
        await enableTx.wait()
        console.log(`  ✅ Route enabled: ${enableTx.hash}`)
        needsUpdate = true
      } else if (currentEnabled && !pair.enabled) {
        console.log(`  🔄 Disabling route...`)
        const disableTx = await bridge.enableRoute(
          pair.toChain,
          inputToken,
          outputToken,
          false
        )
        await disableTx.wait()
        console.log(`  ✅ Route disabled: ${disableTx.hash}`)
        needsUpdate = true
      } else {
        console.log(
          `  ✓ Route already ${pair.enabled ? 'enabled' : 'disabled'}`
        )
      }

      // Check if limits need updating (only if route is enabled)
      if (pair.enabled && (currentEnabled || needsUpdate)) {
        const minMatches = currentMinDeposit === expectedMinAmount
        const maxMatches = currentMaxDeposit === expectedMaxAmount

        if (!minMatches || !maxMatches) {
          console.log(`  🔄 Updating deposit limits...`)
          console.log(
            `    Current Min: ${ethers.formatUnits(
              currentMinDeposit,
              fromDecimals
            )} ${pair.fromToken}`
          )
          console.log(`    Expected Min: ${pair.minAmount} ${pair.fromToken}`)
          console.log(
            `    Current Max: ${ethers.formatUnits(
              currentMaxDeposit,
              fromDecimals
            )} ${pair.fromToken}`
          )
          console.log(`    Expected Max: ${pair.maxAmount} ${pair.fromToken}`)

          const limitsTx = await bridge.setDepositLimits(
            pair.toChain,
            inputToken,
            outputToken,
            expectedMinAmount,
            expectedMaxAmount
          )
          await limitsTx.wait()
          console.log(`  ✅ Limits updated: ${limitsTx.hash}`)
          needsUpdate = true
        } else {
          console.log(`  ✓ Limits already correct`)
          console.log(`    Min: ${pair.minAmount} ${pair.fromToken}`)
          console.log(`    Max: ${pair.maxAmount} ${pair.fromToken}`)
        }
      }

      if (!needsUpdate) {
        console.log(`  ✓ No changes needed for ${pair.id}`)
      }

      // Rate limiting only if we made changes
      if (needsUpdate) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    } catch (error: any) {
      console.error(`  ❌ Failed to configure ${pair.id}: ${error.message}`)
    }
  }

  console.log('\n✅ Configuration complete!')
}

async function checkStatus(
  bridge: any,
  chainId: number,
  tokens: Token[],
  pairs: Pair[]
) {
  console.log('\n📊 Contract Status:')

  const owner = await bridge.owner()
  const weth = await bridge.weth()
  const deposits = await bridge.numberOfDeposits()

  console.log(`Owner: ${owner}`)
  console.log(`WETH: ${weth}`)
  console.log(`Total Deposits: ${deposits}`)

  // Check routes for current chain
  const relevantPairs = pairs.filter((pair) => pair.fromChain === chainId)

  console.log('\n🛣️  Route Status:')
  for (const pair of relevantPairs) {
    try {
      const inputToken = getTokenAddress(pair.fromToken, pair.fromChain)
      const outputToken = getTokenAddress(pair.toToken, pair.toChain)

      const enabled = await bridge.enabledRoutes(
        pair.toChain,
        inputToken,
        outputToken
      )
      const minDeposit = await bridge.minDeposit(
        pair.toChain,
        inputToken,
        outputToken
      )
      const maxDeposit = await bridge.maxDeposit(
        pair.toChain,
        inputToken,
        outputToken
      )

      console.log(`${pair.id}: ${enabled ? '✅' : '❌'}`)
      if (enabled) {
        const decimals = getTokenDecimals(pair.fromToken, pair.fromChain)
        console.log(
          `  Min: ${ethers.formatUnits(minDeposit, decimals)} ${pair.fromToken}`
        )
        console.log(
          `  Max: ${ethers.formatUnits(maxDeposit, decimals)} ${pair.fromToken}`
        )
      }
    } catch (error: any) {
      console.log(`${pair.id}: ❌ Error - ${error.message}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

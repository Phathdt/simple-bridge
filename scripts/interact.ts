import fs from 'fs';
import { ethers, network } from 'hardhat';

import {
    getTokenAddress, getTokenDecimals, NETWORK_NAMES, Pair, PAIRS, Token, TOKENS
} from './constants';

// Helper function to get gas configuration
async function getGasConfig(gasEstimate: bigint) {
  const feeData = await ethers.provider.getFeeData()

  // Check for manual gas price override
  const manualGasPrice = process.env.MANUAL_GAS_PRICE

  // Increase gas limit buffer to 50% for safety
  const gasLimit = (gasEstimate * 150n) / 100n // Add 50% buffer

  // Determine if network supports EIP-1559
  const supportsEIP1559 = feeData.maxFeePerGas && feeData.maxPriorityFeePerGas

  console.log(`    🔧 Gas config: EIP-1559=${supportsEIP1559}, Manual price=${manualGasPrice || 'auto'}`)

  if (supportsEIP1559) {
    // Use EIP-1559 fee structure
    let maxFeePerGas = feeData.maxFeePerGas!
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas!

    // Check if network gas prices are too low and use fallback
    const minGasPrice = ethers.parseUnits('1', 'gwei') // 1 gwei minimum
    if (maxFeePerGas < minGasPrice) {
      console.log(`    ⚠️  Network gas price too low, using fallback values`)
      maxFeePerGas = ethers.parseUnits('20', 'gwei') // 20 gwei fallback
      maxPriorityFeePerGas = ethers.parseUnits('5', 'gwei') // 5 gwei fallback
    } else if (manualGasPrice) {
      // Use manual gas price in gwei
      const manualGasPriceWei = ethers.parseUnits(manualGasPrice, 'gwei')
      maxFeePerGas = manualGasPriceWei
      maxPriorityFeePerGas = manualGasPriceWei / 4n // Set priority fee to 25% of max fee
    } else {
      // Use higher gas price to ensure transaction gets through
      // First set priority fee, then ensure max fee is higher
      maxPriorityFeePerGas = maxPriorityFeePerGas * 3n
      maxFeePerGas = maxFeePerGas * 2n

      // Ensure maxFeePerGas is always >= maxPriorityFeePerGas with buffer
      if (maxFeePerGas <= maxPriorityFeePerGas) {
        maxFeePerGas = maxPriorityFeePerGas + (maxPriorityFeePerGas / 2n) // Add 50% buffer
      }
    }

    // Validate EIP-1559 gas configuration
    if (maxFeePerGas < maxPriorityFeePerGas) {
      throw new Error(`Invalid EIP-1559 gas configuration: maxFeePerGas (${maxFeePerGas}) < maxPriorityFeePerGas (${maxPriorityFeePerGas})`)
    }

    return {
      gasLimit: gasLimit,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas
    }
  } else {
    // Use legacy gas price
    let gasPrice = feeData.gasPrice || 0n

    if (manualGasPrice) {
      // Use manual gas price in gwei
      gasPrice = ethers.parseUnits(manualGasPrice, 'gwei')
    } else {
      // Use higher gas price to ensure transaction gets through
      gasPrice = gasPrice * 2n
    }

    return {
      gasLimit: gasLimit,
      gasPrice: gasPrice
    }
  }
}

// Helper function to wait for transaction with timeout
async function waitForTransaction(tx: any, timeoutMs: number = 60000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Transaction timeout')), timeoutMs)
  )

  try {
    console.log(`Waiting for transaction ${tx.hash} to be mined...`)
    const receipt = await Promise.race([tx.wait(), timeout])
    console.log(`Transaction ${tx.hash} confirmed in block ${receipt.blockNumber}`)
    return receipt
  } catch (error) {
    console.error(`Transaction ${tx.hash} failed or timed out: ${error}`)

    // Try to get transaction status
    try {
      const txStatus = await ethers.provider.getTransaction(tx.hash)
      if (txStatus) {
        console.log(`Transaction found in mempool but not confirmed`)
      } else {
        console.log(`Transaction not found in mempool - may not have been broadcasted`)
      }
    } catch (statusError) {
      console.log(`Could not check transaction status: ${statusError}`)
    }

    throw error
  }
}

// Helper function to retry transaction with exponential backoff
async function retryTransaction<T>(
  transactionFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await transactionFn()

      // For transactions, ensure they are broadcasted
      if (result && typeof result === 'object' && 'hash' in result) {
        console.log(`Transaction broadcasted with hash: ${result.hash}`)

        // Wait a moment and check if transaction is in mempool
        await new Promise(resolve => setTimeout(resolve, 2000))
        try {
          const txStatus = await ethers.provider.getTransaction(result.hash as string)
          if (txStatus) {
            console.log(`Transaction confirmed in mempool`)
          } else {
            console.log(`Warning: Transaction not found in mempool after 2 seconds`)
          }
        } catch (statusError: any) {
          console.log(`Could not verify transaction broadcast: ${statusError}`)
        }
      }

      return result
    } catch (error: any) {
      lastError = error
      console.log(`Attempt ${attempt} failed: ${error.message}`)

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1)
        console.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

async function main() {
  const [signer] = await ethers.getSigners()
  const chainId = Number(network.config.chainId)
  const networkName = NETWORK_NAMES[chainId]

  if (!networkName) {
    throw new Error(`Unsupported network with chainId: ${chainId}`)
  }

  console.log(`🔗 Configuring SimpleBridge on ${networkName} (${chainId})`)
  console.log(`Signer: ${signer.address}`)

  // Log network configuration
  const feeData = await ethers.provider.getFeeData()
  console.log(`Network gas price: ${ethers.formatUnits(feeData.gasPrice || 0, 'gwei')} gwei`)
  console.log(`Network max fee per gas: ${ethers.formatUnits(feeData.maxFeePerGas || 0, 'gwei')} gwei`)
  console.log(`Network max priority fee: ${ethers.formatUnits(feeData.maxPriorityFeePerGas || 0, 'gwei')} gwei`)

  // Show which gas configuration will be used
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    console.log(`📋 Using EIP-1559 gas configuration (maxFeePerGas + maxPriorityFeePerGas)`)
  } else {
    console.log(`📋 Using legacy gas configuration (gasPrice)`)
  }

  // Check for manual gas price override
  const manualGasPrice = process.env.MANUAL_GAS_PRICE
  if (manualGasPrice) {
    console.log(`Using manual gas price: ${manualGasPrice} gwei`)
  } else {
    // Suggest gas price based on network conditions
    const currentGasPrice = ethers.formatUnits(feeData.gasPrice || 0, 'gwei')
    const suggestedGasPrice = parseFloat(currentGasPrice) * 2
    console.log(`Suggested gas price for faster confirmation: ${suggestedGasPrice.toFixed(2)} gwei`)
    console.log(`Set MANUAL_GAS_PRICE=${suggestedGasPrice.toFixed(0)} to use higher gas price`)
  }

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

      // Check current state - UPDATED: Use new mapping name
      const currentEnabled = await bridge.enabledDepositRoutes(
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

      // Check if route needs to be enabled/disabled - UPDATED: Use new function name
      if (!currentEnabled && pair.enabled) {
        console.log(`  🔄 Enabling route...`)

        // Estimate gas for enable route
        const enableGasEstimate = await bridge.setEnableRoute.estimateGas(
          inputToken,     // originToken
          pair.toChain,   // destinationChainId
          outputToken,    // destinationToken
          true           // enabled
        )

        const enableGasConfig = await getGasConfig(enableGasEstimate)

        console.log(`    Gas estimate: ${enableGasEstimate.toString()}`)
        console.log(`    Gas limit: ${enableGasConfig.gasLimit.toString()}`)

        if ('maxFeePerGas' in enableGasConfig) {
          console.log(`    Max fee per gas: ${ethers.formatUnits(enableGasConfig.maxFeePerGas!, 'gwei')} gwei`)
          console.log(`    Max priority fee: ${ethers.formatUnits(enableGasConfig.maxPriorityFeePerGas!, 'gwei')} gwei`)
        } else {
          console.log(`    Gas price: ${ethers.formatUnits(enableGasConfig.gasPrice!, 'gwei')} gwei`)
        }

        const enableTx = await retryTransaction(async () =>
          bridge.setEnableRoute(
            inputToken,     // originToken
            pair.toChain,   // destinationChainId
            outputToken,    // destinationToken
            true,          // enabled
            enableGasConfig
          )
        )
        const receipt = await retryTransaction(async () => waitForTransaction(enableTx))
        console.log(`  ✅ Route enabled: ${enableTx.hash}`)

        // Listen for the event to confirm
        const event = receipt.logs.find((log: any) =>
          log.topics[0] === ethers.id("EnabledDepositRoute(address,uint256,address,bool)")
        )
        if (event) {
          console.log(`  📡 EnabledDepositRoute event emitted`)
        }

        needsUpdate = true
      } else if (currentEnabled && !pair.enabled) {
        console.log(`  🔄 Disabling route...`)

        // Estimate gas for disable route
        const disableGasEstimate = await bridge.setEnableRoute.estimateGas(
          inputToken,     // originToken
          pair.toChain,   // destinationChainId
          outputToken,    // destinationToken
          false          // enabled
        )

        const disableGasConfig = await getGasConfig(disableGasEstimate)

        console.log(`    Gas estimate: ${disableGasEstimate.toString()}`)
        console.log(`    Gas limit: ${disableGasConfig.gasLimit.toString()}`)

        if ('maxFeePerGas' in disableGasConfig) {
          console.log(`    Max fee per gas: ${ethers.formatUnits(disableGasConfig.maxFeePerGas!, 'gwei')} gwei`)
          console.log(`    Max priority fee: ${ethers.formatUnits(disableGasConfig.maxPriorityFeePerGas!, 'gwei')} gwei`)
        } else {
          console.log(`    Gas price: ${ethers.formatUnits(disableGasConfig.gasPrice!, 'gwei')} gwei`)
        }

        const disableTx = await retryTransaction(async () =>
          bridge.setEnableRoute(
            inputToken,     // originToken
            pair.toChain,   // destinationChainId
            outputToken,    // destinationToken
            false,         // enabled
            disableGasConfig
          )
        )
        const receipt = await retryTransaction(async () => waitForTransaction(disableTx))
        console.log(`  ✅ Route disabled: ${disableTx.hash}`)

        // Listen for the event to confirm
        const event = receipt.logs.find((log: any) =>
          log.topics[0] === ethers.id("EnabledDepositRoute(address,uint256,address,bool)")
        )
        if (event) {
          console.log(`  📡 EnabledDepositRoute event emitted`)
        }

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

          console.log(`    Setting limits...`)

          // Estimate gas and set gas price
          const gasEstimate = await bridge.setDepositLimits.estimateGas(
            pair.toChain,
            inputToken,
            outputToken,
            expectedMinAmount,
            expectedMaxAmount
          )

          const gasConfig = await getGasConfig(gasEstimate)

          console.log(`    Gas estimate: ${gasEstimate.toString()}`)
          console.log(`    Gas limit: ${gasConfig.gasLimit.toString()}`)

          if ('maxFeePerGas' in gasConfig) {
            console.log(`    Max fee per gas: ${ethers.formatUnits(gasConfig.maxFeePerGas!, 'gwei')} gwei`)
            console.log(`    Max priority fee: ${ethers.formatUnits(gasConfig.maxPriorityFeePerGas!, 'gwei')} gwei`)
          } else {
            console.log(`    Gas price: ${ethers.formatUnits(gasConfig.gasPrice!, 'gwei')} gwei`)
          }

          const limitsTx = await retryTransaction(async () =>
            bridge.setDepositLimits(
              pair.toChain,
              inputToken,
              outputToken,
              expectedMinAmount,
              expectedMaxAmount,
              gasConfig
            )
          )
          console.log(`    LimitsTx: ${limitsTx.hash}`)
          const receipt = await retryTransaction(async () => waitForTransaction(limitsTx))
          console.log(`  ✅ Limits updated: ${limitsTx.hash}`)

          // Listen for the event to confirm - NEW EVENT
          const event = receipt.logs.find((log: any) =>
            log.topics[0] === ethers.id("SetDepositLimits(address,uint256,address,uint256,uint256)")
          )
          if (event) {
            console.log(`  📡 SetDepositLimits event emitted`)
          }

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

      // UPDATED: Use new mapping name
      const enabled = await bridge.enabledDepositRoutes(
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

  // NEW: Show recent events
  console.log('\n📡 Recent Events:')
  try {
    // Get EnabledDepositRoute events from last 1000 blocks
    const currentBlock = await ethers.provider.getBlockNumber()
    const fromBlock = Math.max(0, currentBlock - 1000)

    const enableRouteFilter = bridge.filters.EnabledDepositRoute()
    const enableEvents = await bridge.queryFilter(enableRouteFilter, fromBlock)

    console.log(`EnabledDepositRoute events (last 1000 blocks): ${enableEvents.length}`)
    enableEvents.slice(-5).forEach((event: any, index: number) => {
      const args = event.args
      console.log(`  ${index + 1}. Token: ${args.originToken} -> Chain: ${args.destinationChainId} (${args.enabled ? 'Enabled' : 'Disabled'})`)
    })

    const limitFilter = bridge.filters.SetDepositLimits()
    const limitEvents = await bridge.queryFilter(limitFilter, fromBlock)

    console.log(`SetDepositLimits events (last 1000 blocks): ${limitEvents.length}`)
    limitEvents.slice(-5).forEach((event: any, index: number) => {
      const args = event.args
      console.log(`  ${index + 1}. Token: ${args.token} -> Chain: ${args.destinationChainId}`)
    })

  } catch (error: any) {
    console.log(`Error fetching events: ${error.message}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

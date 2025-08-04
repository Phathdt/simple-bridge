// scripts/interact.js
import { ethers } from 'hardhat';

async function main() {
  console.log('Getting the fun token contract...')
  const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
  const funToken = await ethers.getContractAt('FunToken', contractAddress)

  console.log('Querying token name...')
  const name = await funToken.name()
  console.log(`Token Name: ${name}\n`)

  console.log('Querying token symbol...')
  const symbol = await funToken.symbol()
  console.log(`Token Symbol: ${symbol}\n`)

  console.log('Querying token decimals...')
  const decimals = await funToken.decimals()
  console.log(`Token Decimals: ${decimals}\n`)

  console.log('Querying token total supply...')
  const totalSupply = await funToken.totalSupply()
  console.log(
    `Token Total Supply: ${ethers.formatUnits(totalSupply, decimals)}\n`
  )

  console.log(
    `Total Supply in ${symbol}: ${ethers.formatUnits(totalSupply, decimals)}\n`
  )

  console.log('Querying token balance of the contract owner...')
  const accounts = await ethers.getSigners()
  const contractOwner = accounts.slice(0, 2)
  const balance = await funToken.balanceOf(contractOwner[0].address)
  console.log(`Token Balance: ${ethers.formatUnits(balance, decimals)}\n`)

  console.log('Transferring 100 tokens to the contract owner...')
  const amount = ethers.parseUnits('100', decimals)
  const tx = await funToken
    .connect(contractOwner[0])
    .transfer(contractOwner[0].address, amount)
  await tx.wait()
  console.log('Transferred 100 tokens to the contract owner')

  console.log('Querying token balance of the recipient...')
  const recipientBalance = await funToken.balanceOf(contractOwner[1].address)
  console.log(
    `Token Balance: ${ethers.formatUnits(recipientBalance, decimals)}\n`
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

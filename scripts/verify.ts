import * as dotenv from 'dotenv';
import { run } from 'hardhat';

dotenv.config()

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS
  const constructorArgs = process.env.CONSTRUCTOR_ARGS
    ? JSON.parse(process.env.CONSTRUCTOR_ARGS)
    : []

  if (!contractAddress) {
    throw new Error('Please set CONTRACT_ADDRESS in .env file')
  }

  console.log('Verifying contract...')
  
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

import fs from 'fs';
import path from 'path';

import { SCANNER_URLS } from './constants';

interface DeploymentData {
  chainId: number;
  network: string;
  contractAddress: string;
  wethAddress: string;
  deployer: string;
  deploymentTx: string;
  deploymentBlock: number;
  timestamp: string;
}

function updateReadmeTable() {
  const deploymentsDir = path.join(process.cwd(), 'deployments');
  const readmePath = path.join(process.cwd(), 'README.md');

  if (!fs.existsSync(deploymentsDir)) {
    console.log('❌ Deployments directory not found');
    return;
  }

  const deploymentFiles = fs.readdirSync(deploymentsDir)
    .filter(file => file.endsWith('.json'))
    .sort();

  const deployments: DeploymentData[] = [];

  for (const file of deploymentFiles) {
    try {
      const filePath = path.join(deploymentsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const deployment = JSON.parse(content) as DeploymentData;
      deployments.push(deployment);
    } catch (error) {
      console.log(`⚠️  Error reading ${file}:`, error);
    }
  }

  if (deployments.length === 0) {
    console.log('❌ No valid deployment files found');
    return;
  }

  let readmeContent = fs.readFileSync(readmePath, 'utf8');

  const tableStart = readmeContent.indexOf('| Network | Chain ID | Contract Address |');

  if (tableStart === -1) {
    console.log('❌ Deployment table not found in README.md');
    return;
  }

  const beforeTable = readmeContent.substring(0, tableStart);

  const remainingContent = readmeContent.substring(tableStart);
  const tableEnd = remainingContent.indexOf('\n\n');
  const afterTable = tableEnd !== -1 ? remainingContent.substring(tableEnd) : '';

      const tableHeader = '| Network | Chain ID | Contract Address |\n|---------|----------|------------------|';

  const tableRows = deployments
    .sort((a, b) => a.chainId - b.chainId)
    .map(deployment => {
      const scannerUrl = SCANNER_URLS[deployment.chainId];
      const contractLink = scannerUrl ? `[${deployment.contractAddress}](${scannerUrl}/address/${deployment.contractAddress})` : deployment.contractAddress;
      return `| ${deployment.network} | ${deployment.chainId} | ${contractLink} |`;
    })
    .join('\n');

  const newTable = `${tableHeader}\n${tableRows}`;

  const updatedReadme = beforeTable + newTable + afterTable;

  fs.writeFileSync(readmePath, updatedReadme);

  console.log('✅ README.md updated successfully!');
  console.log(`📊 Updated ${deployments.length} deployment(s):`);
  deployments.forEach(deployment => {
    console.log(`   - ${deployment.network} (${deployment.chainId}): ${deployment.contractAddress}`);
  });
}

updateReadmeTable();

import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

import { NETWORK_NAMES, SCANNER_URLS } from '../scripts/constants';

describe('Deployment Workflow', () => {
  it('should have scanner URLs for all supported networks', () => {
    const supportedChainIds = [11155111, 84532, 421614, 11155420];

    supportedChainIds.forEach(chainId => {
      expect(SCANNER_URLS[chainId]).to.exist;
      expect(SCANNER_URLS[chainId]).to.be.a('string');
      expect(SCANNER_URLS[chainId]).to.include('http');
    });
  });

  it('should have network names for all supported networks', () => {
    const supportedChainIds = [11155111, 84532, 421614, 11155420];

    supportedChainIds.forEach(chainId => {
      expect(NETWORK_NAMES[chainId]).to.exist;
      expect(NETWORK_NAMES[chainId]).to.be.a('string');
    });
  });

  it('should have valid deployment files', () => {
    const deploymentsDir = path.join(process.cwd(), 'deployments');

    if (!fs.existsSync(deploymentsDir)) {
      console.log('Deployments directory not found, skipping test');
      return;
    }

    const deploymentFiles = fs.readdirSync(deploymentsDir)
      .filter(file => file.endsWith('.json'));

    deploymentFiles.forEach(file => {
      const filePath = path.join(deploymentsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const deployment = JSON.parse(content);

      expect(deployment.chainId).to.be.a('number');
      expect(deployment.network).to.be.a('string');
      expect(deployment.contractAddress).to.be.a('string');
      expect(deployment.contractAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
      expect(SCANNER_URLS[deployment.chainId]).to.exist;
      expect(NETWORK_NAMES[deployment.chainId]).to.exist;
    });
  });

    it('should have README.md with deployment table', () => {
    const readmePath = path.join(process.cwd(), 'README.md');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');

    expect(readmeContent).to.include('| Network | Chain ID | Contract Address |');
    expect(readmeContent).to.include('|---------|----------|------------------|');
  });
});

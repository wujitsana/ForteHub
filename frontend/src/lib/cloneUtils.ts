import { ConfigurableVariable } from '@/components/workflow/ConfigurableVariablesModal';
import { WorkflowInfo } from '@/types/interfaces';
import { fetchWorkflowFromIPFS } from '@/services/ipfs.service';
import { extractVaultSetupInfo } from '@/lib/deploymentTransaction';
import { generateCloneTransaction } from '@/lib/cloneTransaction';
import type { ComponentProps } from 'react';
import { TransactionButton } from '@onflow/react-sdk';

export type TransactionConfig = ComponentProps<typeof TransactionButton>['transaction'];

export interface ClonePreparationResult {
  vaultSetupInfo: Record<string, string>;
  vaultTypeEntries: { key: string; value: string }[];
  configVariables: Record<string, ConfigurableVariable>;
  transactionBuilder: (overrides: Record<string, ConfigurableVariable>) => TransactionConfig;
}

const vaultTypes: Record<string, string> = {
  FLOW: 'A.7e60df042a9c0868.FlowToken.Vault',
  USDCFlow: 'A.64adf39cbc354fcb.USDCFlow.Vault',
  USDF: 'A.b7ace0a920d2c37d.USDF.Vault',
  USDT: 'A.b19d29f25882ec7c.USDT.Vault',
  stFlow: 'A.d6f80565193ad727.stFlow.Vault',
  ankrFLOW: 'A.1e4aa0b87d10b141.ankrFLOW.Vault',
  MOET: 'A.d27920b6384e2a78.MOET.Vault',
  WETH: 'A.a0b869991a386339.WETH.Vault',
  WBTC: 'A.a0b869991a386339.WBTC.Vault',
  cbBTC: 'A.2db29caf9181ef55.cbBTC.Vault'
};

const toUFix64String = (value: string | undefined): string => {
  if (!value || value.trim().length === 0) {
    return '0.0';
  }
  const normalized = value.trim();
  return normalized.includes('.') ? normalized : `${normalized}.0`;
};

export async function prepareCloneTransaction(
  workflow: WorkflowInfo,
  options?: { sourceCode?: string }
): Promise<ClonePreparationResult> {
  if (workflow.clonesLocked) {
    throw new Error('Cloning for this workflow has been locked by the creator.');
  }

  if (workflow.isListed === false) {
    throw new Error('This workflow has been unlisted by its creator.');
  }

  if ((!workflow.sourceCodeIPFS || workflow.sourceCodeIPFS.trim().length === 0) && !options?.sourceCode) {
    throw new Error('Workflow is missing IPFS source code.');
  }

  const sourceCode = options?.sourceCode ?? await fetchWorkflowFromIPFS(workflow.sourceCodeIPFS!);
  if (!sourceCode || sourceCode.trim().length === 0) {
    throw new Error('Workflow source code could not be fetched from IPFS.');
  }

  const cleanSourceCode = sourceCode
    .split('\n')
    .filter(line =>
      !line.trim().startsWith('// WORKFLOW_NAME:') &&
      !line.trim().startsWith('// WORKFLOW_CATEGORY:') &&
      !line.trim().startsWith('// WORKFLOW_DESCRIPTION:')
    )
    .join('\n');

  const vaultSetupInfo = extractVaultSetupInfo('{}', cleanSourceCode);
  const vaultTypeEntries = Object.entries(vaultSetupInfo).map(([tokenName]) => ({
    key: tokenName,
    value: vaultTypes[tokenName] || `A.0000000000000000.${tokenName}.Vault`
  }));

  // Build default variable map from metadata + config defaults
  const configVariables: Record<string, ConfigurableVariable> = {};
  if (workflow.metadataJSON) {
    try {
      const metadata = JSON.parse(workflow.metadataJSON);
      Object.entries(metadata).forEach(([key, value]) => {
        configVariables[key] = {
          value: String(value),
          type: typeof value === 'number' ? 'number' : 'string',
          label: key.replace(/([A-Z])/g, ' $1').trim()
        };
      });
    } catch (error) {
      console.warn('Failed to parse metadata JSON for workflow defaults:', error);
    }
  }

  if (workflow.configDefaults) {
    Object.entries(workflow.configDefaults).forEach(([key, value]) => {
      configVariables[key] = {
        value: String(value),
        type: typeof value === 'number' ? 'number' : 'string',
        label: key.replace(/([A-Z])/g, ' $1').trim()
      };
    });
  }

  const cadenceCode = generateCloneTransaction(
    workflow.contractName,
    workflow.creator
  );

  const transactionBuilder = (
    overrides: Record<string, ConfigurableVariable>,
    enableScheduling: boolean = false,
    schedulingFrequency: number = 0
  ): TransactionConfig => {
    // Convert all values to strings for Cadence dictionary
    // Cadence will handle the type conversion based on the contract
    const overrideEntries = Object.entries(overrides)
      .filter(([_, variable]) => variable.value !== undefined && variable.value !== null)
      .map(([key, variable]) => ({
        key,
        value: String(variable.value)
      }));

    // Filter out any undefined values from vault setup
    const cleanVaultSetup = Object.entries(vaultSetupInfo)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => ({ key: k, value: String(v) }));

    // Filter out any undefined values from vault types
    const cleanVaultTypes = vaultTypeEntries
      .filter(entry => entry.key && entry.value)
      .map(entry => ({ key: String(entry.key), value: String(entry.value) }));

    console.log('Building transaction with args:', {
      workflowId: workflow.workflowId,
      vaultSetupInfo: cleanVaultSetup,
      vaultTypeEntries: cleanVaultTypes,
      overrideEntries,
      enableScheduling,
      schedulingFrequency
    });

    return {
      cadence: cadenceCode,
      limit: 9999,
      args: (arg, t) => [
        arg(workflow.workflowId.toString(), t.UInt64),
        arg(cleanVaultSetup, t.Dictionary({ key: t.String, value: t.String })),
        arg(cleanVaultTypes, t.Dictionary({ key: t.String, value: t.String })),
        arg(overrideEntries, t.Dictionary({ key: t.String, value: t.String })),
        arg(enableScheduling, t.Bool),
        arg(schedulingFrequency.toFixed(1), t.UFix64)
      ]
    };
  };

  return {
    vaultSetupInfo,
    vaultTypeEntries,
    configVariables,
    transactionBuilder
  };
}

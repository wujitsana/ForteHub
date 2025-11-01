/**
 * Deployment Transaction Generator
 *
 * Generates the unified one-shot deployment transaction that handles:
 * 1. Deploy ForteHubManager contract if it doesn't exist
 * 2. Set up required vaults (FLOW, USDC, custom tokens) if missing
 * 3. Deploy workflow contract code to user's account
 * 4. Register workflow in ForteHubRegistry
 *
 * The centralized ForteHubManager is deployed once per wallet and manages all workflows.
 *
 * SOURCE OF TRUTH: /cadence/contracts/ForteHubManager.cdc
 * Frontend copy: /frontend/src/lib/forteHubManagerCode.ts (for deployment transactions)
 */

import { FORTEHUB_MANAGER_CONTRACT_CODE } from './forteHubManagerCode';

// Re-export for frontend use
export { FORTEHUB_MANAGER_CONTRACT_CODE };

export const DEPLOY_WORKFLOW_TRANSACTION = `
import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHubRegistry from 0xbd4c3996265ed830
import DeFiActionsUtils from 0x2ab6f469ee0dfbb6

transaction(
    contractName: String,
    contractCode: String,
    name: String,
    category: String,
    description: String,
    ipfsCID: String,
    isListed: Bool,
    creator: Address,
    metadataJSON: String,
    vaultSetupInfo: {String: String},
    vaultTypes: {String: String},
    deployManagerCode: Bool,
    managerCode: String,
    capabilities: {String: AnyStruct}
) {
    prepare(signer: auth(AddContract, Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {
        // ===== STEP 1: Deploy ForteHubManager contract if needed (self-initializing) =====
        if deployManagerCode {
            if signer.contracts.get(name: "ForteHubManager") == nil {
                signer.contracts.add(name: "ForteHubManager", code: managerCode.utf8)
                log("ForteHubManager contract deployed and initialized to signer's account")
            } else {
                log("ForteHubManager contract already exists, skipping deployment")
            }
        }

        // ===== STEP 2: Deploy workflow contract code =====
        signer.contracts.add(name: contractName, code: contractCode.utf8)
        log("Contract deployed: ".concat(contractName))

        // ===== STEP 3: Set up required vaults =====
        for tokenName in vaultSetupInfo.keys {
            let vaultPath = vaultSetupInfo[tokenName]!
            let vaultTypeStr = vaultTypes[tokenName] ?? ""
            let storagePath = StoragePath(identifier: vaultPath)
                ?? panic("Invalid storage path: ".concat(vaultPath))

            let vaultExists = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)

            if !vaultExists {
                if tokenName == "FLOW" {
                    let vault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
                    signer.storage.save(<-vault, to: storagePath)
                    log("Created FLOW vault at ".concat(vaultPath))
                } else {
                    let vaultType = CompositeType(vaultTypeStr) ?? panic("Invalid vault type: ".concat(vaultTypeStr))
                    let vault <- DeFiActionsUtils.getEmptyVault(vaultType)
                    signer.storage.save(<-vault, to: storagePath)
                    log("Created ".concat(tokenName).concat(" vault at ").concat(vaultPath))
                }
            } else {
                log("Vault already exists for ".concat(tokenName).concat(" at ").concat(vaultPath))
            }

            let vaultExistsNow = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)
            if vaultExistsNow {
                let cap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(storagePath)
                log("Issued capability for ".concat(tokenName).concat(" at ").concat(vaultPath))
            }
        }
    }

    execute {
        // ===== STEP 4: Register workflow in ForteHubRegistry =====
        let workflowId = ForteHubRegistry.registerWorkflow(
            name: name,
            category: category,
            description: description,
            sourceCodeIPFS: ipfsCID,
            isListed: isListed,
            deploymentType: "wallet",
            creator: creator,
            contractName: contractName,
            metadataJSON: metadataJSON,
            parentWorkflowId: nil,
            capabilities: capabilities
        )

        log("Workflow registered with ID: ".concat(workflowId.toString()))
    }
}
`;

/**
 * Builds transaction arguments for React SDK
 * Includes manager deployment decision and code
 * Manager auto-initializes in its contract init() when deployed
 */
export function buildDeploymentArgs(
  contractName: string,
  contractCode: string,
  name: string,
  category: string,
  description: string,
  ipfsCID: string,
  isListed: boolean,
  creator: string,
  metadataJSON: string,
  vaultSetupInfo: Record<string, string>,  // {"FLOW": "/storage/flowTokenVault", "USDC": "/storage/usdcVault"}
  shouldDeployManager: boolean,  // True if manager doesn't exist yet
  arg: any,
  t: any
) {
  // Validate all string arguments are non-null
  const args = [
    { name: 'contractName', value: contractName },
    { name: 'contractCode', value: contractCode },
    { name: 'name', value: name },
    { name: 'category', value: category },
    { name: 'description', value: description },
    { name: 'ipfsCID', value: ipfsCID },
    { name: 'metadataJSON', value: metadataJSON },
    { name: 'creator', value: creator }
  ];

  for (const { name: argName, value } of args) {
    if (value === null || value === undefined) {
      console.error(`Null/undefined argument: ${argName} = ${value}`);
      throw new Error(`Deployment argument '${argName}' cannot be null or undefined`);
    }
  }

  console.log('buildDeploymentArgs - vaultSetupInfo:', vaultSetupInfo);
  console.log('buildDeploymentArgs - shouldDeployManager:', shouldDeployManager);

  // Build vaultTypes dict with type identifiers for each token
  const vaultTypes: Record<string, string> = {
    'FLOW': 'A.7e60df042a9c0868.FlowToken.Vault',
    'USDCFlow': 'A.64adf39cbc354fcb.USDCFlow.Vault',
    'USDF': 'A.b7ace0a920d2c37d.USDF.Vault',
    'USDT': 'A.b19d29f25882ec7c.USDT.Vault',
    'stFlow': 'A.d6f80565193ad727.stFlow.Vault',
    'ankrFLOW': 'A.1e4aa0b87d10b141.ankrFLOW.Vault',
  };

  const vaultTypeEntries = Object.entries(vaultSetupInfo).map(([tokenName, path]) => ({
    key: tokenName,
    value: vaultTypes[tokenName] || `A.0000000000000000.${tokenName}.Vault`
  }));

  return [
    arg(contractName, t.String),
    arg(contractCode, t.String),
    arg(name, t.String),
    arg(category, t.String),
    arg(description, t.String),
    arg(ipfsCID, t.String),
    arg(isListed, t.Bool),
    arg(creator, t.Address),
    arg(metadataJSON, t.String),
    arg(Object.entries(vaultSetupInfo).map(([k, v]) => ({key: k, value: v})), t.Dictionary({ key: t.String, value: t.String })),
    arg(vaultTypeEntries, t.Dictionary({ key: t.String, value: t.String })),
    arg(shouldDeployManager, t.Bool),
    arg(FORTEHUB_MANAGER_CONTRACT_CODE, t.String),
    arg([], t.Dictionary({ key: t.String, value: t.AnyStruct }))
  ];
}

/**
 * Extract vault setup info from workflow metadata and source code
 *
 * Detects tokens from imports in the generated contract code
 * Returns a mapping of token names to standard storage paths
 *
 * Vault paths follow Flow standard:
 * - FLOW: /storage/flowTokenVault
 * - Others: /storage/{tokenSymbol}Vault (lowercase first letter)
 */
export function extractVaultSetupInfo(
  metadataJSON: string,
  sourceCode: string
): Record<string, string> {
  const vaultSetupInfo: Record<string, string> = {};

  // Always include FLOW (standard for all workflows, available on testnet/mainnet)
  vaultSetupInfo["FLOW"] = "/storage/flowTokenVault";

  // Detect other tokens from import statements in the contract code
  // Pattern: import TokenName from 0x...
  // Common tokens: USDC, USDCFlow, USDF, stFlow, fuDAI, fuUSDT, etc.
  const importRegex = /import\s+(\w+)\s+from\s+0x[a-fA-F0-9]+/g;
  let match;

  const standardTokens = new Set(['FLOW', 'FungibleToken', 'MetadataViews']);
  const tokenSymbols = new Set(['USDC', 'USDCFlow', 'USDF', 'stFlow', 'fuDAI', 'fuUSDT', 'MOET', 'WETH', 'WBTC', 'cbBTC', 'USDT', 'ankrFLOW']);

  while ((match = importRegex.exec(sourceCode)) !== null) {
    const tokenName = match[1];

    // Skip standard/framework imports, only track token imports
    if (!standardTokens.has(tokenName) && tokenSymbols.has(tokenName)) {
      // Generate standard storage path: /storage/{token}Vault
      // Exception: FLOW uses flowTokenVault (lowercase)
      const storagePath = tokenName === 'FLOW'
        ? '/storage/flowTokenVault'
        : `/storage/${tokenName.charAt(0).toLowerCase()}${tokenName.slice(1)}Vault`;

      vaultSetupInfo[tokenName] = storagePath;
    }
  }

  return vaultSetupInfo;
}

/**
 * Extract scheduling metadata from workflow response
 *
 * Returns:
 * - isSchedulable: whether the workflow can be scheduled for autonomous execution
 * - defaultFrequency: suggested frequency in seconds if isSchedulable=true
 */
export interface SchedulingMetadata {
  isSchedulable: boolean;
  defaultFrequency?: string;  // in seconds, e.g. "86400.0"
}

export function extractSchedulingMetadata(metadataJSON: string): SchedulingMetadata {
  try {
    const metadata = JSON.parse(metadataJSON);
    return {
      isSchedulable: metadata.isSchedulable ?? false,
      defaultFrequency: metadata.defaultFrequency
    };
  } catch (e) {
    // Default to manual-only if metadata can't be parsed
    return { isSchedulable: false };
  }
}


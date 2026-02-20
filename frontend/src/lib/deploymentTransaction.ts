/**
 * Deployment Transaction Generator
 *
 * Generates the unified one-shot deployment transaction that handles:
 * 1. Initialize ForteHub Manager resource (centrally deployed ForteHub)
 * 2. Deploy workflow contract code to user's account
 * 3. Set up required vaults (FLOW, USDC, custom tokens) if missing
 * 4. Register workflow in ForteHubRegistry via Manager
 *
 * ForteHub is centrally deployed at 0xbd4c3996265ed830 and imported by all users.
 * Each user creates their own Manager resource and stores it in account storage.
 *
 * SOURCE OF TRUTH: /cadence/contracts/ForteHub.cdc (merged contract)
 */

// Note: ForteHub contract is now centrally deployed and imported at 0xbd4c3996265ed830
// No per-account manager code deployment needed

/**
 * DEPLOY_WORKFLOW_TRANSACTION
 *
 * ONE-SHOT DEPLOYMENT TRANSACTION
 * Handles all steps needed to deploy a workflow:
 *
 * STEP 0: Initialize FlowTransactionScheduler Manager (if needed)
 *         Creates the scheduler manager that handles autonomous execution
 *
 * STEP 1: ForteHub Manager resource (if first workflow)
 *         Generate Manager resource
 *
 * STEP 2: Deploy workflow contract code
 *         User's generated Cadence contract with Workflow resource + factory function
 *
 * STEP 3: Instantiate workflow resource
 *         Calls contract's createWorkflow() factory function
 *         Stores resource in ForteHub.workflows dictionary
 *
 * STEP 4: Set up required vaults
 *         Creates FLOW, USDC, and other token vaults as needed
 *
 * STEP 5: Register in ForteHubRegistry
 *         Records metadata for discovery and cloning
 *
 * ARCHITECTURE NOTES:
 * - Workflows are RESOURCES conforming to ForteHub.IWorkflow interface
 * - Each resource is instantiated from contract's factory function
 * - Resources stored in ForteHub for lifecycle management
 * - Scheduler accesses manager, not workflows directly (isolation)
 * - IPFS CID stored for immutable code reference and auditability
 */
const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');

export const DEPLOY_WORKFLOW_TRANSACTION = `
/**
 * DEPLOY_WORKFLOW_TRANSACTION
 *
 * Unified deployment flow used by ForteHub frontend + CLI.
 * Performs the following per-wallet steps:
 * 0. Initialize FlowTransactionScheduler manager (idempotent)
 * 1. Initialize ForteHub manager resource (idempotent helper inside contract)
 * 2. Deploy the workflow contract (panics if redeployed)
 * 3. Prepare/verify token vaults and publish capabilities
 * 4. Register workflow via Manager.registerWorkflow (computes hash on-chain)
 * 5. Optionally schedule workflow if metadata marks it schedulable
 *
 * NOTE: Workflow instantiation is handled by the per-workflow transaction that
 * imports the generated contract and calls
 * createWorkflow(workflowId, config, manager, ticket) so the resource deposits
 * through manager.acceptWorkflow. This transaction only deploys + registers.
 */

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHub from ${FORTEHUB_REGISTRY}
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
    capabilities: {String: AnyStruct},
    isSchedulable: Bool,
    defaultFrequency: UFix64?,
    price: UFix64?,
    imageIPFS: String?,
    configDefaults: {String: AnyStruct}
) {
    prepare(signer: auth(AddContract, Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {
        // ===== STEP 0: Initialize FlowTransactionScheduler manager (idempotent) =====
        if !signer.storage.check<@{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) {
            let schedulerManager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-schedulerManager, to: FlowTransactionSchedulerUtils.managerStoragePath)

            let managerCap = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
                FlowTransactionSchedulerUtils.managerStoragePath
            )
            signer.capabilities.publish(managerCap, at: FlowTransactionSchedulerUtils.managerPublicPath)
            log("FlowTransactionScheduler Manager initialized")
        } else {
            log("FlowTransactionScheduler Manager already initialized")
        }

        // ===== STEP 1: Initialize ForteHub Manager (delegates to contract helper) =====
        ForteHub.initializeManager(account: signer)
        log("ForteHub Manager initialized")

        // ===== STEP 2: Deploy workflow contract code (one-time) =====
        if signer.contracts.get(name: contractName) != nil {
            panic("Contract ".concat(contractName).concat(" already deployed. Cannot redeploy."))
        }
        signer.contracts.add(name: contractName, code: contractCode.utf8)
        log("Contract deployed: ".concat(contractName))

        // Borrow manager reference for later steps
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub Manager not initialized")

        log("Workflow instantiation occurs in the per-workflow transaction via manager.acceptWorkflow")

        // ===== STEP 3: Set up required vaults + capabilities =====
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
                    let vaultType = CompositeType(vaultTypeStr)
                        ?? panic("Invalid vault type identifier for ".concat(tokenName))
                    let vault <- DeFiActionsUtils.getEmptyVault(vaultType)
                    signer.storage.save(<-vault, to: storagePath)
                    log("Created ".concat(tokenName).concat(" vault at ").concat(vaultPath))
                }
            } else {
                log("Vault already exists for ".concat(tokenName).concat(" at ").concat(vaultPath))
            }

            let vaultExistsNow = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)
            if vaultExistsNow {
                let cap = signer.capabilities.storage.issue<&{FungibleToken.Vault}>(storagePath)
                let publicPath = PublicPath(identifier: tokenName.concat("Vault"))
                    ?? panic("Invalid public path for ".concat(tokenName))
                signer.capabilities.unpublish(publicPath)
                signer.capabilities.publish(cap, at: publicPath)
                log("Published capability for ".concat(tokenName).concat(" at ").concat(publicPath.toString()))
            }
        }

        // ===== STEP 4: Register workflow via Manager =====
        let workflowId = managerRef.registerWorkflow(
            name: name,
            category: category,
            description: description,
            sourceCodeIPFS: ipfsCID,
            isListed: isListed,
            contractName: contractName,
            metadataJSON: metadataJSON,
            parentWorkflowId: nil,
            capabilities: capabilities,
            price: price,
            imageIPFS: imageIPFS,
            configDefaults: configDefaults
        )

        log("Workflow registered with ID: ".concat(workflowId.toString()))

        // ===== STEP 5: Optional scheduling =====
        if isSchedulable && defaultFrequency != nil {
            ForteHub.scheduleWorkflow(
                managerRef: managerRef,
                workflowId: workflowId,
                frequencySeconds: defaultFrequency!,
                account: signer
            )
            log("Workflow scheduled every ".concat(defaultFrequency!.toString()).concat(" seconds"))
        } else {
            log("Workflow deployed without scheduling (manual execution only)")
        }
    }
}
`;

/**
 * Generate Per-Workflow Deployment Transaction
 *
 * ARCHITECTURE DECISION: Dynamic Contract Calling Limitation
 *
 * Cadence requires contract names to be known at compile time.
 * We cannot dynamically call ContractName.createWorkflow() with a runtime variable.
 *
 * SOLUTION: Generate the transaction with the contract name embedded as an import.
 *
 * This function takes the base transaction and injects:
 * 1. The workflow contract import statement
 * 2. The createWorkflow() call with proper types
 *
 * Example output:
 * ```cadence
 * import DailyRebalancer from 0x...
 * import ForteHub from 0x...
 * transaction(...) {
 *     prepare(signer: ...) {
 *         let managerAcceptance: &{ForteHub.WorkflowAcceptance} = managerRef
 *         DailyRebalancer.createWorkflow(
 *             workflowId: 1,
 *             config: {...},
 *             manager: managerAcceptance,
 *             ticket: <-nil
 *         )
 *     }
 * }
 * ```
 *
 * WHY THIS APPROACH:
 * ✅ Type-safe at compile time (Cadence verifies the function exists)
 * ✅ Matches Flow's standard deployment pattern
 * ✅ Follows best practices from Flow CLI and FCL SDK
 * ✅ Each workflow has its own customized transaction
 * ✅ No reflection/dynamic calling needed
 *
 * ALTERNATIVE CONSIDERED: Universal Interface Pattern
 * ❌ Would require all workflows to implement a common interface
 * ❌ More complex for LLM to generate correctly
 * ❌ Less flexible for strategy-specific parameters
 */
export function generatePerWorkflowDeploymentTransaction(
  contractName: string,
  userAddress: string
): string {
  return `
import ForteHub from ${FORTEHUB_REGISTRY}
import ${contractName} from ${userAddress}

transaction(
    workflowId: UInt64,
    config: {String: AnyStruct},
    ticket: @ForteHub.CloneTicket?
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Ensure manager exists (idempotent helper inside ForteHub)
        ForteHub.initializeManager(account: signer)

        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub Manager not initialized")
        let managerAcceptance: &{ForteHub.WorkflowAcceptance} = managerRef

        ${contractName}.createWorkflow(
            workflowId: workflowId,
            config: config,
            manager: managerAcceptance,
            ticket: <-ticket
        )

        log("Workflow instantiated and stored via manager.acceptWorkflow")
    }
}
`;
}

/**
 * Builds transaction arguments for React SDK
 * Includes manager deployment decision and code
 * Auto-schedules workflow if isSchedulable=true
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
  isSchedulable: boolean,  // From LLM metadata
  defaultFrequency: string | undefined,  // From LLM metadata (seconds as string)
  price: string | undefined,  // From LLM metadata (price as string UFix64)
  imageIPFS: string | undefined,  // IPFS CID for workflow image
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

  // Build vaultTypes dict with type identifiers for each token
  const vaultTypes: Record<string, string> = {
    'FLOW': 'A.7e60df042a9c0868.FlowToken.Vault',
    'USDCFlow': 'A.64adf39cbc354fcb.USDCFlow.Vault',
    'USDF': 'A.b7ace0a920d2c37d.USDF.Vault',
    'USDT': 'A.b19d29f25882ec7c.USDT.Vault',
    'stFlow': 'A.d6f80565193ad727.stFlow.Vault',
    'ankrFLOW': 'A.1e4aa0b87d10b141.ankrFLOW.Vault',
    'MOET': 'A.d27920b6384e2a78.MOET.Vault',
    'WETH': 'A.a0b869991a386339.WETH.Vault',
    'WBTC': 'A.a0b869991a386339.WBTC.Vault',
    'cbBTC': 'A.2db29caf9181ef55.cbBTC.Vault',
  };

  const vaultTypeEntries = Object.entries(vaultSetupInfo).map(([tokenName, path]) => ({
    key: tokenName,
    value: vaultTypes[tokenName] || `A.0000000000000000.${tokenName}.Vault`
  }));

  // Parse frequency and price from strings if provided
  const frequencyUFix64 = defaultFrequency ? parseFloat(defaultFrequency) : null;
  const priceUFix64 = price ? parseFloat(price) : null;

  let configDefaultsEntries: Array<{ key: string; value: any }> = [];
  try {
    const parsed = metadataJSON ? JSON.parse(metadataJSON) : {};
    const defaultsSource =
      parsed && typeof parsed === 'object' && parsed.defaultParameters
        ? parsed.defaultParameters
        : {};

    configDefaultsEntries = Object.entries(defaultsSource).map(([key, value]) => ({
      key,
      value: typeof value === 'number' ? value : String(value)
    }));
  } catch (error) {
    console.warn('Failed to parse config defaults from metadataJSON:', error);
    configDefaultsEntries = [];
  }

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
    arg(Object.entries(vaultSetupInfo).map(([k, v]) => ({ key: k, value: v })), t.Dictionary({ key: t.String, value: t.String })),
    arg(vaultTypeEntries, t.Dictionary({ key: t.String, value: t.String })),
    arg([], t.Dictionary({ key: t.String, value: t.AnyStruct })),
    arg(isSchedulable, t.Bool),
    arg(frequencyUFix64, t.Optional(t.UFix64)),
    arg(priceUFix64, t.Optional(t.UFix64)),
    arg(imageIPFS, t.Optional(t.String)),
    arg(configDefaultsEntries, t.Dictionary({ key: t.String, value: t.AnyStruct }))
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

  // Explicit storage path mappings for tokens with special naming conventions
  const vaultPathMap: Record<string, string> = {
    'FLOW': '/storage/flowTokenVault',
    'USDC': '/storage/usdcVault',
    'USDCFlow': '/storage/usdcFlowVault',
    'USDF': '/storage/usdfVault',
    'stFlow': '/storage/stFlowVault',
    'ankrFLOW': '/storage/ankrFLOWVault',
    'MOET': '/storage/moetVault',
    'WETH': '/storage/wethVault',
    'WBTC': '/storage/wbtcVault',
    'cbBTC': '/storage/cbBTCVault',
    'USDT': '/storage/usdtVault',
    'fuUSDT': '/storage/fuUSDTVault',
    'fuDAI': '/storage/fuDAIVault'
  };

  while ((match = importRegex.exec(sourceCode)) !== null) {
    const tokenName = match[1];

    // Skip standard/framework imports, only track token imports
    if (!standardTokens.has(tokenName) && tokenSymbols.has(tokenName)) {
      // Use explicit mapping for known tokens, fallback to automatic generation
      const storagePath = vaultPathMap[tokenName]
        || `/storage/${tokenName.charAt(0).toLowerCase()}${tokenName.slice(1)}Vault`;

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

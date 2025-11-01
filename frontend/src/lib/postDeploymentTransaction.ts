/**
 * Post-Deployment Transaction Generator
 *
 * Generates the post-deploy transaction by:
 * 1. Reading the generic post-deploy template
 * 2. Replacing contract name and address placeholders
 * 3. Creating a type-safe transaction for the specific contract
 */

/**
 * Generates a customized post-deploy transaction for a specific agent contract
 *
 * @param contractName The name of the deployed contract (e.g., "DailyRebalancer")
 * @param signerAddress The address where the contract was deployed
 * @returns The customized Cadence transaction code
 */
export function generatePostDeployTransaction(
  contractName: string,
  signerAddress: string
): string {
  // Read the generic template (this would be embedded or fetched)
  const template = getGenericPostDeployTemplate();

  // Replace placeholders with actual values
  return template
    .replace(/{CONTRACT_NAME}/g, contractName)
    .replace(/{CONTRACT_ADDRESS}/g, signerAddress);
}

/**
 * Returns the generic post-deploy transaction template
 * This template contains all the logic for instantiating connectors and calling createAgent
 */
function getGenericPostDeployTemplate(): string {
  return `import FlowToken from 0x0ae53cb6e3f42a79
import FungibleToken from 0xee82856bf20e2aa6
import ForteHubRegistry from 0xf8d6e0586b0a20c7
import FlowTransactionScheduler from 0xf8d6e0586b0a20c7
import FungibleTokenConnectors from 0xf8d6e0586b0a20c7
import IncrementFiSwapConnectors from 0xf8d6e0586b0a20c7
import BandOracleConnectors from 0xf8d6e0586b0a20c7
import DeFiActions from 0xf8d6e0586b0a20c7
import {CONTRACT_NAME} from {CONTRACT_ADDRESS}

transaction(
    agentId: UInt64,
    flowVaultPath: String,
    usdcVaultPath: String,
    swapPath: [String],
    oracleUnitOfAccount: Type,
    hasScheduler: Bool
) {
    prepare(signer: auth(BorrowValue, IssueStorageCapabilityController) &Account) {
        // ===== Step 1: Validate and issue vault capabilities =====

        let flowStoragePath = StoragePath(identifier: flowVaultPath)
            ?? panic("Invalid FLOW vault path: \\(flowVaultPath)")
        let usdcStoragePath = StoragePath(identifier: usdcVaultPath)
            ?? panic("Invalid USDC vault path: \\(usdcVaultPath)")

        let flowVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(flowStoragePath)
        assert(flowVaultCap.check(), message: "FLOW vault capability check failed")

        let usdcVaultCap = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(usdcStoragePath)
        assert(usdcVaultCap.check(), message: "USDC vault capability check failed")

        // ===== Step 2: Instantiate connectors =====

        let flowSource = FungibleTokenConnectors.VaultSource(
            min: nil,
            withdrawVault: flowVaultCap as! Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>,
            uniqueID: nil
        )

        let usdcSource = FungibleTokenConnectors.VaultSource(
            min: nil,
            withdrawVault: usdcVaultCap as! Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>,
            uniqueID: nil
        )

        let flowSink = FungibleTokenConnectors.VaultSink(
            max: nil,
            depositVault: flowVaultCap as! Capability<&{FungibleToken.Vault}>,
            uniqueID: nil
        )

        let usdcSink = FungibleTokenConnectors.VaultSink(
            max: nil,
            depositVault: usdcVaultCap as! Capability<&{FungibleToken.Vault}>,
            uniqueID: nil
        )

        let swapper = IncrementFiSwapConnectors.Swapper(
            path: swapPath,
            inVault: Type<@FlowToken.Vault>(),
            outVault: Type<@FungibleToken.Vault>(),
            uniqueID: nil
        )

        let oracleFlowSource = FungibleTokenConnectors.VaultSource(
            min: nil,
            withdrawVault: flowVaultCap as! Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>,
            uniqueID: nil
        )

        let priceOracle = BandOracleConnectors.PriceOracle(
            unitOfAccount: oracleUnitOfAccount,
            staleThreshold: 3600 as UInt64,
            feeSource: oracleFlowSource as {DeFiActions.Source},
            uniqueID: nil
        )

        // ===== Step 3: Get scheduler manager if enabled =====

        var schedulerManagerRef: &FlowTransactionScheduler.Manager? = nil
        if hasScheduler {
            schedulerManagerRef = signer.capabilities.borrow<&FlowTransactionScheduler.Manager>(/public/flowTransactionSchedulerManager)
            assert(schedulerManagerRef != nil, message: "FlowTransactionScheduler.Manager not found")
        }

        // ===== Step 4: Borrow ForteHubManager and create agent =====

        let pathPrefix = "AgentStudio_"
            .concat(signer.address.toString())
            .concat("_{CONTRACT_NAME}")
        let managerStoragePath = StoragePath(identifier: pathPrefix.concat("_Manager"))
            ?? panic("Invalid manager path")

        let forteHubManager = signer.borrow<&{CONTRACT_NAME}.ForteHubManager>(from: managerStoragePath)
            ?? panic("Could not borrow ForteHubManager from \\(managerStoragePath)")

        let newAgent <- forteHubManager.createAgent(
            ownerAddress: signer.address,
            flowSource: flowSource,
            usdcSource: usdcSource,
            flowSink: flowSink,
            usdcSink: usdcSink,
            swapper: swapper,
            priceOracle: priceOracle,
            schedulerManager: schedulerManagerRef
        )

        let createdAgentId = forteHubManager.addAgent(newAgent: <- newAgent)

        log("Agent created with ID: ".concat(createdAgentId.toString()))
    }

    execute {
        // ===== Step 5: Record clone in registry =====

        ForteHubRegistry.recordClone(
            agentId: agentId,
            deployer: signer.address,
            contractName: "{CONTRACT_NAME}"
        )

        log("Clone recorded in ForteHubRegistry")
    }
}`;
}

/**
 * Configuration for post-deploy transaction parameters
 */
export interface PostDeployConfig {
  agentId: UInt64;
  flowVaultPath: string;
  usdcVaultPath: string;
  swapPath: string[];
  oracleUnitOfAccount: string;
  hasScheduler: boolean;
}

/**
 * Builds transaction arguments for FCL
 */
export function buildPostDeployArgs(config: PostDeployConfig, t: any) {
  return [
    t.UInt64(config.agentId),
    t.String(config.flowVaultPath),
    t.String(config.usdcVaultPath),
    t.Array(config.swapPath.map((path: string) => t.String(path))),
    t.Type(config.oracleUnitOfAccount),
    t.Bool(config.hasScheduler)
  ];
}

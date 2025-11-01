/**
 * DEPLOY_WORKFLOW_TRANSACTION
 *
 * ONE-ATOMIC DEPLOYMENT TRANSACTION
 *
 * Handles the complete workflow deployment flow in a single transaction:
 * 1. Deploy ForteHubManager contract (first time per wallet only)
 * 2. Initialize vaults (FLOW, USDC, custom tokens)
 * 3. Deploy workflow contract to user's account
 * 4. Register workflow in ForteHubRegistry
 *
 * This is the main transaction used by the ForteHub frontend (deploymentTransaction.ts).
 * It enables per-wallet workflow management with automatic manager initialization.
 *
 * Source: frontend/src/lib/deploymentTransaction.ts
 */

import FungibleToken from 0xee82856bf20e2aa6
import FlowToken from 0x0ae53cb6e3f42a79
import ForteHubRegistry from 0xf8d6e0586b0a20c7
import FlowTransactionSchedulerUtils from 0xf8d6e0586b0a20c7

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
    deployManagerCode: Bool,
    managerCode: String,
    capabilities: {String: AnyStruct}
) {
    prepare(signer: auth(AddContract, Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {
        // ===== STEP 1: Deploy ForteHubManager contract if needed (self-initializing) =====
        // ForteHubManager is deployed once per wallet to manage all workflows for that user
        // Manager initialization happens automatically when contract init() is called
        // Manager is created and saved to storage by ForteHubManager.init()
        if deployManagerCode {
            // Check if ForteHubManager contract already exists
            if signer.contracts.get(name: "ForteHubManager") == nil {
                signer.contracts.add(name: "ForteHubManager", code: managerCode.utf8)
                log("ForteHubManager contract deployed and initialized to signer's account")
            } else {
                log("ForteHubManager contract already exists, skipping deployment")
            }
        }

        // ===== STEP 2: Set up required vaults =====
        for tokenName in vaultSetupInfo.keys {
            let vaultPath = vaultSetupInfo[tokenName]!
            let storagePath = StoragePath(identifier: vaultPath)
                ?? panic("Invalid storage path: ".concat(vaultPath))

            let vaultExists = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)

            if !vaultExists {
                if tokenName == "FLOW" {
                    let emptyVault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
                    signer.storage.save(<-emptyVault, to: storagePath)
                    log("Created FLOW vault at ".concat(vaultPath))
                } else {
                    log("WARNING: Vault for ".concat(tokenName).concat(" not found at ").concat(vaultPath))
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

        // ===== STEP 3: Deploy workflow contract code =====
        signer.contracts.add(name: contractName, code: contractCode.utf8)
        log("Contract deployed: ".concat(contractName))
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

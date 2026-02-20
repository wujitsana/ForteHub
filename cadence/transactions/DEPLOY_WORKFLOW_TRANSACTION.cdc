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
 * `createWorkflow(workflowId, config, manager, ticket)` so the resource deposits
 * through `manager.acceptWorkflow`. This transaction only deploys + registers.
 */

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHub from 0xbd4c3996265ed830
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

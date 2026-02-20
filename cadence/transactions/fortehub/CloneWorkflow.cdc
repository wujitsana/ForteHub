/// Clone Workflow From Registry (template)
///
/// Replace `YourWorkflowContract` and `0xCREATOR` with the actual workflow
/// contract name and creator address before running this transaction.
/// This template mirrors the frontend-generated transaction so on-chain cloning
/// stays consistent across CLI usage and the UI.

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import ForteHub from 0xc2b9e41bc947f855
import DeFiActionsUtils from 0x2ab6f469ee0dfbb6
import YourWorkflowContract from 0x0000000000000000   // TODO: replace with actual contract + creator address

transaction(
    workflowId: UInt64,
    vaultSetupInfo: {String: String},
    vaultTypes: {String: String},
    configOverrides: {String: AnyStruct}
) {
    prepare(signer: auth(AddContract, Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {
        // Ensure ForteHub manager exists for this wallet
        if !signer.storage.check<@ForteHub.Manager>(from: ForteHub.FORTEHUB_MANAGER_STORAGE) {
            let manager <- ForteHub.createManager(ownerAddress: signer.address)
            signer.storage.save(<-manager, to: ForteHub.FORTEHUB_MANAGER_STORAGE)
        }

        // Create/issue capabilities for any vaults required by this workflow
        for tokenName in vaultSetupInfo.keys {
            let vaultPathStr = vaultSetupInfo[tokenName]!
            let storagePath = StoragePath(identifier: vaultPathStr)
                ?? panic("Invalid storage path: ".concat(vaultPathStr))

            let hasVault = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)
            if !hasVault {
                if tokenName == "FLOW" {
                    let vault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
                    signer.storage.save(<-vault, to: storagePath)
                    log("Created FLOW vault at ".concat(vaultPathStr))
                } else {
                    let vaultTypeStr = vaultTypes[tokenName]
                        ?? panic("Missing vault type identifier for ".concat(tokenName))
                    let vaultType = CompositeType(vaultTypeStr)
                        ?? panic("Invalid vault type identifier: ".concat(vaultTypeStr))
                    let vault <- DeFiActionsUtils.getEmptyVault(vaultType)
                    signer.storage.save(<-vault, to: storagePath)
                    log("Created ".concat(tokenName).concat(" vault at ").concat(vaultPathStr))
                }
            }

            let existsNow = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)
            if existsNow {
                let _ = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(storagePath)
                log("Capability issued for ".concat(tokenName).concat(" vault @ ").concat(vaultPathStr))
            }
        }

        let workflowInfo = ForteHub.getWorkflowInfo(workflowId: workflowId)
            ?? panic("Workflow not found in registry")

        if workflowInfo.clonesLocked {
            panic("Creator locked cloning for this workflow")
        }
        if workflowInfo.isListed == false && workflowInfo.creator != signer.address {
            panic("Workflow is unlisted and cannot be cloned by this account")
        }

        // Merge registry defaults with caller overrides
        var config: {String: AnyStruct} = {}
        for key in workflowInfo.configDefaults.keys {
            config[key] = workflowInfo.configDefaults[key]!
        }
        for key in configOverrides.keys {
            config[key] = configOverrides[key]!
        }
        if config["name"] == nil {
            config["name"] = workflowInfo.name
        }
        if config["category"] == nil {
            config["category"] = workflowInfo.category
        }

        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub Manager not initialized")
        let managerAcceptance: &{ForteHub.WorkflowAcceptance} = managerRef

        // Handle clone fee via ticket purchase (creators can skip tickets)
        let workflowPrice = workflowInfo.price ?? 0.0
        let isCreatorClone = workflowInfo.creator == signer.address
        var paymentVault: @FlowToken.Vault? <- nil
        if workflowPrice > 0.0 && !isCreatorClone {
            let flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
                from: /storage/flowTokenVault
            ) ?? panic("FLOW vault not found. Please set up your FLOW wallet first.")
            let withdrawn <- flowVault.withdraw(amount: workflowPrice)
            paymentVault <-! withdrawn as! @FlowToken.Vault
        }

        var ticket: @ForteHub.CloneTicket? <- nil
        if !isCreatorClone {
            ticket <- ForteHub.purchaseCloneTicket(
                workflowId: workflowId,
                buyer: signer.address,
                payment: <-paymentVault
            )
        } else {
            destroy paymentVault
        }

        // Instantiate workflow from creator contract directly into manager
        YourWorkflowContract.createWorkflow(
            workflowId: workflowId,
            config: config,
            manager: managerAcceptance,
            ticket: <-ticket
        )

        log("Workflow cloned successfully. ID: ".concat(workflowId.toString()))
    }
}

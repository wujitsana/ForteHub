/// RegisterAndScheduleDCA.cdc
///
/// Registers the DCA workflow in ForteHub and creates an instance.
/// This is Step 2 of the DCA deployment process.

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHub from 0xc2b9e41bc947f855
import DCAAuto from 0xc430a4b0d5af6025

transaction(
    dcaAmount: UFix64,
    targetAccount: Address,
    schedulingFrequency: UFix64,
    price: UFix64
) {
    prepare(signer: auth(Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {
        let ipfsCID = "bafkreihrnmqk6frcxrhg67efeuhtx33qy4rh2vk3jbqpy3y3mve4gd2ehm"

        // ===== STEP 0: Initialize FlowTransactionScheduler Manager (if needed) =====
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
        }

        // ===== STEP 1: Initialize ForteHub Manager (idempotent) =====
        ForteHub.initializeManager(account: signer)
        log("ForteHub Manager initialized")

        // ===== STEP 3: Set up FLOW vault (if needed) =====
        let flowStoragePath = /storage/flowTokenVault
        if !signer.storage.check<@{FungibleToken.Vault}>(from: flowStoragePath) {
            let vault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
            signer.storage.save(<-vault, to: flowStoragePath)
            log("Created FLOW vault")
        }

        // Issue capability for FLOW
        let flowCap = signer.capabilities.storage.issue<&{FungibleToken.Vault}>(flowStoragePath)
        signer.capabilities.unpublish(/public/flowTokenVault)
        signer.capabilities.publish(flowCap, at: /public/flowTokenVault)

        // Ensure FLOW receiver capability exists
        let flowReceiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(flowStoragePath)
        signer.capabilities.unpublish(/public/flowTokenReceiver)
        signer.capabilities.publish(flowReceiverCap, at: /public/flowTokenReceiver)

        // ===== STEP 4: Register workflow in ForteHub Manager =====
        let capabilities: {String: AnyStruct} = {
            "isSchedulable": true,
            "defaultFrequency": schedulingFrequency.toString(),
            "inputTokens": ["FLOW"],
            "outputTokens": ["FLOW"]
        }

        let metadataJSON = "{\"dcaAmount\": \"".concat(dcaAmount.toString()).concat("\", \"targetAccount\": \"").concat(targetAccount.toString()).concat("\", \"frequency\": \"").concat(schedulingFrequency.toString()).concat("\"}")
        let configDefaults: {String: AnyStruct} = {
            "dcaAmount": dcaAmount.toString(),
            "targetAccount": targetAccount.toString(),
            "frequency": schedulingFrequency.toString()  // This makes the workflow schedulable
        }

        // Borrow the Manager resource using correct path
        let manager = signer.storage.borrow<&ForteHub.Manager>(from: ForteHub.FORTEHUB_MANAGER_STORAGE)
            ?? panic("Could not borrow ForteHub Manager reference")

        let workflowId = manager.registerWorkflow(
            name: "Dollar-Cost Averaging (DCA)",
            category: "dca",
            description: "Automatically transfers FLOW regularly to accumulate position at target account",
            sourceCodeIPFS: ipfsCID,
            isListed: true,
            contractName: "DCAAuto",
            metadataJSON: metadataJSON,
            parentWorkflowId: nil,
            capabilities: capabilities,
            price: price,
            imageIPFS: nil,
            configDefaults: configDefaults
        )

        log("DCAAuto workflow registered successfully with ID: ".concat(workflowId.toString()))

        // ===== STEP 5: Instantiate workflow and add to Manager =====
        let managerAcceptance: &{ForteHub.WorkflowAcceptance} = manager
        let config: {String: AnyStruct} = {
            "name": "Dollar-Cost Averaging (DCA)",
            "category": "dca",
            "dcaAmount": dcaAmount,
            "targetAccount": targetAccount
        }

        DCAAuto.createWorkflow(
            workflowId: workflowId,
            config: config,
            manager: managerAcceptance,
            ticket: nil
        )
        log("Workflow instance added to Manager")

        // ===== STEP 6: Enable scheduling for the workflow =====
        ForteHub.scheduleWorkflow(
            managerRef: manager,
            workflowId: workflowId,
            frequencySeconds: schedulingFrequency,
            account: signer
        )
        log("DCAAuto workflow scheduled successfully")
    }
}

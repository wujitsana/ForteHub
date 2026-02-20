/// DeployDCAAuto.cdc
///
/// Deployment transaction for Dollar-Cost Averaging (DCA) workflow
/// Handles:
/// 1. FlowTransactionScheduler Manager init
/// 2. ForteHub Manager init
/// 3. DCAAuto contract deployment
/// 4. Workflow registration via Manager

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHub from 0xc2b9e41bc947f855
import DCAAuto from 0xd695aea7bfa88279

transaction(
    contractCode: String,
    dcaAmount: UFix64,
    targetAccount: Address,
    schedulingFrequency: UFix64,
    price: UFix64
) {
    prepare(signer: auth(AddContract, UpdateContract, Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {
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
        } else {
            log("FlowTransactionScheduler Manager already exists")
        }

        // ===== STEP 1: Initialize ForteHub Manager (idempotent) =====
        ForteHub.initializeManager(account: signer)
        log("ForteHub Manager initialized")

        // ===== STEP 2: Deploy or update workflow contract code =====
        if signer.contracts.get(name: "DCAAuto") != nil {
            signer.contracts.update(name: "DCAAuto", code: contractCode.utf8)
            log("DCAAuto contract updated")
        } else {
            signer.contracts.add(name: "DCAAuto", code: contractCode.utf8)
            log("DCAAuto contract deployed")
        }

        // ===== STEP 3: Set up FLOW vault (if needed) =====
        let flowStoragePath = /storage/flowTokenVault
        if !signer.storage.check<@{FungibleToken.Vault}>(from: flowStoragePath) {
            let vault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
            signer.storage.save(<-vault, to: flowStoragePath)
            log("Created FLOW vault")
        } else {
            log("FLOW vault already exists")
        }

        // Issue capability for FLOW
        let flowCap = signer.capabilities.storage.issue<&{FungibleToken.Vault}>(flowStoragePath)
        signer.capabilities.unpublish(/public/flowTokenVault)
        signer.capabilities.publish(flowCap, at: /public/flowTokenVault)
        log("FLOW vault capability published")

        // Ensure FLOW receiver capability exists
        let flowReceiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(flowStoragePath)
        signer.capabilities.unpublish(/public/flowTokenReceiver)
        signer.capabilities.publish(flowReceiverCap, at: /public/flowTokenReceiver)
        log("FLOW receiver capability published")

        // ===== STEP 4: Register workflow in ForteHub Manager =====
        let capabilities: {String: AnyStruct} = {
            "isSchedulable": true,
            "defaultFrequency": schedulingFrequency.toString(),
            "inputTokens": ["FLOW"],
            "outputTokens": ["FLOW"]
        }

        let metadataJSON = "{\"dcaAmount\": \"".concat(dcaAmount.toString()).concat("\", \"targetAccount\": \"").concat(targetAccount.toString()).concat("\", \"frequency\": \"").concat(schedulingFrequency.toString()).concat("\"}")
        let configDefaults: {String: AnyStruct} = {
            "dcaAmount": dcaAmount,
            "targetAccount": targetAccount,
            "frequency": schedulingFrequency
        }

        // Borrow the Manager resource
        let manager = signer.storage.borrow<&ForteHub.Manager>(from: ForteHub.ManagerStoragePath)
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

        log("DCAAuto workflow registered successfully")
        log("  Workflow ID: ".concat(workflowId.toString()))
        log("  Name: Dollar-Cost Averaging (DCA)")
        log("  DCA Amount: ".concat(dcaAmount.toString()).concat(" FLOW"))
        log("  Target Account: ".concat(targetAccount.toString()))
        log("  Frequency: ".concat(schedulingFrequency.toString()).concat(" seconds"))
        log("  Price: ".concat(price.toString()).concat(" FLOW"))

        // ===== STEP 5: Instantiate workflow and add to Manager =====
        // Create workflow instance from DCAAuto contract
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
            ticket: <-nil
        )
        log("Workflow instance added to Manager for ID: ".concat(workflowId.toString()))

        // ===== STEP 6: Enable scheduling for the workflow =====
        ForteHub.scheduleWorkflow(
            managerRef: manager,
            workflowId: workflowId,
            frequencySeconds: schedulingFrequency,
            account: signer
        )
        log("DCAAuto workflow scheduled successfully")
        log("  Workflow will execute every ".concat(schedulingFrequency.toString()).concat(" seconds"))
    }
}

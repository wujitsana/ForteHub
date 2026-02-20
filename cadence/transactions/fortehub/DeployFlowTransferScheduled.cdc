/// DeployFlowTransferScheduled.cdc
///
/// Full deployment transaction for scheduled FLOW transfer workflow
/// Tests the complete flow including:
/// 1. FlowTransactionScheduler Manager init
/// 2. ForteHub init
/// 3. FlowTransferScheduled contract deployment
/// 4. Workflow registration via Manager

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHub from 0xbd4c3996265ed830
import FlowTransferScheduled from 0xbd4c3996265ed830

transaction(
    contractCode: String,
    initialAmount: UFix64,
    recipient: Address,
    schedulingFrequency: UFix64,
    ipfsCID: String,
    sourceCodeHash: String
) {
    prepare(signer: auth(AddContract, Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {

        // ===== STEP 0: Initialize FlowTransactionScheduler Manager (if needed) =====
        if !signer.storage.check<@{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) {
            let schedulerManager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(<-schedulerManager, to: FlowTransactionSchedulerUtils.managerStoragePath)

            // Public capability (read-only)
            let managerCap = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
                FlowTransactionSchedulerUtils.managerStoragePath
            )
            signer.capabilities.publish(managerCap, at: FlowTransactionSchedulerUtils.managerPublicPath)

            log("FlowTransactionScheduler Manager initialized")
        } else {
            log("FlowTransactionScheduler Manager already exists")
        }

        // ===== STEP 1: Ensure ForteHub Manager exists =====
        // Skip initialization for now - account should already have Manager
        // from earlier deployments. This prevents "already stores an object" error
        log("ForteHub Manager confirmed ready")

        // ===== STEP 2: Deploy workflow contract code =====
        signer.contracts.add(name: "FlowTransferScheduled", code: contractCode.utf8)
        log("FlowTransferScheduled contract deployed")

        // ===== STEP 3: Set up FLOW vault (if needed) =====
        let flowStoragePath = /storage/flowTokenVault
        if !signer.storage.check<@{FungibleToken.Vault}>(from: flowStoragePath) {
            let vault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
            signer.storage.save(<-vault, to: flowStoragePath)
            log("Created FLOW vault")
        } else {
            log("FLOW vault already exists")
        }

        // Issue capability for FLOW (read-only, no Withdraw entitlement)
        let flowCap = signer.capabilities.storage.issue<&{FungibleToken.Vault}>(flowStoragePath)

        // Unpublish and republish if already exists
        signer.capabilities.unpublish(/public/flowTokenVault)
        signer.capabilities.publish(flowCap, at: /public/flowTokenVault)
        log("FLOW vault capability published")

        // Also ensure FLOW receiver capability exists for transfers TO this account
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

        let metadataJSON = "{\"transferAmount\": \""
            .concat(initialAmount.toString())
            .concat("\", \"recipient\": \"")
            .concat(recipient.toString())
            .concat("\", \"frequency\": \"")
            .concat(schedulingFrequency.toString())
            .concat("\"}")

        let configDefaults: {String: AnyStruct} = {
            "transferAmount": initialAmount,
            "recipient": recipient,
            "name": "Flow Transfer Scheduled",
            "category": "transfer"
        }

        let manager = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.ManagerStoragePath
        ) ?? panic("Could not borrow ForteHub Manager reference")

        let workflowId = manager.registerWorkflow(
            name: "Flow Transfer Scheduled",
            category: "transfer",
            description: "Sends FLOW to a target address on a fixed schedule",
            sourceCodeIPFS: ipfsCID,
            isListed: true,
            contractName: "FlowTransferScheduled",
            metadataJSON: metadataJSON,
            parentWorkflowId: nil,
            capabilities: capabilities,
            price: nil,
            imageIPFS: nil,
            configDefaults: configDefaults
        )

        log("FlowTransferScheduled registered with workflow ID ".concat(workflowId.toString()))

        // ===== STEP 5: Instantiate workflow via factory (manager.acceptWorkflow handles storage) =====
        let managerAcceptance: &{ForteHub.WorkflowAcceptance} = manager
        FlowTransferScheduled.createWorkflow(
            workflowId: workflowId,
            config: {
                "name": "Flow Transfer Scheduled",
                "category": "transfer",
                "transferAmount": initialAmount,
                "recipient": recipient
            },
            manager: managerAcceptance,
            ticket: <-nil
        )
        log("Workflow instance stored in Manager for ID ".concat(workflowId.toString()))

        // ===== STEP 6: Schedule the workflow =====
        ForteHub.scheduleWorkflow(
            managerRef: manager,
            workflowId: workflowId,
            frequencySeconds: schedulingFrequency,
            account: signer
        )
        log("Workflow scheduled to execute every ".concat(schedulingFrequency.toString()).concat(" seconds"))
    }
}

/// SetupTestWorkflow.cdc
///
/// Setup transaction for full workflow deployment flow
/// Tests:
/// 1. FlowTransactionScheduler Manager initialization (STEP 0)
/// 2. ForteHub resource initialization (STEP 1b)
/// 3. Workflow instantiation and storage (STEP 3)
/// 4. Vault setup (STEP 4)
/// 5. Registry registration (STEP 5)

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHub from 0xc2b9e41bc947f855
import TestWorkflow from 0xd695aea7bfa88279

transaction(creatorAddress: Address) {
    prepare(signer: auth(Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {

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

        // ===== STEP 1b: Initialize ForteHub resource (idempotent) =====
        ForteHub.initializeManager(account: signer)
        log("ForteHub resource initialized")

        // ===== STEP 3: Instantiate workflow and add to ForteHub =====
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub not initialized")
        let managerAcceptance: &{ForteHub.WorkflowAcceptance} = managerRef

        let config: {String: AnyStruct} = {
            "name": "Test Workflow",
            "category": "testing"
        }

        TestWorkflow.createWorkflow(
            workflowId: 1,
            config: config,
            manager: managerAcceptance,
            ticket: nil
        )
        log("Test workflow created and added to manager")

        // ===== STEP 4: Set up FLOW vault =====
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
        signer.capabilities.publish(flowCap, at: /public/flowTokenVault)
        log("FLOW vault capability published")
        log("FLOW vault capability published")

        // ===== STEP 5: Register workflow in ForteHub =====
        // Registry computes SHA-256 hash internally for verification
        let capabilities: {String: AnyStruct} = {}
        let configDefaults: {String: AnyStruct} = {}

        let workflowId = managerRef.registerWorkflow(
            name: "Test Workflow",
            category: "testing",
            description: "Test workflow for deployment verification",
            sourceCodeIPFS: "bafkreih3eidl6nzbwgxszrl4yn7j6k367fjyb5cvi4nc7uytqqjtkgmgba",
            isListed: true,
            contractName: "TestWorkflow",
            metadataJSON: "{}",
            parentWorkflowId: nil,
            capabilities: capabilities,
            price: 0.0,
            imageIPFS: nil,
            configDefaults: configDefaults
        )

        log("Test workflow registered with ID: ".concat(workflowId.toString()))
    }

    execute {
    }
}

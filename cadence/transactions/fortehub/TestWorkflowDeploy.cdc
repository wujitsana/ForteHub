/// TestWorkflowDeploy.cdc
///
/// Test deployment transaction for full workflow deployment flow
/// Tests:
/// 1. FlowTransactionScheduler Manager initialization (STEP 0)
/// 2. ForteHub contract deployment (STEP 1)
/// 3. ForteHub resource initialization (STEP 1b)
/// 4. Workflow contract deployment (STEP 2)
/// 5. Workflow instantiation and storage (STEP 3)
/// 6. Vault setup (STEP 4)
/// 7. Registry registration (STEP 5)

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHub from 0xc2b9e41bc947f855
import TestWorkflow from 0xc2b9e41bc947f855

transaction(creatorAddress: Address) {
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


        // ===== STEP 1b: Initialize ForteHub resource (idempotent) =====
        if !signer.storage.check<@ForteHub.Manager>(from: ForteHub.FORTEHUB_MANAGER_STORAGE) {
            ForteHub.initializeManager(account: signer)
            log("ForteHub resource initialized")
        } else {
            log("ForteHub resource already exists")
        }
        // ===== STEP 3: Instantiate workflow and add to ForteHub =====
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub not initialized")
        let managerAcceptance: &{ForteHub.WorkflowAcceptance} = managerRef

        // ===== STEP 2: Register workflow in ForteHub (FIRST) =====
        let capabilities: {String: AnyStruct} = {}
        let configDefaults: {String: AnyStruct} = {}

        let workflowId = managerRef.registerWorkflow(
            name: "Test Workflow",
            category: "testing",
            description: "Test workflow for deployment verification",
            sourceCodeIPFS: "bafkreigftlphsovyldabycnm4bbilbmycaxa4kd4mgdpc5gewyor36bjmm",
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

        // ===== STEP 3: Instantiate workflow and add to ForteHub (SECOND) =====
        // Check if we already have it (unlikely since we just registered a new ID, but good practice)
        let workflowIds = managerRef.listWorkflowIds()
        if !workflowIds.contains(workflowId) {
            let config: {String: AnyStruct} = {
                "name": "Test Workflow",
                "category": "testing"
            }

            TestWorkflow.createWorkflow(
                workflowId: workflowId,
                config: config,
                manager: managerAcceptance,
                ticket: nil
            )
            log("Test workflow created and added to manager")
        } else {
            log("Test workflow already exists in manager")
        }
    }

    execute {
    }
}

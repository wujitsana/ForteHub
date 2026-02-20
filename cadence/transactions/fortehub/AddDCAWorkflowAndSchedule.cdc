/// AddDCAWorkflowAndSchedule.cdc
///
/// Add DCAAuto workflow instance to Manager and enable scheduling
/// (for already-registered workflow)

import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHub from 0xc2b9e41bc947f855
import DCAAuto from 0xd695aea7bfa88279

transaction(
    workflowId: UInt64,
    dcaAmount: UFix64,
    targetAccount: Address,
    schedulingFrequency: UFix64
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {

        // ===== STEP 0: Ensure FlowTransactionScheduler Manager exists =====
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

        // ===== STEP 1: Get ForteHub Manager reference =====
        let manager = signer.storage.borrow<&ForteHub.Manager>(from: ForteHub.ManagerStoragePath)
            ?? panic("ForteHub Manager not initialized")
        let managerAcceptance: &{ForteHub.WorkflowAcceptance} = manager

        // ===== STEP 2: Create and add workflow instance =====
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

        // ===== STEP 3: Schedule the workflow =====
        ForteHub.scheduleWorkflow(
            managerRef: manager,
            workflowId: workflowId,
            frequencySeconds: schedulingFrequency,
            account: signer
        )

        log("DCAAuto workflow scheduled successfully")
        log("  Workflow ID: ".concat(workflowId.toString()))
        log("  DCA Amount: ".concat(dcaAmount.toString()).concat(" FLOW"))
        log("  Target Account: ".concat(targetAccount.toString()))
        log("  Frequency: ".concat(schedulingFrequency.toString()).concat(" seconds (7 days)"))
    }
}

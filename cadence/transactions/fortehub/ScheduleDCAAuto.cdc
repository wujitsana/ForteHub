/// ScheduleDCAAuto.cdc
///
/// Enable scheduling for an already-deployed DCAAuto workflow
/// Registers the workflow with FlowTransactionScheduler for autonomous execution

import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import ForteHub from 0xbd4c3996265ed830

transaction(
    workflowId: UInt64,
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
        } else {
            log("FlowTransactionScheduler Manager already exists")
        }

        // ===== STEP 1: Get ForteHub Manager reference =====
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(from: ForteHub.ManagerStoragePath)
            ?? panic("ForteHub Manager not initialized")

        // ===== STEP 2: Schedule the workflow =====
        ForteHub.scheduleWorkflow(
            managerRef: managerRef,
            workflowId: workflowId,
            frequencySeconds: schedulingFrequency,
            account: signer
        )

        log("DCAAuto workflow scheduled successfully")
        log("  Workflow ID: ".concat(workflowId.toString()))
        log("  Frequency: ".concat(schedulingFrequency.toString()).concat(" seconds (7 days)"))
    }
}

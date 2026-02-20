/// DisableWorkflowScheduling.cdc
///
/// Disable autonomous scheduling for a deployed workflow
/// Stops the workflow from executing autonomously via FlowTransactionScheduler
/// Manual execution via ForteHub.run() is still available

import ForteHub from 0xbd4c3996265ed830
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6

transaction(
    workflowId: UInt64,
    taskId: UInt64
) {
    prepare(signer: auth(Storage) &Account) {

        // Get manager reference
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub not initialized")

        // Cancel the scheduled task with FlowTransactionScheduler
        let schedulerRef = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("FlowTransactionScheduler Manager not found")

        let taskToCancel <- schedulerRef.cancel(id: taskId)
        destroy taskToCancel

        // Clean up the workflow handler and manager metadata
        ForteHub.unscheduleWorkflow(
            managerRef: managerRef,
            workflowId: workflowId,
            account: signer
        )

        log("Workflow ".concat(workflowId.toString()).concat(" scheduling disabled"))
    }
}

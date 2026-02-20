/// EnableWorkflowScheduling.cdc
///
/// Enable autonomous scheduling for a deployed workflow
/// Must be called AFTER workflow is deployed and added to ForteHub

import ForteHub from 0xbd4c3996265ed830
import FlowTransactionScheduler from 0x8c5303eaa26202d6

transaction(
    workflowId: UInt64,
    frequencySeconds: UFix64
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {

        // Get manager reference
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub not initialized")

        // Register the handler and schedule with FlowTransactionScheduler
        // This function updates metadata and creates/registers handler with scheduler
        ForteHub.scheduleWorkflow(
            managerRef: managerRef,
            workflowId: workflowId,
            frequencySeconds: frequencySeconds,
            account: signer
        )

        log("Workflow ".concat(workflowId.toString()).concat(" scheduled with frequency ").concat(frequencySeconds.toString()).concat(" seconds"))
    }
}

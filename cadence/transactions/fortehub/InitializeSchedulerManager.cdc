/// InitializeSchedulerManager.cdc
///
/// Creates and saves a FlowTransactionScheduler Manager to the deployer's account
/// if one doesn't already exist. This must be run once before scheduling workflows.
///
/// This transaction:
/// 1. Checks if a scheduler manager already exists
/// 2. If not, creates one using FlowTransactionSchedulerUtils.createManager()
/// 3. Saves it to the standard manager storage path
/// 4. Creates and publishes a public capability for external access

import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"
import "FlowToken"
import "FungibleToken"

transaction {
    prepare(signer: auth(BorrowValue, IssueStorageCapabilityController, SaveValue, GetStorageCapabilityController, PublishCapability) &Account) {

        // Check if manager already exists
        if signer.storage.borrow<&AnyResource>(from: FlowTransactionSchedulerUtils.managerStoragePath) != nil {
            // Manager already exists, nothing to do
            log("Scheduler manager already initialized at ".concat(FlowTransactionSchedulerUtils.managerStoragePath.toString()))
            return
        }

        // Create a new scheduler manager
        let manager <- FlowTransactionSchedulerUtils.createManager()

        // Save to the standard FlowTransactionSchedulerUtils storage path
        signer.storage.save(<-manager, to: FlowTransactionSchedulerUtils.managerStoragePath)

        // Create a public capability for the Manager
        // This allows ForteHub and other contracts to reference it
        let managerCapPublic = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
            FlowTransactionSchedulerUtils.managerStoragePath
        )
        signer.capabilities.publish(managerCapPublic, at: FlowTransactionSchedulerUtils.managerPublicPath)

        // Create a capability with Owner entitlement for internal use
        let managerCapOwner = signer.capabilities.storage.issue<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            FlowTransactionSchedulerUtils.managerStoragePath
        )
        signer.capabilities.publish(managerCapOwner, at: /public/flowTransactionSchedulerManager)

        log("Scheduler manager initialized successfully at ".concat(FlowTransactionSchedulerUtils.managerStoragePath.toString()))
    }
}

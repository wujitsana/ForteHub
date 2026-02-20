transaction {
    prepare(signer: auth(Storage) &Account) {
        // Path from ForteHub.cdc
        let managerPath = /storage/ForteHubManager
        
        if signer.storage.check<@AnyResource>(from: managerPath) {
            let res <- signer.storage.load<@AnyResource>(from: managerPath)
            destroy res
            log("Destroyed ForteHub Manager and all contents")
        } else {
            log("No ForteHub Manager found")
        }

        // Also check for FlowTransactionScheduler Manager
        let schedulerPath = /storage/flowTransactionSchedulerManager
        if signer.storage.check<@AnyResource>(from: schedulerPath) {
            let res <- signer.storage.load<@AnyResource>(from: schedulerPath)
            destroy res
            log("Destroyed FlowTransactionScheduler Manager")
        }
    }
}

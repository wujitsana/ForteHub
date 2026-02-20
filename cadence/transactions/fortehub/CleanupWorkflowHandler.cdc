/// CleanupForteHubTransactionHandler.cdc
///
/// Remove an existing workflow handler from storage to allow rescheduling

transaction(workflowId: UInt64) {
    prepare(signer: auth(Storage) &Account) {
        let handlerPath = StoragePath(identifier: "ForteHubWorkFlow_".concat(workflowId.toString()).concat("_Handler"))!

        if signer.storage.check<@AnyResource>(from: handlerPath) {
            let old <- signer.storage.load<@AnyResource>(from: handlerPath)
            destroy old
            log("Cleaned up workflow handler for workflow ID: ".concat(workflowId.toString()))
        } else {
            log("No handler found at path for workflow ID: ".concat(workflowId.toString()))
        }
    }
}

/// CleanupOldHandler.cdc
///
/// Remove old workflowHandler from storage before updating contract
/// (Old storage path: /storage/workflowHandler{id})

transaction(workflowId: UInt64) {
    prepare(signer: auth(Storage) &Account) {
        // Clean up old handler with old storage path name
        let oldHandlerPath = StoragePath(identifier: "workflowHandler".concat(workflowId.toString()))!

        if signer.storage.check<@AnyResource>(from: oldHandlerPath) {
            let old <- signer.storage.load<@AnyResource>(from: oldHandlerPath)
            destroy old
            log("Cleaned up old workflowHandler at path: workflowHandler".concat(workflowId.toString()))
        } else {
            log("No old handler found at workflowHandler".concat(workflowId.toString()))
        }
    }
}

import ForteHub from 0xc2b9e41bc947f855

/// Locks cloning for a workflow owned by the caller (creator only).
transaction(workflowId: UInt64) {
    prepare(signer: auth(Storage) &Account) {
        let manager = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub Manager not initialized")

        manager.lockWorkflowClones(workflowId: workflowId)
        log("Workflow ".concat(workflowId.toString()).concat(" is now clone-locked"))
    }
}

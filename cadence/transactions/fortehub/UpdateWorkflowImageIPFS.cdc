import ForteHub from 0xbd4c3996265ed830

transaction(
    workflowId: UInt64,
    creator: Address,
    newImageIPFS: String?
) {
    execute {
        ForteHub.updateImageIPFS(
            workflowId: workflowId,
            creator: creator,
            newImageIPFS: newImageIPFS
        )

        let imageDisplay = newImageIPFS == nil ? "removed" : newImageIPFS!
        log("Updated workflow ".concat(workflowId.toString()).concat(" image IPFS to: ").concat(imageDisplay))
    }
}

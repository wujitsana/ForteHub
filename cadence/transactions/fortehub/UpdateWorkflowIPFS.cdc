import ForteHub from 0xbd4c3996265ed830

transaction(
    workflowId: UInt64,
    creator: Address,
    newSourceCodeIPFS: String,
    newSourceCodeHash: String
) {
    execute {
        ForteHub.updateSourceCodeIPFS(
            workflowId: workflowId,
            creator: creator,
            newSourceCodeIPFS: newSourceCodeIPFS,
            newSourceCodeHash: newSourceCodeHash
        )
        log("Updated workflow ".concat(workflowId.toString()).concat(" with IPFS CID: ").concat(newSourceCodeIPFS))
    }
}

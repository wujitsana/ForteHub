import ForteHub from 0xbd4c3996265ed830

transaction(
    workflowId: UInt64,
    creator: Address
) {
    execute {
        ForteHub.lockImageIPFS(
            workflowId: workflowId,
            creator: creator
        )

        log("Workflow ".concat(workflowId.toString()).concat(" image IPFS is now permanently locked"))
    }
}

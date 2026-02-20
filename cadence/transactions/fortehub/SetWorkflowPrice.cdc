import ForteHub from 0xbd4c3996265ed830

transaction(
    workflowId: UInt64,
    creator: Address,
    newPrice: UFix64?
) {
    execute {
        ForteHub.setWorkflowPrice(
            workflowId: workflowId,
            creator: creator,
            newPrice: newPrice
        )

        let priceDisplay = newPrice == nil ? "free" : newPrice.toString().concat(" FLOW")
        log("Updated workflow ".concat(workflowId.toString()).concat(" price to: ").concat(priceDisplay))
    }
}

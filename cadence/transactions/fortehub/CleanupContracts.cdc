transaction {
    prepare(signer: auth(RemoveContract) &Account) {
        // Try removing FlowTransferScheduled first (likely dependent)
        if signer.contracts.get(name: "FlowTransferScheduled") != nil {
            signer.contracts.remove(name: "FlowTransferScheduled")
            log("Removed FlowTransferScheduled")
        }
        
        // Then TestWorkflow
        if signer.contracts.get(name: "TestWorkflow") != nil {
            signer.contracts.remove(name: "TestWorkflow")
            log("Removed TestWorkflow")
        }
        
        // Then DCAAuto
        if signer.contracts.get(name: "DCAAuto") != nil {
            signer.contracts.remove(name: "DCAAuto")
            log("Removed DCAAuto")
        }

        // Then ForteHubRegistry (assuming it depends on ForteHub)
        if signer.contracts.get(name: "ForteHubRegistry") != nil {
            signer.contracts.remove(name: "ForteHubRegistry")
             log("Removed ForteHubRegistry")
        }

        // Finally ForteHub
        if signer.contracts.get(name: "ForteHub") != nil {
            signer.contracts.remove(name: "ForteHub")
             log("Removed ForteHub")
        }
    }
}

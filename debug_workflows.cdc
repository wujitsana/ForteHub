import ForteHub from 0xc2b9e41bc947f855

access(all) fun main(): {String: AnyStruct} {
    let publicIds = ForteHub.listPublicWorkflows()
    let allIds = ForteHub.listAllWorkflows()
    
    let details: {UInt64: ForteHub.WorkflowInfo} = {}
    
    for id in allIds {
        if let info = ForteHub.getWorkflowInfo(workflowId: id) {
            details[id] = info
        }
    }

    return {
        "publicIds": publicIds,
        "allIds": allIds,
        "details": details
    }
}

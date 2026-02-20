import ForteHubRegistry from 0xd695aea7bfa88279

access(all) fun main(workflowId: UInt64): AnyStruct {
    return ForteHubRegistry.getWorkflowInfo(workflowId: workflowId)
}

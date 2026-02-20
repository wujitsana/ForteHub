import ForteHub from 0xc2b9e41bc947f855

access(all) fun main(address: Address): [ForteHub.WorkflowInfo] {
    let workflows: [ForteHub.WorkflowInfo] = []
    let account = getAccount(address)
    let cap = account.capabilities.get<&ForteHub.Manager>(/public/forteHubManager)
    if let manager = cap.borrow() {
        let clonedIds = manager.listWorkflowIds()
        return workflows
    }
    return []
}

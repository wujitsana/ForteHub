import ForteHub from 0xc2b9e41bc947f855

access(all) fun main(address: Address): [UInt64] {
    let account = getAccount(address)
    let manager = account.capabilities.get<&ForteHub.Manager>(ForteHub.FORTEHUB_MANAGER_PUBLIC)
        .borrow()
        ?? panic("Could not borrow manager")
    
    return manager.listWorkflowIds()
}

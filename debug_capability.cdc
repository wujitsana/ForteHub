import ForteHub from 0xc2b9e41bc947f855

access(all) fun main(address: Address): Bool {
    let account = getAccount(address)
    let cap = account.capabilities.get<&ForteHub.Manager>(/public/forteHubManager)
    return cap.check()
}

import ForteHub from 0xd695aea7bfa88279

access(all) fun main(managerAddress: Address): UFix64 {
    let account = getAccount(managerAddress)
    let managerRef = account.capabilities.get<&ForteHub.Manager>(
        ForteHub.FORTEHUB_MANAGER_PUBLIC
    ).borrow() ?? panic("Manager capability not found or cannot borrow")

    return managerRef.getSchedulingFeeBalance()
}

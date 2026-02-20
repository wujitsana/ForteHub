/// Update Registry Address in Manager
///
/// Allows updating the registry address in case it changes during testing or upgrades
/// Only the account owner can call this

import ForteHub from 0xbd4c3996265ed830

transaction(newRegistryAddress: Address) {
    prepare(signer: auth(BorrowValue) &Account) {
        // Get manager reference
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub Manager not initialized")

        // Update registry address
        managerRef.updateRegistryAddress(newRegistryAddress: newRegistryAddress)

        log("Manager registry address updated to: ".concat(newRegistryAddress.toString()))
    }
}

/// InitializeManager.cdc
///
/// Initializes ForteHub in the signer's account (idempotent)
/// Safe to call multiple times - only creates manager if it doesn't exist
///
/// USAGE (CLI wallet):
/// flow transactions send cadence/transactions/fortehub/InitializeManager.cdc \
///   --network testnet \
///   --signer fortehub

import ForteHub from 0xc2b9e41bc947f855

transaction {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Call the idempotent initialization function
        // This will only create the Manager if it doesn't already exist
        ForteHub.initializeManager(account: signer)
        
        // Ensure capability is linked
        // First unlink if it exists (to handle stale links)
        if signer.capabilities.get<&ForteHub.Manager>(ForteHub.FORTEHUB_MANAGER_PUBLIC).check() == false {
             // If check() is false, it might be missing OR invalid. 
             // We can't easily check existence of link without borrowing or checking, but we can just try to unlink.
             // Actually, 'publish' fails if path is taken.
             // Let's just unlink blindly if we can, or check if we can borrow.
        }
        
        // Unlink any existing capability at the public path to be safe
        signer.capabilities.unpublish(ForteHub.FORTEHUB_MANAGER_PUBLIC)

        let cap = signer.capabilities.storage.issue<&ForteHub.Manager>(ForteHub.FORTEHUB_MANAGER_STORAGE)
        signer.capabilities.publish(cap, at: ForteHub.FORTEHUB_MANAGER_PUBLIC)
        
        log("ForteHub initialization and capability linking complete")
    }
}

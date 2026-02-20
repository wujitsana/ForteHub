import ForteHubMarket from 0xc2b9e41bc947f855

access(all) let LISTING_STORAGE_PATH = /storage/forteHubMarketListings
access(all) let LISTING_PUBLIC_PATH = /public/forteHubMarketListings

/// Saves a ForteHubMarket.ListingCollection in the caller's account and publishes a public capability.
transaction() {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        if signer.storage.check<@ForteHubMarket.ListingCollection>(from: LISTING_STORAGE_PATH) {
            panic("Listing collection already initialized")
        }

        let collection <- ForteHubMarket.createListingCollection(owner: signer.address)
        signer.storage.save(<-collection, to: LISTING_STORAGE_PATH)

        if signer.capabilities.borrow<&{ForteHubMarket.ListingCollectionPublic}>(LISTING_PUBLIC_PATH) != nil {
            signer.capabilities.unpublish(LISTING_PUBLIC_PATH)
        }

        let publicCap = signer.capabilities.storage.issue<&{ForteHubMarket.ListingCollectionPublic}>(LISTING_STORAGE_PATH)
        signer.capabilities.publish(publicCap, at: LISTING_PUBLIC_PATH)

        log("Listing collection initialized for ".concat(signer.address.toString()))
    }
}

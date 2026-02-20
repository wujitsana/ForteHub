import ForteHub from 0xc2b9e41bc947f855
import ForteHubMarket from 0xc2b9e41bc947f855

access(all) let LISTING_STORAGE_PATH = /storage/forteHubMarketListings

/// Removes a workflow token from the caller's manager and lists it for sale in ForteHubMarket.
transaction(workflowId: UInt64, price: UFix64) {
    prepare(signer: auth(Storage) &Account) {
        pre {
            price >= 0.0 : "Price must be >= 0"
        }

        let manager = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub Manager not initialized")

        let workflowToken <- manager.removeWorkflow(
            workflowId: workflowId,
            account: signer
        )

        let listings = signer.storage.borrow<&ForteHubMarket.ListingCollection>(
            from: LISTING_STORAGE_PATH
        ) ?? panic("Listing collection not found. Run InitializeListingCollection first.")

        let listingId = listings.createListing(workflow: <-workflowToken, price: price)

        log(
            "Workflow "
                .concat(workflowId.toString())
                .concat(" listed as ID ")
                .concat(listingId.toString())
                .concat(" for ")
                .concat(price.toString())
                .concat(" FLOW")
        )
    }
}

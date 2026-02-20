import ForteHub from 0xbd4c3996265ed830
import ForteHubMarket from 0xbd4c3996265ed830

pub let LISTING_STORAGE_PATH = /storage/forteHubMarketListings

/// Cancels a listing and re-deposits the workflow token into the caller's manager.
transaction(listingId: UInt64) {
    prepare(signer: auth(Storage) &Account) {
        let listings = signer.storage.borrow<&ForteHubMarket.ListingCollection>(
            from: LISTING_STORAGE_PATH
        ) ?? panic("Listing collection not found")

        let workflowToken <- listings.withdrawListing(listingId: listingId)

        let manager = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub Manager not initialized")

        manager.depositWorkflow(token: <-workflowToken)

        log("Listing ".concat(listingId.toString()).concat(" withdrawn and workflow redeposited"))
    }
}

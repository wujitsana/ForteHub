import ForteHubMarket from 0xc2b9e41bc947f855

access(all) let LISTING_PUBLIC_PATH = /public/forteHubMarketListings

access(all) fun main(seller: Address, listingId: UInt64): ForteHubMarket.ListingDetails? {
    let listingCap = getAccount(seller).capabilities.get<&{ForteHubMarket.ListingCollectionPublic}>(
        LISTING_PUBLIC_PATH
    ) ?? panic("Listing capability not found for seller")

    let collection = listingCap.borrow()
        ?? panic("Unable to borrow listing collection")

    return collection.borrowListingDetails(listingId: listingId)
}

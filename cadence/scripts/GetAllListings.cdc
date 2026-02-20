import ForteHubMarket

access(all) fun main(): [ForteHubMarket.ListingDetails] {
    let ids = ForteHubMarket.getListingIDs()
    let listings: [ForteHubMarket.ListingDetails] = []
    for id in ids {
        if let listing = ForteHubMarket.getListing(listingID: id) {
            listings.append(listing)
        }
    }
    return listings
}

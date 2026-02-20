import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import ForteHub from 0xc2b9e41bc947f855
import ForteHubMarket from 0xc2b9e41bc947f855

access(all) let LISTING_PUBLIC_PATH = /public/forteHubMarketListings

/// Purchases a listing from ForteHubMarket and deposits the workflow token into the caller's manager.
transaction(
    seller: Address,
    listingId: UInt64,
    expectedPrice: UFix64
) {
    prepare(signer: auth(Storage, Capabilities, Withdraw) &Account) {
        let flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("FLOW vault not found")

        let payment <- flowVault.withdraw(amount: expectedPrice)

        let manager = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub Manager not initialized")

        let listingCap = getAccount(seller).capabilities.get<&{ForteHubMarket.ListingCollectionPublic}>(
            LISTING_PUBLIC_PATH
        ) ?? panic("Seller listing capability not published")

        let listingCollection = listingCap.borrow()
            ?? panic("Unable to borrow seller listing collection")

        listingCollection.purchase(
            listingId: listingId,
            payment: <-payment,
            buyerManager: manager,
            buyerAddress: signer.address
        )

        log("Purchased listing ".concat(listingId.toString()).concat(" from ").concat(seller.toString()))
    }
}

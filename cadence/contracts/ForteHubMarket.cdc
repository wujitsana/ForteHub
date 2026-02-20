import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import ForteHub from 0xc2b9e41bc947f855

access(all) contract ForteHubMarket {

    // -------- Events --------
    access(all) event ListingCreated(listingId: UInt64, workflowId: UInt64, price: UFix64, seller: Address)
    access(all) event ListingPriceUpdated(listingId: UInt64, newPrice: UFix64)
    access(all) event ListingCancelled(listingId: UInt64, workflowId: UInt64, seller: Address)
    access(all) event ListingPurchased(
        listingId: UInt64,
        workflowId: UInt64,
        price: UFix64,
        seller: Address,
        buyer: Address,
        platformFeePaid: UFix64
    )

    // -------- Config --------
    access(self) var nextListingId: UInt64
    access(self) var platformFeePercent: UFix64
    access(self) var feeCollector: Address

    access(all) let MAX_PLATFORM_FEE: UFix64

    // -------- Read Models --------
    access(all) struct ListingDetails {
        access(all) let listingId: UInt64
        access(all) let workflowId: UInt64
        access(all) let price: UFix64
        access(all) let seller: Address

        init(listingId: UInt64, workflowId: UInt64, price: UFix64, seller: Address) {
            self.listingId = listingId
            self.workflowId = workflowId
            self.price = price
            self.seller = seller
        }
    }

    // -------- Listing Resource --------
    access(all) resource Listing {
        access(all) let listingId: UInt64
        access(all) let workflowId: UInt64
        access(all) var price: UFix64
        access(all) let seller: Address
        access(self) var workflow: @ForteHub.WorkflowToken?

        init(
            listingId: UInt64,
            workflowId: UInt64,
            price: UFix64,
            seller: Address,
            workflow: @ForteHub.WorkflowToken
        ) {
            pre {
                price >= 0.0 : "Price must be >= 0"
            }
            self.listingId = listingId
            self.workflowId = workflowId
            self.price = price
            self.seller = seller
            self.workflow <- workflow
        }

        access(contract) fun setPrice(newPrice: UFix64) {
            self.price = newPrice
        }

        access(contract) fun purchase(
            payment: @FlowToken.Vault,
            buyerManager: &{ForteHub.WorkflowAcceptance},
            buyerAddress: Address,
            platformFeePercent: UFix64,
            feeCollector: Address
        ) {
            if payment.balance != self.price {
                panic("Payment amount mismatch")
            }

            let platformFee: UFix64 = self.price * platformFeePercent
            let sellerAmount: UFix64 = self.price - platformFee

            if sellerAmount > 0.0 {
                let sellerPortion <- payment.withdraw(amount: sellerAmount)
                let sellerReceiver = getAccount(self.seller).capabilities
                    .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                    ?? panic("Seller FLOW receiver capability not found")
                sellerReceiver.deposit(from: <-sellerPortion)
            }

            if platformFee > 0.0 {
                let feePortion <- payment.withdraw(amount: platformFee)
                let feeReceiver = getAccount(feeCollector).capabilities
                    .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                    ?? panic("Fee collector FLOW receiver capability not found")
                feeReceiver.deposit(from: <-feePortion)
            }

            destroy payment

            let workflowToken <- self.workflow <- nil
            let token <- workflowToken ?? panic("Listing empty")

            buyerManager.depositWorkflow(token: <-token)

            emit ListingPurchased(
                listingId: self.listingId,
                workflowId: self.workflowId,
                price: self.price,
                seller: self.seller,
                buyer: buyerAddress,
                platformFeePaid: platformFee
            )
        }

        access(contract) fun withdrawWorkflow(): @ForteHub.WorkflowToken {
            if let workflow <- self.workflow <- nil {
                return <-workflow
            }
            panic("Listing empty")
        }
    }

    // -------- Listing Collection Interfaces --------
    access(all) resource interface ListingCollectionPublic {
        access(all) fun borrowListingDetails(listingId: UInt64): ListingDetails?
        access(all) fun getActiveListingIds(): [UInt64]
        access(all) fun purchase(
            listingId: UInt64,
            payment: @FlowToken.Vault,
            buyerManager: &{ForteHub.WorkflowAcceptance},
            buyerAddress: Address
        )
    }

    access(all) resource ListingCollection: ListingCollectionPublic {
        access(self) var listings: @{UInt64: Listing}
        access(all) let listingOwner: Address

        init(owner: Address) {
            self.listingOwner = owner
            self.listings <- {}
        }
        access(all) fun createListing(workflow: @ForteHub.WorkflowToken, price: UFix64): UInt64 {
            let listingId = ForteHubMarket.nextListingId
            ForteHubMarket.nextListingId = listingId + 1

            let listing <- create Listing(
                listingId: listingId,
                workflowId: workflow.workflowId,
                price: price,
                seller: self.listingOwner,
                workflow: <-workflow
            )

            let workflowId = listing.workflowId
            let listingPrice = listing.price

            let existingListing <- self.listings.insert(key: listingId, <-listing)
            destroy existingListing

            emit ListingCreated(
                listingId: listingId,
                workflowId: workflowId,
                price: listingPrice,
                seller: self.listingOwner
            )

            // Add to global registry
            ForteHubMarket.addListing(id: listingId, details: ListingDetails(
                listingId: listingId,
                workflowId: workflowId,
                price: listingPrice,
                seller: self.listingOwner
            ))

            return listingId
        }

        access(all) fun withdrawListing(listingId: UInt64): @ForteHub.WorkflowToken {
            let listing <- self.listings.remove(key: listingId)
                ?? panic("Listing not found")

            if listing.seller != self.listingOwner {
                panic("Only seller can withdraw listing")
            }

            let workflow <- listing.withdrawWorkflow()
            destroy listing

            emit ListingCancelled(
                listingId: listingId,
                workflowId: workflow.workflowId,
                seller: self.listingOwner
            )

            // Remove from global registry
            ForteHubMarket.removeListing(id: listingId)

            return <-workflow
        }

        access(all) fun updateListingPrice(listingId: UInt64, newPrice: UFix64) {
            pre {
                newPrice >= 0.0 : "Price must be >= 0"
            }
            let listingRef = &self.listings[listingId] as &Listing?
                ?? panic("Listing not found")
            listingRef.setPrice(newPrice: newPrice)
            emit ListingPriceUpdated(listingId: listingId, newPrice: newPrice)
        }

        access(all) fun borrowListingDetails(listingId: UInt64): ListingDetails? {
            if let listingRef = &self.listings[listingId] as &Listing? {
                return ListingDetails(
                    listingId: listingRef.listingId,
                    workflowId: listingRef.workflowId,
                    price: listingRef.price,
                    seller: listingRef.seller
                )
            }
            return nil
        }

        access(all) fun getActiveListingIds(): [UInt64] {
            return self.listings.keys
        }

        access(all) fun purchase(
            listingId: UInt64,
            payment: @FlowToken.Vault,
            buyerManager: &{ForteHub.WorkflowAcceptance},
            buyerAddress: Address
        ) {
            let listing <- self.listings.remove(key: listingId)
                ?? panic("Listing not found")

            listing.purchase(
                payment: <-payment,
                buyerManager: buyerManager,
                buyerAddress: buyerAddress,
                platformFeePercent: ForteHubMarket.platformFeePercent,
                feeCollector: ForteHubMarket.feeCollector
            )

            destroy listing

            // Remove from global registry
            ForteHubMarket.removeListing(id: listingId)
        }
    }

    // -------- Public Helpers --------
    access(all) fun createListingCollection(owner: Address): @ListingCollection {
        return <-create ListingCollection(owner: owner)
    }

    access(all) fun getPlatformFeePercent(): UFix64 {
        return self.platformFeePercent
    }

    access(all) fun getFeeCollector(): Address {
        return self.feeCollector
    }

    access(account) fun setPlatformFeePercent(newPercent: UFix64) {
        pre {
            newPercent >= 0.0 && newPercent <= self.MAX_PLATFORM_FEE : "Fee percent out of range"
        }
        self.platformFeePercent = newPercent
    }

    access(account) fun setFeeCollector(newCollector: Address) {
        self.feeCollector = newCollector
    }

    // -------- Global Listing Tracking --------
    access(self) var activeListings: {UInt64: ListingDetails}

    access(contract) fun addListing(id: UInt64, details: ListingDetails) {
        self.activeListings[id] = details
    }

    access(contract) fun removeListing(id: UInt64) {
        self.activeListings.remove(key: id)
    }

    access(all) fun getListingIDs(): [UInt64] {
        return self.activeListings.keys
    }

    access(all) fun getListing(listingID: UInt64): ListingDetails? {
        return self.activeListings[listingID]
    }

    init() {
        self.nextListingId = 1
        self.platformFeePercent = 0.02
        self.feeCollector = self.account.address
        self.MAX_PLATFORM_FEE = 0.20 // 20%
        self.activeListings = {}
    }
}

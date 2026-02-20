
const FORTEHUB_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_FORTEHUB_MARKET_ADDRESS || '0xbd4c3996265ed830').replace('0X', '0x');
const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');
const FLOW_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_FLOW_TOKEN_ADDRESS || '0x7e60df042a9c0868').replace('0X', '0x');
const FUNGIBLE_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_FUNGIBLE_TOKEN_ADDRESS || '0x9a0766d93b6608b7').replace('0X', '0x');

export const createListingTransaction = `
import ForteHub from ${FORTEHUB_REGISTRY}
import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

transaction(workflowId: UInt64, price: UFix64) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // 1. Check/Create ListingCollection
        if signer.storage.borrow<&ForteHubMarket.ListingCollection>(from: /storage/fortehubMarketCollection) == nil {
            let collection <- ForteHubMarket.createListingCollection(owner: signer.address)
            signer.storage.save(<-collection, to: /storage/fortehubMarketCollection)
            
            // Create public capability
            let cap = signer.capabilities.storage.issue<&ForteHubMarket.ListingCollection>(/storage/fortehubMarketCollection)
            signer.capabilities.publish(cap, at: /public/fortehubMarketCollection)
        }

        // 2. Borrow Manager to withdraw workflow
        let manager = signer.storage.borrow<&ForteHub.Manager>(from: ForteHub.FORTEHUB_MANAGER_STORAGE)
            ?? panic("Could not borrow manager")

        // 3. Withdraw workflow token (removes and unschedules)
        let token <- manager.removeWorkflow(workflowId: workflowId, account: signer)

        // 4. Borrow ListingCollection
        let marketCollection = signer.storage.borrow<&ForteHubMarket.ListingCollection>(from: /storage/fortehubMarketCollection)
            ?? panic("Could not borrow listing collection")

        // 5. Create Listing
        marketCollection.createListing(workflow: <-token, price: price)
    }
}
`;

export const purchaseListingTransaction = `
import FlowToken from ${FLOW_TOKEN_ADDRESS}
import FungibleToken from ${FUNGIBLE_TOKEN_ADDRESS}
import ForteHub from ${FORTEHUB_REGISTRY}
import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

transaction(listingId: UInt64, sellerAddress: Address, price: UFix64) {
    prepare(signer: auth(BorrowValue, SaveValue, Capabilities) &Account) {
        // 1. Setup Buyer's Manager if needed
        if signer.storage.borrow<&ForteHub.Manager>(from: ForteHub.FORTEHUB_MANAGER_STORAGE) == nil {
            let manager <- ForteHub.createManager(ownerAddress: signer.address)
            signer.storage.save(<-manager, to: ForteHub.FORTEHUB_MANAGER_STORAGE)
            
            let cap = signer.capabilities.storage.issue<&ForteHub.Manager>(ForteHub.FORTEHUB_MANAGER_STORAGE)
            signer.capabilities.publish(cap, at: ForteHub.FORTEHUB_MANAGER_PUBLIC)
        }

        // 2. Get Payment Vault
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Could not borrow FlowToken vault")

        let payment <- vaultRef.withdraw(amount: price) as! @FlowToken.Vault

        // 3. Get Buyer's Manager Capability
        let buyerManagerCap = signer.capabilities.get<&ForteHub.Manager>(ForteHub.FORTEHUB_MANAGER_PUBLIC)
        let buyerManager = buyerManagerCap.borrow() ?? panic("Could not borrow buyer manager")

        // 4. Get Seller's Market Collection
        let marketCollection = getAccount(sellerAddress)
            .capabilities.get<&ForteHubMarket.ListingCollection>(/public/fortehubMarketCollection)
            .borrow()
            ?? panic("Could not borrow seller's listing collection")

        // 5. Check if Buyer already owns this workflow
        let details = marketCollection.borrowListingDetails(listingId: listingId)
            ?? panic("Listing not found")
        
        let myWorkflowIds = buyerManager.listWorkflowIds()
        if myWorkflowIds.contains(details.workflowId) {
            panic("You already own this workflow")
        }

        // 6. Purchase
        marketCollection.purchase(
            listingId: listingId,
            payment: <-payment,
            buyerManager: buyerManager,
            buyerAddress: signer.address
        )
    }
}
`;

export const cancelListingTransaction = `
import ForteHub from ${FORTEHUB_REGISTRY}
import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

transaction(listingId: UInt64) {
    prepare(signer: auth(BorrowValue) &Account) {
        // 1. Borrow ListingCollection
        let marketCollection = signer.storage.borrow<&ForteHubMarket.ListingCollection>(from: /storage/fortehubMarketCollection)
            ?? panic("Could not borrow listing collection")

        // 2. Withdraw Listing (gets back the WorkflowToken)
        let token <- marketCollection.withdrawListing(listingId: listingId)

        // 3. Borrow Manager
        let manager = signer.storage.borrow<&ForteHub.Manager>(from: ForteHub.FORTEHUB_MANAGER_STORAGE)
            ?? panic("Could not borrow manager")

        // 4. Deposit back to Manager
        manager.depositWorkflow(token: <-token)
    }
}
`;

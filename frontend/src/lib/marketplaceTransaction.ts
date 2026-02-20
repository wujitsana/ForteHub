import { ComponentProps } from 'react';
import { TransactionButton } from '@onflow/react-sdk';

type TransactionConfig = ComponentProps<typeof TransactionButton>['transaction'];

const FORTEHUB_ADDRESS = process.env.NEXT_PUBLIC_FORTEHUB_ADDRESS || '0xc2b9e41bc947f855';
const FORTEHUB_MARKET_ADDRESS = process.env.NEXT_PUBLIC_FORTEHUB_MARKET_ADDRESS || '0xbd4c3996265ed830';

/**
 * Create a listing for a workflow on the marketplace
 * Seller must have the workflow resource in their ForteHub Manager
 */
export function buildListWorkflowTransaction(
  workflowId: number,
  price: string
): TransactionConfig {
  return {
    cadence: `
      import ForteHub from ${FORTEHUB_ADDRESS}
      import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

      transaction(workflowId: UInt64, price: UFix64) {
        let managerRef: &ForteHub.Manager
        let marketCollectionRef: &ForteHubMarket.ListingCollection

        prepare(signer: auth(Storage, Capabilities) &Account) {
          // Borrow ForteHub Manager
          self.managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
          ) ?? panic("ForteHub Manager not initialized")

          // Get or create listing collection
          let collectionPath = StoragePath(identifier: "ForteHubMarketListingCollection")!
          if !signer.storage.check<@ForteHubMarket.ListingCollection>(from: collectionPath) {
            let newCollection <- ForteHubMarket.createListingCollection(owner: signer.address)
            signer.storage.save(<-newCollection, to: collectionPath)
            let cap = signer.capabilities.storage.issue<&ForteHubMarket.ListingCollection>(collectionPath)
            signer.capabilities.publish(cap, at: /public/ForteHubMarketListingCollection)
          }

          self.marketCollectionRef = signer.storage.borrow<&ForteHubMarket.ListingCollection>(
            from: collectionPath
          ) ?? panic("Listing collection not found")
        }

        execute {
          // Remove workflow token from manager
          let workflowToken <- self.managerRef.removeWorkflow(workflowId: workflowId)

          // Create listing
          let listingId = self.marketCollectionRef.createListing(
            workflow: <-workflowToken,
            price: price
          )

          emit ListingCreated(listingId: listingId, workflowId: workflowId, price: price)
        }
      }
    `,
    args: (arg: any, t: any) => [
      arg(workflowId.toString(), t.UInt64),
      arg(price, t.UFix64)
    ]
  };
}

/**
 * Cancel a marketplace listing and get the workflow back
 */
export function buildUnlistWorkflowTransaction(listingId: number): TransactionConfig {
  return {
    cadence: `
      import ForteHub from ${FORTEHUB_ADDRESS}
      import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

      transaction(listingId: UInt64) {
        let managerRef: &ForteHub.Manager
        let marketCollectionRef: &ForteHubMarket.ListingCollection

        prepare(signer: auth(Storage, Capabilities) &Account) {
          // Borrow ForteHub Manager
          self.managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
          ) ?? panic("ForteHub Manager not initialized")

          // Borrow listing collection
          let collectionPath = StoragePath(identifier: "ForteHubMarketListingCollection")!
          self.marketCollectionRef = signer.storage.borrow<&ForteHubMarket.ListingCollection>(
            from: collectionPath
          ) ?? panic("Listing collection not found")
        }

        execute {
          // Withdraw workflow token from listing
          let workflowToken <- self.marketCollectionRef.withdrawListing(listingId: listingId)

          // Deposit back to manager
          self.managerRef.depositWorkflow(token: <-workflowToken)
        }
      }
    `,
    args: (arg: any, t: any) => [arg(listingId.toString(), t.UInt64)]
  };
}

/**
 * Update the price of an active listing
 */
export function buildUpdateListingPriceTransaction(
  listingId: number,
  newPrice: string
): TransactionConfig {
  return {
    cadence: `
      import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

      transaction(listingId: UInt64, newPrice: UFix64) {
        let marketCollectionRef: &ForteHubMarket.ListingCollection

        prepare(signer: auth(Storage) &Account) {
          let collectionPath = StoragePath(identifier: "ForteHubMarketListingCollection")!
          self.marketCollectionRef = signer.storage.borrow<&ForteHubMarket.ListingCollection>(
            from: collectionPath
          ) ?? panic("Listing collection not found")
        }

        execute {
          self.marketCollectionRef.updateListingPrice(
            listingId: listingId,
            newPrice: newPrice
          )
        }
      }
    `,
    args: (arg: any, t: any) => [
      arg(listingId.toString(), t.UInt64),
      arg(newPrice, t.UFix64)
    ]
  };
}

/**
 * Purchase a workflow from the marketplace
 */
export function buildPurchaseListingTransaction(
  listingId: number,
  price: string,
  sellerAddress: string
): TransactionConfig {
  return {
    cadence: `
      import FungibleToken from 0x9a0766d93b6608b7
      import FlowToken from 0x7e60df042a9c0868
      import ForteHub from ${FORTEHUB_ADDRESS}
      import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

      transaction(listingId: UInt64, price: UFix64, sellerAddress: Address) {
        let managerRef: &ForteHub.Manager
        let flowVault: @FlowToken.Vault
        let marketCollectionRef: &{ForteHubMarket.ListingCollectionPublic}

        prepare(signer: auth(Storage, Capabilities) &Account) {
          // Borrow ForteHub Manager
          self.managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
          ) ?? panic("ForteHub Manager not initialized")

          // Withdraw payment from FLOW vault
          let flowVaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
          ) ?? panic("FLOW vault not found")

          self.flowVault <- flowVaultRef.withdraw(amount: price) as! @FlowToken.Vault

          // Get marketplace collection from seller
          self.marketCollectionRef = getAccount(sellerAddress).capabilities
            .borrow<&{ForteHubMarket.ListingCollectionPublic}>(/public/ForteHubMarketListingCollection)
            ?? panic("Listing collection not found on seller")
        }

        execute {
          self.marketCollectionRef.purchase(
            listingId: listingId,
            payment: <-self.flowVault,
            buyerManager: self.managerRef,
            buyerAddress: self.account.address
          )
        }
      }
    `,
    args: (arg: any, t: any) => [
      arg(listingId.toString(), t.UInt64),
      arg(price, t.UFix64),
      arg(sellerAddress, t.Address)
    ]
  };
}

/**
 * Get details about an active listing
 */
export function buildGetListingDetailsQuery(
  sellerAddress: string,
  listingId: number
): string {
  return `
    import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

    access(all) fun main(sellerAddress: Address, listingId: UInt64): ForteHubMarket.ListingDetails? {
      let collectionRef = getAccount(sellerAddress).capabilities
        .borrow<&{ForteHubMarket.ListingCollectionPublic}>(/public/ForteHubMarketListingCollection)
        ?? panic("Listing collection not found")

      return collectionRef.borrowListingDetails(listingId: listingId)
    }
  `;
}

/**
 * Get all active listings from a seller
 */
export function buildGetSellerListingsQuery(sellerAddress: string): string {
  return `
    import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

    access(all) fun main(sellerAddress: Address): [UInt64] {
      let collectionRef = getAccount(sellerAddress).capabilities
        .borrow<&{ForteHubMarket.ListingCollectionPublic}>(/public/ForteHubMarketListingCollection)
        ?? return []

      return collectionRef.getActiveListingIds()
    }
  `;
}

/**
 * Get listing details with seller address
 */
export interface ListingWithSeller {
  listingId: number;
  workflowId: number;
  price: string;
  seller: string;
}

/**
 * Build query to get listing details from a specific seller
 */
export function buildGetSingleListingDetailsQuery(): string {
  return `
    import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

    access(all) struct ListingInfo {
      pub let listingId: UInt64
      pub let workflowId: UInt64
      pub let price: UFix64
      pub let seller: Address

      init(_ details: ForteHubMarket.ListingDetails, seller: Address) {
        self.listingId = details.listingId
        self.workflowId = details.workflowId
        self.price = details.price
        self.seller = seller
      }
    }

    access(all) fun main(sellerAddress: Address, listingId: UInt64): ListingInfo? {
      let collectionRef = getAccount(sellerAddress).capabilities
        .borrow<&{ForteHubMarket.ListingCollectionPublic}>(/public/ForteHubMarketListingCollection)
        ?? return nil

      if let details = collectionRef.borrowListingDetails(listingId: listingId) {
        return ListingInfo(details, seller: sellerAddress)
      }

      return nil
    }
  `;
}

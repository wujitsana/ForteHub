# ForteHub Marketplace Integration Guide

## Overview

This document outlines the marketplace features that have been integrated into ForteHub and provides guidance for completing the implementation.

## What's Been Implemented

### 1. **Landing Page Redirect** ✅
- Root path `/` now redirects to `/discover`
- Removed static landing page in favor of dynamic marketplace
- File: `frontend/src/app/page.tsx`

### 2. **Marketplace UI Redesign** ✅
- Modern card-based marketplace layout with beautiful design
- Responsive grid: 1 col mobile → 4 cols on XL screens
- Sticky header with quick access to "Create Workflow" button
- File: `frontend/src/app/discover/page.tsx`

### 3. **Marketplace Tabs** ✅
- **All Workflows**: Browse all available workflows with category filters
- **For Sale**: Placeholder for peer-to-peer marketplace listings (future)
- **Recently Sold**: Placeholder for sales history tracking (future)

### 4. **WorkflowCard Component** ✅
- Beautiful card design with:
  - Workflow thumbnail image with hover zoom effect
  - Like/favorite button
  - Category badge
  - Creator info
  - Clone/fork counts
  - Clone price display
  - Quick action buttons (View, Clone/Buy)
- File: `frontend/src/components/marketplace/WorkflowCard.tsx`

### 5. **PurchaseModal Component** ✅
- Modal dialog for marketplace purchases
- Shows workflow details, stats, and features
- Currently displays "Coming Soon" message
- Ready for payment flow implementation
- File: `frontend/src/components/marketplace/PurchaseModal.tsx`

### 6. **Marketplace Transaction Builders** ✅
- `buildListWorkflowTransaction()` - List workflow for sale
- `buildUnlistWorkflowTransaction()` - Cancel listing
- `buildUpdateListingPriceTransaction()` - Update listing price
- `buildPurchaseListingTransaction()` - Purchase workflow
- `buildGetListingDetailsQuery()` - Query listing info
- `buildGetSellerListingsQuery()` - Get seller's active listings
- File: `frontend/src/lib/marketplaceTransaction.ts`

### 7. **Type Definitions** ✅
- `MarketplaceListingDetails` - Listing data structure
- `MarketplaceEvent` - Event types for real-time updates
- `WorkflowWithListing` - Extended workflow with listing info
- File: `frontend/src/types/interfaces.ts`

## What's Next

### Phase 1: Real-Time Events (High Priority)
Implement live event listeners for marketplace activity:

```typescript
// Listen for ForteHubMarket contract events
useFlowEvents({
  eventType: 'A.{MARKET_ADDRESS}.ForteHubMarket.ListingCreated',
  onEvent: (event) => {
    // Update listings in real-time
    // Show "New listing" notifications
  }
});

// Event types:
// - ListingCreated: New workflow listed for sale
// - ListingPriceUpdated: Seller changed listing price
// - ListingCancelled: Listing removed
// - ListingPurchased: Workflow sold (includes buyer, seller, price)
```

**Files to Update:**
- `frontend/src/app/discover/page.tsx` - Add event listeners for "For Sale" tab
- Create `frontend/src/lib/marketplaceEvents.ts` - Event handling utilities

### Phase 2: "For Sale" Tab Implementation
Display active marketplace listings with real-time updates:

```typescript
// Query active listings from marketplace
// Use ForteHubMarket.getActiveListingIds() to get all listing IDs
// Group by seller using buildGetSellerListingsQuery()
// Display with live event updates
// Show "Add to Cart" or "Buy Now" functionality
```

**Key Features:**
- List all active for-sale workflows
- Sort by price, date listed, popularity
- Filter by category, seller, price range
- Show platform fee information
- Real-time price updates

### Phase 3: "Recently Sold" Tab
Track marketplace transaction history:

```typescript
// Listen for ListingPurchased events
// Store purchase history with:
// - Buyer/seller addresses
// - Final price + platform fee
// - Timestamp
// - Workflow details
```

**Display Options:**
- Recent sales activity feed
- Top-selling workflows
- Seller rankings
- Average sale prices

### Phase 4: Seller Dashboard Integration
Add marketplace controls to dashboard:

**List a Workflow:**
```typescript
// In dashboard, add "List for Sale" button
// Opens modal to set price
// Calls buildListWorkflowTransaction()
// Workflow moves from user's manager to marketplace listing
```

**Manage Listings:**
- View active listings
- Update prices with buildUpdateListingPriceTransaction()
- Cancel listings with buildUnlistWorkflowTransaction()
- View sales history and earnings

**Files to Update:**
- `frontend/src/app/dashboard/page.tsx` - Add listing management
- Create `frontend/src/components/marketplace/SellerListingsPanel.tsx`

### Phase 5: Purchase Flow
Complete the purchase experience:

```typescript
// In PurchaseModal:
// 1. Show listing details and platform fee breakdown
// 2. Check buyer's FLOW balance
// 3. Show payment confirmation
// 4. Call buildPurchaseListingTransaction()
// 5. Wait for transaction seal
// 6. Workflow appears in buyer's manager
// 7. Notify seller of sale
```

**File to Update:**
- `frontend/src/components/marketplace/PurchaseModal.tsx` - Add transaction logic

## Environment Variables

Add to `.env.local`:

```bash
NEXT_PUBLIC_FORTEHUB_ADDRESS=0xc2b9e41bc947f855
NEXT_PUBLIC_FORTEHUB_MARKET_ADDRESS=0xbd4c3996265ed830
NEXT_PUBLIC_FORTEHUB_REGISTRY=0xc2b9e41bc947f855
```

## Database/Indexing Considerations

For optimal performance with real-time marketplace:

### Option 1: Pure On-Chain (Current)
- Query marketplace contract directly
- Listen to Flow blockchain events
- Pro: Fully decentralized, no server needed
- Con: Slower queries, higher load on Flow nodes

### Option 2: Indexed Backend (Recommended)
- Run an indexer (e.g., The Graph, Flow indexer)
- Index `ListingCreated`, `ListingPurchased`, `ListingCancelled` events
- Store in database for fast queries
- Pro: Fast queries, rich analytics, better UX
- Con: Need to maintain indexer

**Suggested Indexer Setup:**
```sql
CREATE TABLE marketplace_listings (
  listing_id BIGINT PRIMARY KEY,
  workflow_id BIGINT,
  seller_address VARCHAR(66),
  price DECIMAL(20,8),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  status ENUM('active', 'cancelled', 'sold'),
  buyer_address VARCHAR(66) NULL,
  sold_at TIMESTAMP NULL,
  platform_fee DECIMAL(20,8) NULL
);

CREATE INDEX idx_workflow_id ON marketplace_listings(workflow_id);
CREATE INDEX idx_seller_address ON marketplace_listings(seller_address);
CREATE INDEX idx_status ON marketplace_listings(status);
CREATE INDEX idx_created_at ON marketplace_listings(created_at DESC);
```

## Testing Checklist

### Marketplace Listing
- [ ] User can list workflow with price
- [ ] Listing appears in "For Sale" tab
- [ ] ListingCreated event emitted
- [ ] Seller can update price
- [ ] Seller can cancel listing
- [ ] Workflow returns to seller's manager

### Marketplace Purchase
- [ ] Buyer can see for-sale workflows
- [ ] PurchaseModal shows correct details
- [ ] Buyer has sufficient FLOW balance check
- [ ] Transaction executes successfully
- [ ] Platform fee calculated correctly (e.g., 2%)
- [ ] Seller receives payment
- [ ] Platform collects fees
- [ ] Workflow appears in buyer's manager
- [ ] ListingPurchased event emitted

### Real-Time Updates
- [ ] "For Sale" tab updates instantly on new listing
- [ ] Price changes appear without page reload
- [ ] Listing disappears on purchase
- [ ] Notifications appear for activity

### Edge Cases
- [ ] Prevent listing workflow twice
- [ ] Prevent buying own workflow
- [ ] Handle insufficient balance gracefully
- [ ] Handle workflow deletion
- [ ] Clean up old/cancelled listings

## Architecture Decisions

### Why Resource-Based Listings?
- Workflows are Cadence resources, not fungible tokens
- Each listing holds the actual workflow resource
- Buyer receives the exact resource in their manager
- Seller can only list if they own the workflow

### Fee Distribution
- Platform takes percentage (default 2%)
- Seller gets remainder
- Both payments done atomically in one transaction
- Prevents partial payments or disputes

### Why Not NFTs?
- Workflows are already resources (like NFTs)
- Using MetadataViews for marketplace compatibility
- Future: Can add royalty views for secondary sales

## Known Limitations & Future Improvements

### Current Limitations
1. No batch operations (list multiple at once)
2. No auction mechanism
3. No offer/counter-offer system
4. No workflow bundling
5. Limited filtering/sorting

### Future Enhancements
1. **Auctions**: Time-based or ascending price
2. **Offers**: Users can make offers below asking price
3. **Collections**: Group related workflows
4. **Bundles**: Buy multiple workflows together
5. **Subscriptions**: Pay recurring fees for usage
6. **Royalties**: Creator earns from secondary sales
7. **Escrow**: Multi-sig approval for high-value sales
8. **Insurance**: Reputation/security scoring

## Related Files

### Frontend
- `frontend/src/app/discover/page.tsx` - Main marketplace page
- `frontend/src/components/marketplace/WorkflowCard.tsx` - Card component
- `frontend/src/components/marketplace/PurchaseModal.tsx` - Purchase UI
- `frontend/src/components/marketplace/SellerListingsPanel.tsx` - Seller dashboard (TBD)
- `frontend/src/lib/marketplaceTransaction.ts` - Transaction builders
- `frontend/src/lib/marketplaceEvents.ts` - Event handling (TBD)
- `frontend/src/types/interfaces.ts` - Type definitions

### Contracts
- `cadence/contracts/ForteHubMarket.cdc` - Marketplace contract
- `cadence/contracts/ForteHub.cdc` - Manager with removeWorkflow() + depositWorkflow()
- `cadence/contracts/ForteHubRegistry.cdc` - Workflow registry

### Utilities
- `frontend/src/services/ipfs.service.ts` - IPFS integration
- `frontend/src/lib/cloneUtils.ts` - Clone transaction builder
- `frontend/src/lib/deploymentTransaction.ts` - Deployment logic

## Questions & Discussion

### Should "For Sale" tab show creator's own listings?
- **Yes**: Allows sellers to manage active listings
- **No**: Avoid confusion, use dashboard instead
- **Current**: Not implemented yet

### Should we show bid/offer system?
- **Yes**: Allows price negotiation
- **No**: KISS principle, keep it simple
- **Current**: Purchase only, no offers

### How to handle royalties on secondary sales?
- Future enhancement
- Store royalty percentage in workflow metadata
- Distribute on each ListingPurchased event

---

**Last Updated**: 2025-01-13
**Status**: Phase 1-2 Ready, Phase 3-5 Planned
**Next Milestone**: Implement real-time event listeners for live marketplace updates

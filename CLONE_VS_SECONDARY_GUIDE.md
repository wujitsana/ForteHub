# Clone vs Secondary Market Sales - Implementation Guide

## Your Questions - Direct Answers

### Q1: Do you show clones and secondary sales separately?

**Answer: YES - And here's how:**

#### Current Implementation (Phase 1 ✅)
- **"All Workflows" tab**: Shows all public workflows for cloning
- Each card shows: Clone price (if set), clone count, [Clone] button

#### What We Need (Phase 2 🚀)
- **"Marketplace" tab**: Shows only workflows listed for sale
- Each card shows: Listing price (different from clone price), [Buy] button

#### Example on Discover Page

```
Tab: "All Workflows"
┌─────────────────────────────┐
│ Daily Rebalancer            │
│ Creator: 0xaaaa...xxxx      │
│                             │
│ Clone Price: 0.5 FLOW       │
│ Clones: 42 | Forks: 3       │
│ [View] [Clone]              │
└─────────────────────────────┘

Tab: "Marketplace Listings"
┌─────────────────────────────┐
│ Daily Rebalancer            │
│ Owner: 0xbbbb...yyyy        │
│                             │
│ Listing Price: 1.0 FLOW     │
│ Times Sold: 5               │
│ [View] [Buy]                │
└─────────────────────────────┘
```

**Key Difference**: Different creator, different price, different action

---

### Q2: What happens when you click "More Info" on a clone?

**Answer: Detail page shows BOTH clone and secondary market info**

#### Current Implementation (Phase 1 ✅)
When you click "View" on a workflow card → `/discover/[id]`

Shows:
```
Workflow Detail Page
├─ Header
│  ├─ Workflow name: "Daily Rebalancer"
│  ├─ Creator: 0xaaaa...xxxx
│  └─ Category badge: "Rebalancing"
│
├─ Primary Market Section
│  ├─ Clone Price: 0.5 FLOW
│  ├─ Total Clones: 42
│  ├─ Creation Date: Jan 10, 2025
│  └─ [Clone] button
│
├─ Description & Code
│  ├─ Full description
│  ├─ Source code (from IPFS)
│  └─ Creator info
│
└─ Secondary Market Section (COMING PHASE 2)
   ├─ Is it for sale? No / Listed at 1.0 FLOW
   ├─ Times sold: 3
   ├─ Average sale price: 0.95 FLOW
   └─ [Buy] or [List for Sale] button
```

#### Code Location
File: `frontend/src/app/discover/[id]/page.tsx`

#### What Needs to Be Added (Phase 2)
```typescript
// Query if this workflow is currently for sale
const listing = await queryMarketplaceListing(workflowId);

if (listing) {
  // Show secondary market info
  return <SecondaryMarketSection listing={listing} />;
} else {
  // Show "Not currently for sale" message
  return <NotForSaleSection />;
}

// Also show sales history
const salesHistory = await querySalesHistory(workflowId);
return <SalesHistorySection sales={salesHistory} />;
```

---

### Q3: What happens with secondary sale?

**Answer: Complete payment flow for buyer and seller**

#### Scenario: User Buys Workflow from Marketplace

```
1. User Sees Workflow for Sale
   ├─ Browse "Marketplace Listings" tab
   ├─ Find "Daily Rebalancer" for 1.0 FLOW
   ├─ Click "View" to see details
   └─ Click "Buy"

2. PurchaseModal Opens (Phase 2)
   ├─ Show workflow image + details
   ├─ Price: 1.0 FLOW
   ├─ Platform Fee: 0.02 FLOW (2%)
   ├─ Seller Gets: 0.98 FLOW
   ├─ Your Cost: 1.0 FLOW + gas
   └─ [Confirm Purchase]

3. Transaction Executes
   ├─ Withdraw 1.0 FLOW from buyer's wallet
   ├─ Transfer 0.98 FLOW to seller
   ├─ Transfer 0.02 FLOW to platform
   ├─ Transfer workflow resource to buyer
   └─ Delete listing from marketplace

4. Workflow Appears in Buyer's Manager
   ├─ Can be customized
   ├─ Can be executed
   ├─ Can be listed again for sale
   └─ Can be forked

5. Seller Sees Sale in Dashboard (Phase 3)
   ├─ Sale recorded in history
   ├─ Earnings increased by 0.98 FLOW
   ├─ Can see who bought it
   └─ Listing no longer available
```

#### Code Example (Phase 2)
```typescript
async function purchaseWorkflow(listingId: UInt64, price: UFix64) {
  // 1. Execute transaction
  const txId = await executeTransaction(
    buildPurchaseListingTransaction(listingId, price, sellerAddress)
  );

  // 2. Wait for seal
  const result = await waitForTransactionSeal(txId);

  if (result.status === 'SEALED') {
    // 3. Show success
    showNotification('Workflow purchased successfully!');

    // 4. Refresh buyer's workflows
    await refreshMyWorkflows();

    // 5. Close modal
    closePurchaseModal();
  }
}
```

---

### Q4: Where is the marketplace located?

**Answer: Multiple locations depending on what you want**

#### Main Marketplace
- **URL**: `https://fortehub.com/discover` (or just `/discover`)
- **What**: All public workflows you can clone

#### Marketplace Listings (Phase 2)
- **URL**: `https://fortehub.com/discover?tab=for-sale`
- **What**: Workflows listed for peer-to-peer sale

#### Workflow Details
- **URL**: `https://fortehub.com/discover/[workflowId]`
- **What**: Clone info + Secondary market info (Phase 2)

#### Seller Dashboard
- **URL**: `https://fortehub.com/dashboard`
- **What**: Manage your own workflows + active listings (Phase 2)

#### Create Workflow
- **URL**: `https://fortehub.com/create`
- **What**: Create new workflow (existing feature)

#### Site Map
```
fortehub.com/
├─ /discover (marketplace - All Workflows tab)
│  ├─ Marketplace Listings tab (Phase 2)
│  ├─ Recently Sold tab (Phase 3)
│  └─ /discover/[id] (workflow details)
│
├─ /create (create workflow)
│
├─ /dashboard (your workflows)
│  └─ [SellerListingsPanel] (Phase 2)
│
└─ / (redirects to /discover)
```

---

## Implementation Roadmap

### Phase 1 (✅ Complete)
- Create marketplace UI
- Show all workflows
- Category filtering
- Clone functionality
- Beautiful card design

### Phase 2 (🚀 Ready)

**Priority 1: Distinguish Clone vs Secondary Sales**
- [ ] Add "Marketplace Listings" tab to discover page
- [ ] Query ForteHubMarket for active listings
- [ ] Show different cards for listings (with listing price, [Buy] button)
- [ ] Add "For Sale" badge to cards that are listed

**Priority 2: Enhance Detail Page**
- [ ] Query if workflow is for sale
- [ ] Show listing price and seller info
- [ ] Show sales count and history
- [ ] Add [Buy] button if for sale
- [ ] Add "List for Sale" button if you own it

**Priority 3: Complete Purchase Flow**
- [ ] Implement transaction in PurchaseModal
- [ ] Add payment handling
- [ ] Show success notification
- [ ] Update buyer's dashboard

**Priority 4: Seller Tools**
- [ ] Integrate SellerListingsPanel to dashboard
- [ ] Implement list workflow modal
- [ ] Show active listings
- [ ] Add price update UI

### Phase 3 (📊 Planned)
- Track sales history
- Show "Recently Sold" tab
- Creator rankings
- Sales analytics

---

## Code Flow Diagrams

### Cloning Flow (Currently Working ✅)
```
User sees workflow in "All Workflows" tab
         ↓
Clicks "Clone"
         ↓
Configures parameters (if any)
         ↓
Confirms transaction
         ↓
LLM-generated contract imported
         ↓
Workflow resource instantiated
         ↓
Stored in buyer's Manager
         ↓
Workflow appears in Dashboard
```

### Secondary Sale Flow (Phase 2 🚀)
```
User sees workflow in "Marketplace Listings" tab
         ↓
Clicks "Buy"
         ↓
PurchaseModal shows price breakdown
         ↓
Confirms purchase
         ↓
1.0 FLOW withdrawn from wallet
         ↓
Payment distributed:
  ├─ 0.98 FLOW → Seller
  └─ 0.02 FLOW → Platform
         ↓
Workflow transferred to buyer's Manager
         ↓
Listing removed from marketplace
         ↓
Workflow appears in buyer's Dashboard
```

### Resale Flow (Tertiary Market - Phase 2+)
```
User who bought workflow clicks "List for Sale"
         ↓
Enters price (e.g., 1.5 FLOW)
         ↓
Confirms listing
         ↓
Workflow moves from Manager to Marketplace
         ↓
Appears in "Marketplace Listings" for others to buy
         ↓
Next buyer purchases
         ↓
Workflow transfers to new owner
         ↓
Seller (not original creator) gets 98%
```

---

## Data Structures

### Workflow Card (All Workflows Tab)
```typescript
{
  workflowId: 1,
  creator: "0xaaaa...xxxx",
  name: "Daily Rebalancer",
  price: "0.5",           // Clone price
  cloneCount: 42,
  forkCount: 3,
  isListed: true,
  imageIPFS: "bafy..."
}
```

### Marketplace Listing (Marketplace Tab - Phase 2)
```typescript
{
  listingId: 101,
  workflowId: 1,
  seller: "0xbbbb...yyyy",  // Current owner, NOT original creator
  price: "1.0",             // Listing price (different from clone price!)
  status: "active",
  createdAt: 1704931200,

  // Join with workflow info:
  name: "Daily Rebalancer",
  creator: "0xaaaa...xxxx",  // Original creator
  imageIPFS: "bafy..."
}
```

### Sales Record (Phase 3)
```typescript
{
  transactionId: "abc123",
  listingId: 101,
  workflowId: 1,
  buyer: "0xcccc...zzzz",
  seller: "0xbbbb...yyyy",
  price: "1.0",
  platformFee: "0.02",
  sellerPayout: "0.98",
  soldAt: 1704931200
}
```

---

## UI Mockups - Card Differences

### Card in "All Workflows" Tab
```
┌─────────────────────────────┐
│ [Image] ❤️  Rebalancing      │
│ Daily Rebalancer            │
│ by 0xaaaa...xxxx            │
│ Cool strategy               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ 42 Clones | 3 Forks         │
│                             │
│ Clone: 0.5 FLOW             │
│ [View] [Clone]              │
└─────────────────────────────┘
```

### Card in "Marketplace Listings" Tab (Phase 2)
```
┌─────────────────────────────┐
│ [Image] ❤️  Rebalancing      │
│ Daily Rebalancer            │
│ by 0xbbbb...yyyy (seller)   │
│ Cool strategy               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ 42 Total Clones             │
│ 5 Times Sold                │
│                             │
│ List Price: 1.0 FLOW        │
│ [View] [Buy]                │
└─────────────────────────────┘
```

### Same Workflow, Different Context!
- **All Workflows**: Original creator, clone price, [Clone]
- **Marketplace**: Current seller, listing price, [Buy]

---

## Summary Table

| Aspect | Clone | Secondary Market Sale |
|--------|-------|----------------------|
| **Location** | "All Workflows" tab | "Marketplace Listings" tab |
| **Who's Selling** | Original creator | Current owner (could be anyone) |
| **Price Set By** | Creator (clone fee) | Current seller |
| **Price Type** | Clone fee | Listing price |
| **Who Gets Paid** | 95% creator, 5% platform | 98% seller, 2% platform |
| **Button** | [Clone] | [Buy] |
| **Workflow Goes To** | Cloned into buyer's manager | Transferred to buyer's manager |
| **Can Resell** | No | Yes |
| **Status** | ✅ Working | 🚀 Phase 2 |

---

## Next Steps

1. **Review this document** to understand clone vs secondary sales
2. **Check CLONE_VS_SECONDARY_GUIDE.md** for marketplace design details
3. **Start Phase 2** by implementing marketplace listings
4. **Use this guide** as reference while coding Phase 2

---

**Last Updated**: 2025-01-13
**Phase**: Clarification for Phase 2 Implementation
**Related**: MARKETPLACE_INTEGRATION_GUIDE.md, IMPLEMENTATION_CHECKLIST.md

# 🏪 ForteHub Marketplace

Welcome to the ForteHub Marketplace - a decentralized platform for discovering, cloning, and trading DeFi workflows on the Flow blockchain.

## 📚 Documentation

Start with one of these based on your role:

### 👥 **For Users**
→ [**Marketplace Quick Start Guide**](./MARKETPLACE_QUICKSTART.md)
- How to clone workflows
- How to list workflows for sale (Phase 2)
- How to buy workflows (Phase 2)
- Fee explanations
- Safety guidelines

### 👨‍💻 **For Developers**
→ [**Marketplace Integration Guide**](./MARKETPLACE_INTEGRATION_GUIDE.md)
- Technical architecture
- Phase-by-phase implementation
- Testing checklist
- Database/indexing considerations
- Known limitations

### 📋 **For Project Managers**
→ [**Implementation Checklist**](./IMPLEMENTATION_CHECKLIST.md)
- Current status (Phase 1 ✅ Phase 2 🚀)
- Task breakdown
- Testing requirements
- Deployment checklist

---

## 🎯 Quick Overview

### What is ForteHub Marketplace?

ForteHub Marketplace is a decentralized platform where:
- **Creators** design and deploy automated DeFi workflows
- **Users** discover and clone workflows for their wallets
- **Sellers** list workflows for peer-to-peer trading
- **Buyers** purchase workflows with FLOW token

### Key Features

#### ✅ **Available Now**
- Modern marketplace UI
- Browse all public workflows
- Category filtering
- Clone any public workflow
- Beautiful workflow cards with images
- Real-time stats (clone counts, forks)

#### 🚀 **Coming Phase 2**
- List workflows for peer-to-peer sale
- Purchase workflows from other creators
- Real-time marketplace updates
- Seller dashboard with earnings tracking

#### 📊 **Coming Phase 3+**
- Sales history and analytics
- Creator rankings
- Wishlist/favorites system
- Advanced search and filtering
- Auction mechanism

---

## 📂 File Structure

```
ForteHub/
├── MARKETPLACE_README.md (this file)
├── MARKETPLACE_QUICKSTART.md (user guide)
├── MARKETPLACE_INTEGRATION_GUIDE.md (technical guide)
├── IMPLEMENTATION_CHECKLIST.md (status & tasks)
│
└── frontend/src/
    ├── app/
    │   ├── page.tsx (redirect to /discover)
    │   └── discover/
    │       ├── page.tsx (main marketplace)
    │       └── [id]/page.tsx (workflow details)
    │
    ├── components/marketplace/
    │   ├── WorkflowCard.tsx (card component)
    │   ├── PurchaseModal.tsx (buy workflow)
    │   └── SellerListingsPanel.tsx (seller tools)
    │
    └── lib/
        ├── marketplaceTransaction.ts (transaction builders)
        └── marketplaceEvents.ts (utilities & helpers)
```

---

## 🚀 Getting Started

### For Users
1. Visit [ForteHub](https://fortehub.com)
2. Browse workflows in the marketplace
3. Click "View" to see details
4. Click "Clone" to deploy to your wallet
5. See [Quick Start Guide](./MARKETPLACE_QUICKSTART.md) for details

### For Developers
1. Read [Integration Guide](./MARKETPLACE_INTEGRATION_GUIDE.md)
2. Review marketplace components in `frontend/src/components/marketplace/`
3. Check transaction builders in `frontend/src/lib/marketplaceTransaction.ts`
4. See [Implementation Checklist](./IMPLEMENTATION_CHECKLIST.md) for status

### For Contributors
1. Check [Implementation Checklist](./IMPLEMENTATION_CHECKLIST.md) for Phase 2+ tasks
2. Pick a task from the "To Do" section
3. Follow the testing checklist
4. Submit a PR with your changes

---

## 🏗️ Architecture

### Smart Contracts
- **ForteHubMarket.cdc** - P2P marketplace contract
  - Listing creation and cancellation
  - Purchase transactions with fee distribution
  - Platform fee management

- **ForteHub.cdc** - Workflow manager
  - `removeWorkflow()` - Extract workflow for listing
  - `depositWorkflow()` - Receive purchased workflow token
  - Workflow storage and execution

- **ForteHubRegistry.cdc** - Metadata registry
  - Workflow metadata storage
  - Clone and fork counting
  - Listing status tracking

### Frontend Components
- **discover/page.tsx** - Main marketplace view
  - Workflow grid with filtering
  - Three tabs: All | For Sale | Sold
  - Real-time status updates

- **WorkflowCard.tsx** - Reusable card component
  - Image with fallback
  - Creator info
  - Stats display
  - Action buttons

- **PurchaseModal.tsx** - Purchase interface
  - Workflow details
  - Price breakdown
  - Fee information
  - Payment confirmation

- **SellerListingsPanel.tsx** - Seller tools
  - List workflows
  - Update prices
  - Manage listings
  - View earnings

### Utilities
- **marketplaceTransaction.ts** - All transaction builders
  - List, unlist, purchase, price update
  - Query helpers

- **marketplaceEvents.ts** - Helper functions
  - Event parsing
  - Price formatting
  - Sorting and filtering
  - Fee calculations

---

## 💰 Fee Structure

### Clone Fees (Creator Setting)
- Optional, creator-defined
- Paid when cloning a workflow
- Split: 95% to creator, 5% to platform

### Marketplace Fees (P2P Sales - Phase 2)
- Fixed at 2% platform fee
- Paid when buying from marketplace
- Split: 98% to seller, 2% to platform

Example:
```
User sells workflow for 1.0 FLOW
├─ Seller receives: 0.98 FLOW
└─ Platform receives: 0.02 FLOW
```

---

## 🔐 Security

### Smart Contract Security
- ✅ Resource-based listings (no token duplication)
- ✅ Atomic fee distribution (all-or-nothing)
- ✅ Authorization checks on all operations
- ✅ IPFS source code verification

### User Security
- ✅ Workflows have limited capabilities
- ✅ Funds never leave user's wallet
- ✅ Every transaction requires approval
- ✅ Contract code verified on-chain

---

## 📈 Performance

### Targets
- Page load: < 2 seconds
- Filter/search: < 200ms
- Transaction: 2-5 minutes (blockchain dependent)
- Event updates: < 100ms

### Optimizations
- Image lazy loading with fallback
- Memoized components
- Efficient event parsing
- Category caching

---

## 🧪 Testing

### What's Been Tested
- ✅ UI rendering on all screen sizes
- ✅ Image handling and fallbacks
- ✅ Category filtering
- ✅ Transaction builders (syntax)
- ✅ Type safety

### What Needs Testing (Phase 2)
- [ ] Real listing transactions
- [ ] Event emission and parsing
- [ ] Purchase flow
- [ ] Fee calculations
- [ ] Error handling

See [Implementation Checklist](./IMPLEMENTATION_CHECKLIST.md) for full testing requirements.

---

## 🐛 Known Issues

### Current Limitations
1. "For Sale" tab is placeholder (Phase 2 implementation)
2. "Recently Sold" tab is placeholder (Phase 3 implementation)
3. Purchase modal is UI-only (Phase 2 for transaction)
4. No real-time event updates yet
5. Seller dashboard not integrated

### Workarounds
- Use direct contract interaction for listings (testnet)
- Monitor marketplace manually for activity
- Check [MARKETPLACE_INTEGRATION_GUIDE.md](./MARKETPLACE_INTEGRATION_GUIDE.md) for implementation status

---

## 🗺️ Roadmap

### Phase 1: UI/UX (✅ Complete)
- Modern marketplace design
- Workflow cards
- Category filtering
- Documentation

### Phase 2: Real-Time Marketplace (🚀 Starting)
- List workflows for sale
- Purchase workflows
- Real-time event updates
- Seller dashboard

### Phase 3: Sales History (📊 Planned)
- Track sales
- Creator analytics
- Top sellers
- Activity feed

### Phase 4: Advanced Features (✨ Future)
- Wishlist/favorites
- Advanced search
- Auctions
- Offers & negotiations
- Batch operations
- Creator royalties

---

## 💡 Tips

### For Best Results
- Clear browser cache if seeing stale data
- Check wallet balance before transactions
- Review workflow source code before cloning
- Start with popular workflows (high clone count)

### For Troubleshooting
1. Check [Quick Start Guide](./MARKETPLACE_QUICKSTART.md)
2. Review [Integration Guide](./MARKETPLACE_INTEGRATION_GUIDE.md) for technical issues
3. See [Implementation Checklist](./IMPLEMENTATION_CHECKLIST.md) for status
4. Report issues with full error message

---

## 📞 Support

### Documentation
- **User Guide**: [MARKETPLACE_QUICKSTART.md](./MARKETPLACE_QUICKSTART.md)
- **Developer Guide**: [MARKETPLACE_INTEGRATION_GUIDE.md](./MARKETPLACE_INTEGRATION_GUIDE.md)
- **Implementation Status**: [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)
- **Summary**: [README.md](./README.md)

### Getting Help
- Check documentation first
- Review code comments in components
- Look at transaction builders for examples
- Check Flow React SDK documentation

### Report Issues
- Document the issue clearly
- Include error message
- Share steps to reproduce
- Mention browser and wallet

---

## 🤝 Contributing

We welcome contributions! To get started:

1. **Read the documentation**
   - Pick a phase from [Implementation Checklist](./IMPLEMENTATION_CHECKLIST.md)
   - Review [Integration Guide](./MARKETPLACE_INTEGRATION_GUIDE.md) for context

2. **Make your changes**
   - Follow existing code patterns
   - Maintain TypeScript types
   - Test thoroughly (see testing checklist)

3. **Submit a PR**
   - Clear description of changes
   - Link to related issue/task
   - Include testing results

---

## 📄 License

ForteHub is open source under the [MIT License](./LICENSE).

---

## 🎉 Status

| Component | Status | Phase |
|-----------|--------|-------|
| Marketplace UI | ✅ Complete | 1 |
| Workflow Cards | ✅ Complete | 1 |
| Category Filtering | ✅ Complete | 1 |
| All Workflows Tab | ✅ Complete | 1 |
| For Sale Tab | 🚀 Ready | 2 |
| Purchase Modal | 🚀 Ready | 2 |
| Real-time Events | 🚀 Ready | 2 |
| Seller Dashboard | 🔄 In Design | 2 |
| Sales History | 📋 Planned | 3 |
| Advanced Features | 📋 Planned | 4+ |

---

## 🎯 Next Steps

### Immediate (This Week)
- [ ] Review marketplace components
- [ ] Test on testnet
- [ ] Gather user feedback

### Short-term (Next 2 Weeks)
- [ ] Implement Phase 2 (listings + purchases)
- [ ] Add real-time event listeners
- [ ] Deploy seller dashboard

### Medium-term (This Month)
- [ ] Implement Phase 3 (sales history)
- [ ] Launch analytics
- [ ] Optimize performance

### Long-term (Future Quarters)
- [ ] Advanced features
- [ ] Creator royalties
- [ ] Multi-marketplace support

---

**Last Updated**: 2025-01-13
**Status**: Phase 1 ✅ Live | Phase 2 🚀 Ready | Phase 3+ 📋 Planned
**Next**: Implement real-time marketplace listings (Phase 2)

For detailed implementation steps, see [MARKETPLACE_INTEGRATION_GUIDE.md](./MARKETPLACE_INTEGRATION_GUIDE.md)

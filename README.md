# ForteHub - DeFi Workflow Automation Platform

**Originally built for Forte Hacks 2025 (Development currently paused - Contributions welcome!)**

ForteHub is a decentralized workflow automation platform for Flow blockchain that enables users to create, deploy, and manage DeFi strategies without coding. Users can build complex workflows (rebalancing, dollar-cost averaging, arbitrage, governance automation) and deploy them directly to their own accounts. This is done via LLM API calls and one-transaction deployment of contracts. New workflows are stored on-chain to a registry and can then be cloned by other users. Workflows use Flow DeFi-Actions and are handled by a manager contract deployed by each wallet. The Manager contract also handles scheduling for transaction automation.

---

## ⚠️ Development Status

> **IMPORTANT: CURRENTLY PAUSED**
> ForteHub is a massive proof-of-concept that was originally built for Forte Hacks 2025. While much of the core infrastructure and marketplace has been built out, **development is currently paused until further notice**.
>
> There is still a **long way to go** before this can be considered production-ready. **Lots of testing** is still required across the smart contracts and frontend, and the AI features need major improvements. The code is shared here for educational purposes and as a foundation—**contributions and forks are warmly welcomed!**

### Known Limitations & Work in Progress:

**🧪 Testing & Stability**
- **Extensive testing required** - Core functionality works but needs comprehensive test coverage
- Smart contract edge cases need thorough validation
- End-to-end flows require extensive QA
- Performance testing under load not yet completed
- Security audit required before mainnet deployment

**🎨 UI/UX Improvements Needed**
- **UI requires significant revamping** - Current interface is functional but needs polishing
- User experience flow needs optimization
- Mobile responsiveness improvements required
- Error handling and user feedback need enhancement
- Accessibility features not yet implemented
- Design system needs consistency pass

**🤖 AI Features Need Major Improvements**
- **AI workflow generation needs significant work** - Current LLM integration is basic
- Prompt engineering requires refinement for better code quality
- Code validation and error recovery need enhancement
- AI-generated workflows need more thorough testing
- Natural language understanding needs improvement
- Goal-based strategy generation not yet implemented
- Context awareness and learning from user feedback needed

**📋 Additional Gaps**
- Indexer not yet deployed (event tracking infrastructure ready)
- Real-time marketplace event listeners not active
- Analytics dashboard not implemented
- Subscription/payment model undefined
- Documentation incomplete for end users

### Use at Your Own Risk

This platform is currently suitable for:
- ✅ Testing and experimentation on Flow Testnet
- ✅ Learning about DeFi automation patterns
- ✅ Development and contribution

Not yet suitable for:
- ❌ Production use with real funds
- ❌ Mainnet deployment
- ❌ Mission-critical automation

---


## Architecture

### Smart Contracts (Cadence)

- **Deployed to Flow Testnet:**
  - **ForteHub** (`0xc2b9e41bc947f855`) - Core contract; manages workflows and registry
  - **ForteHubMarket** (`0xbd4c3996265ed830`) - Secondary marketplace for P2P workflow trading
  - Each workflow instance lives inside a `WorkflowToken` wrapper so secondary sales behave like NFTs

**Key Design Patterns:**
- **Wallet-owned workflows**: Each user's workflows deployed to their own account (not centralized)
- **Per-user manager**: ForteHub created once per wallet, manages all that user's workflows
- **Event-based tracking**: WorkflowExecuted events emitted on execution (no on-chain counters); indexer aggregates metrics later
- **Modular scheduling**: Optional FlowTransactionScheduler integration for autonomous workflows
- **One-atomic transaction**: Single deployment transaction handles manager setup, vault initialization, contract deployment, and registry

**Supported Workflows:**
- Manual execution (user-triggered)
- Scheduled execution (via FlowTransactionScheduler) at configurable frequencies
- Pauseable/resumable for user control

### Frontend (Next.js 16 + React)

**Architecture:**
- **Flow React SDK** - `@onflow/react-sdk` powers wallet auth plus every transaction (`TransactionButton` + `TransactionDialog`), so sealing state and errors are handled consistently without custom polling code
- **TailwindCSS + shadcn/ui** - Component library for consistent UI
- **TypeScript** - Full type safety
- **Server-side queries** - `/api/flow-query` endpoint abstracts Cadence script execution

**Key Pages:**
- **Create** (`/create`) - AI-powered workflow generation with success/error modal feedback
- **Discover** (`/discover`) - Public workflow marketplace with filtering
- **Discover Detail** (`/discover/[id]`) - Workflow details with creator controls (list/unlist)
- **Dashboard** (`/dashboard`) - User's deployed workflows with execution controls

**Creator Controls:**
- **List/Unlist**: Toggle workflow visibility in public registry
- **Reschedule**: Change execution frequency for scheduled workflows (placeholder for implementation)
- **View Metrics**: Execution history (powered by indexer events)
- **Pricing**: Set paid clone prices or keep free (supports any amount in FLOW)
- **Custom Images**: Upload workflow images to IPFS for marketplace display (optional, defaults to coffee image)
- **Dynamic Descriptions**: Auto-update workflow descriptions when changing default parameters
- **Marketplace**: View clone counts, earnings, NFT resale royalties
- **Lock Cloning**: Permanently disable new clones when you want to fix the edition count (creators only)

**Pricing & Marketplace** (Phase 7 + Current):
- **Paid Cloning**: Creators can set clone prices (free or any amount)
- **Smart Payment Handling**: Only withdraws exact FLOW amount needed for clone (prevents accidental large transfers)
- **Fee Splitting**: 95% to creator, 5% to platform (configurable via platformFeePercent)
- **NFT Resale**: Workflows compatible with Flow NFT marketplaces (MetadataViews support)
- **Creator Royalties**: 5% of secondary sales via MetadataViews.Royalties

**Clone Tickets (New)**:
- Non-creator cloners must call `ForteHub.purchaseCloneTicket` before invoking `Manager.cloneResource`.
- Tickets escrow the payment vault (if the workflow has a non-zero price) and emit `CloneTicketIssued`.
- `cloneResource` now accepts `ticket: @CloneTicket?`, validates workflowId/owner/price, distributes funds, and refunds any mismatch automatically. The original creator can omit the ticket when cloning their own workflow (no payment needed).
- Free workflows get zero-cost tickets and panic if FLOW is attached, which prevents griefing or accidental overpayment.
- Creators deploy/register via `Manager.registerWorkflow` but seed the first copy by calling their workflow's own `createWorkflow(..., ticket: <-nil)` so only their Manager ever stores the canonical resource—`addWorkflow` is no longer exposed to external cloners.
- Workflow contracts now expose `createWorkflow(workflowId, config, manager: &{ForteHub.WorkflowAcceptance}, ticket: @ForteHub.CloneTicket?)` and **must** call `manager.acceptWorkflow(...)` internally so only real ForteHub managers can store clones (no resource is returned).

**Parameter Sync & Descriptions**:
- **Description Update Utility**: Auto-updates descriptions to reflect current parameter values (e.g., change 60% target to 75%, description updates immediately)
- **Smart Pattern Matching**: Detects and updates percentages, time values (converts 3600 seconds to 1 hour), thresholds
- **Real-time Preview**: Review modal shows description with current parameters before deployment
- **Creator Intent**: Deployed descriptions always reflect creator's final parameter choices

**Scheduler & Autonomous Execution**:
- **User-Owned Fees**: Users maintain FLOW balance in wallet for scheduling
- **No Manager Vault**: Simplified architecture (scheduler fees paid via transaction gas)
- **Balance Alerts**: Notifies users if insufficient balance to schedule or if balance runs low
- **Auto-Unschedule**: Scheduled workflows automatically cancel when removed

**Token Detection & DeFi Integration:**
- **Dynamic Token Detection**: Automatically detects tokens from user descriptions (e.g., "FLOW-USDC rebalancer" → includes FLOW + USDC imports)
- **Network-Aware Addresses**: Token registry includes testnet and mainnet addresses; prompt generates correct imports based on deployment network
- **Hardcoded Token Registry** (MVP): `tokenRegistry.ts` contains all Flow testnet/mainnet token addresses (FLOW, USDC, USDT, USDF, WETH, WBTC, cbBTC, etc.)
- **Automatic Prompt Generation**: LLM prompt automatically includes only the tokens user mentioned, with correct import paths and vault types

## Current Implementation Status

### ✅ Completed
- [x] Smart contract architecture (ForteHub, ForteHubRegistry)
- [x] Wallet-owned deployment pattern with per-user managers
- [x] Event-based execution tracking (WorkflowExecuted events)
- [x] MetadataViews support for contract discovery
- [x] Testnet deployment (ForteHubRegistry live)
- [x] Code verification with SHA2-256 hashing (detects modifications)
- [x] Deployment protection (prevents contract redeployment/tampering)
- [x] Marketplace transfer infrastructure (depositWorkflow for inter-manager transfers)
- [x] Hash verification optimization (66% gas reduction per clone)
- [x] LLM prompt hardening (createWorkflow() requirement enforcement)
- [x] **Paid cloning with updateable platform fees** (Phase 7)
- [x] **NFT marketplace compatibility via MetadataViews** (Phase 7)
- [x] **Clean scheduler fee architecture** (users pay from wallet, not Manager vault) (Phase 7)
- [x] **Duplicate clone prevention** (Phase 7)
- [x] **Workflow auto-unscheduling on removal** (Phase 7)
- [x] **Clone pricing system** (price field in WorkflowInfo, smart payment handling)
- [x] **Clone count/fork count in WorkflowInfo** (consolidated from separate dictionaries)
- [x] **Description parameter sync utility** (auto-update descriptions when parameters change)
- [x] **Clone pricing UI** (discovery pages + create page price input)
- [x] **NFT metadata image field** (imageIPFS for workflow thumbnails)
- [x] **Image thumbnails on cards and detail page** (with fallback to coffee image)

### ⏳ Recent Improvements (Post-Hackathon)
- **Phase 7 - Paid Cloning & Marketplace**:
  - Implemented paid cloning with dynamic fee splitting (95% creator, 5% platform)
  - Updateable platform fee percentage (configurable, 5% default)
  - Workflow pricing support (nil/0.0 = free, any amount = paid)
  - NFT marketplace compatibility via MetadataViews (Display, Royalties, Serial, ExternalURL)
  - Support for preview images (imageIPFS field)
  - Two-tier marketplace (primary: template clones, secondary: NFT resales)

- **Phase 7 - Scheduler Architecture Cleanup**:
  - Removed unused Manager flowTokenVault (simplified storage)
  - User pays scheduler fees directly from wallet transaction gas
  - Removed per-execution scheduler fees (only 0.01 FLOW base fee)
  - Balance alert events retained for wallet monitoring ("failed" and "warning" states)

- **Phase 7 - Robustness**:
  - Duplicate clone prevention (user can only have one instance per workflow)
  - Automatic workflow unscheduling on removal (prevents orphaned tasks)

- **Phase 8 - Smart Pricing & Parameter Sync**:
  - Added `price` field to WorkflowInfo struct (UFix64?, nil/0.0 = free)
  - Smart payment handling (only withdraw exact FLOW amount needed for clone)
  - Clone pricing UI on discovery pages (list view + detail stat box)
  - Clone price input fields on create page (main form + review modal)
  - Description parameter sync utility: auto-updates descriptions when parameters change
  - Moved cloneCount and forkCount from separate dictionaries to WorkflowInfo fields (single source of truth)
  - Frontend shows price in clone button and deployment summary

- **Code Verification Optimization**: Consolidated redundant contract fetches, reduced gas costs per clone
- **Type Safety**: Strengthened recordClone() preconditions with strict type checking
- **LLM Compliance**: Enhanced createWorkflow() documentation to ensure LLM generates correct factory functions
- **Security**: Added deployment protection to prevent contract modification attacks

#### 🎯 **NEXT PHASE PRIORITY: API + MCP Integration** 

1. **Backend API + Flow MCP Integration** (CRITICAL PATH)
   - **Current State**: Token registry is hardcoded in `tokenRegistry.ts` with testnet/mainnet addresses
   - **Next Phase**: Replace hardcoded registry with dynamic MCP queries
   - **Implementation**:
     - Build REST API backend (Node.js/Python)
     - Integrate `flow-mcp` server for reading:
       - Available tokens on each network
       - Current token prices (via Band Protocol or Chainlink)
       - DeFi connector metadata (swap quotes, liquidity info)
     - Integrate `flow-defi-mcp` server for:
       - Real-time swap quotes from IncrementFi, StableSwap
       - Oracle data aggregation
       - Gas estimation for different operations
     - LLM API backend to interpret user prompts → generate valid Cadence templates using MCP data
   - **Benefit**: Eliminates need to manually update token list; always reflects current Flow ecosystem state
   - **Flow**: User prompt → Backend queries MCPs → LLM generates Cadence with live data → Returns code
   - **AI-Powered Goal-Based Strategy Generation** (Post-MCP):
     - User states financial goal (e.g., "15% annual yield on USDC" or "arbitrage FLOW across DEXs")
     - LLM + MCPs analyze available protocols, liquidity, pricing, yields
     - AI generates optimal Cadence contract with correct connector calls + addresses
     - User reviews, adjusts parameters, deploys
     - Payment model TBD (per-generation credit, subscription, per-deployment fee, etc.)
     - All strategy decisions backed by live DeFi MCP data + oracle feeds

2. **Indexer Implementation**
   - Set up Flow indexer to aggregate WorkflowExecuted events
   - Compute execution stats (total runs, success rate, average frequency)
   - Expose metrics via GraphQL API for dashboard

3. **Subscription Model** (Post-MVP)
   - **Free tier**: 1 workflow, manual execution only
   - **Pro tier**: Unlimited workflows, scheduled execution, priority gas optimization
   - **Enterprise**: Custom workflow logic, dedicated support
   - **Implementation**: Governance token or Flow-native payment contract

4. **Analytics Dashboard**
    - Per-workflow execution history
    - Gas cost breakdown
    - Success/failure trends
    - Yield results
    - Creator earnings (if monetized)

5. **Advanced DeFi Features** (After MCP integration)
    - Swap slippage protection
    - Multi-hop routing
    - Yield aggregation from multiple pools
    - Risk management (stop-loss, take-profit)

## Setup & Deployment

### Prerequisites
```bash
# Install Flow CLI (v1.0+)
brew install flow-cli

# Install Node.js 18+
node --version

# Install frontend dependencies
cd frontend
npm install
```

### Local Development (Emulator)
```bash
# Terminal 1: Start emulator (high gas limits for development)
flow emulator start --transaction-max-gas-limit=999999 --script-gas-limit=999999 --storage-limit=false

# Terminal 2: Start dev wallet
flow dev-wallet

# Terminal 3: Start frontend dev server
cd frontend
npm run dev

# Terminal 4: Deploy contracts (optional)
flow project deploy --network emulator
```

### Testnet Deployment
```bash
# ForteHubRegistry is already deployed to testnet
# Contract address: 0xc2b9e41bc947f855

# To deploy your own instance:
# 1. Update flow.json with your testnet account
# 2. Run: flow project deploy --network testnet
```

### Environment Variables (Frontend)
```env
# .env.local
NEXT_PUBLIC_FORTEHUB_REGISTRY=0xc2b9e41bc947f855
NEXT_PUBLIC_NETWORK=testnet
```

## Technical Architecture Decisions

## Key Files

### Smart Contracts
```
cadence/
├── contracts/
│   ├── ForteHub.cdc               # Per-wallet workflow manager
│   ├── ForteHubRegistry.cdc       # Central registry tracking workflows
│   ├── ForteHubMarket.cdc         # Secondary marketplace for clones
│   └── [other DeFi connectors]
└── transactions/
    └── deploy_workflow.cdc        # One-atomic deployment
```

### Frontend
```
frontend/
├── src/
│   ├── app/
│   │   ├── create/                # AI Workflow generation UI
│   │   ├── discover/              # Public registry (primary clones)
│   │   ├── marketplace/           # Secondary P2P sales (NFT clones)
│   │   ├── dashboard/             # User's deployed workflows
│   │   └── profile/               # Creator profiles
│   ├── components/
│   │   ├── marketplace/           # Specialized UI for cards, modals, listings
│   │   └── dashboard/             # Workflow control & scheduling UI
│   ├── lib/
│   │   ├── agentPrompt.ts         # System prompt for LLM translation
│   │   ├── deploymentTransaction.ts# Base code for unified deploy
│   │   ├── updateDescriptionWithValues.ts # Param sync utility
│   │   └── marketplaceTransactions.ts # Builder for sales functions
│   └── types/interfaces.ts        # Shared TypeScript definitions
└── public/                        # Assets
```

## Security Considerations

- **Access Control**: Only workflow creator can list/unlist (case-insensitive address check)
- **Contract Validation**: Source code hash verified before deployment
- **Resource Safety**: Proper Cadence 1.0 resource handling with @ and & syntax
- **Vault Management**: Token vaults created with auth(Withdraw) capabilities

## Metrics & Success Criteria

**Current State:**
- ✅ 1 contract deployed to testnet (ForteHubRegistry)
- ✅ 2+ contracts total (Manager auto-deploys per-wallet)
- ✅ Event-based usage tracking in place
- ✅ Marketplace UI functional
- ⏳ Indexer integration pending (event infrastructure ready)

**Post-Hackathon Metrics:**
- Indexer processing 100% of WorkflowExecuted events
- Creator metrics dashboard shows real-time execution stats
- 10+ pre-built workflow templates available
- Subscription payment system integrated

## Future Roadmap (wip)

- Backend API + LLM integration (via flow-mcp)
- Subscription system → Revenue model?
- Governance token → Community governance?
- Indexer launch → Real-time execution analytics
- Template marketplace → 20+ pre-built workflows
- Advanced scheduling → Support for multi workflow agents
- Multi-chain support (via bridges)
- Advanced connectors (NFT, governance, webhooks)
- Creator earnings program via Token Launch?

## Hackathon Notes

**What Worked:**
- Wallet-owned pattern enabled fast, scalable design
- Event-based tracking avoided on-chain complexity
- One-atomic transaction pattern simplified deployment
- Resource-based cloning (lightweight, no contract redeploy needed)

**What We'd Do Differently:**
- **API Backend First**: Building LLM integration would unlock next-level UX (dynamic prompt → Cadence code)
- **Indexer Ready**: Set up indexer infrastructure in parallel with contracts (not after)

**Time Constraints Hit (During Hackathon):**
- Flow MCP/Flow DeFi MCP integration deferred (would require backend)
- Advanced connector libraries not fully integrated

## Post-Hackathon Development

Since the hackathon ended, we've been improving ForteHub with:
- **Security hardening**: Code verification, deployment protection, type safety improvements
- **Marketplace features**: depositWorkflow() for inter-manager transfers, future marketplace integration
- **Performance optimizations**: 66% gas reduction in clone verification
- **LLM robustness**: Enhanced createWorkflow() documentation for better AI compliance

### CLI Test Harness

- `scripts/run_full_flow.sh` automates the end-to-end scenario (manager initialization → workflow deployment → clone → marketplace listing/purchase → lock). See `CLI_TESTING.md` for instructions and required environment variables.

### Phase 7: Complete Marketplace & Clean Scheduler Architecture
- **Paid Cloning System**: Creators set clone prices, platform takes 5% (updateable), creators get 95%
- **Two-Tier Marketplace**: Primary market (template cloning) + Secondary market (NFT resales via MetadataViews)
- **NFT Marketplace Support**: Full MetadataViews compliance (Display, Royalties, Serial, ExternalURL)
- **Scheduler Simplification**: Removed Manager vault, users pay fees directly from wallet balance
- **Robustness Features**: Duplicate clone prevention, auto-unscheduling on removal, balance alerts

## Contributing

Because active development is currently **paused**, community contributions are highly encouraged! Whether you want to improve the test coverage, refine the AI generated contracts, or spruce up the UI, feel free to fork the repository.

Check `CLAUDE.md` and `AGENT.md` for detailed architecture documentation and development guidelines to help you get started.

**Originally submitted to Forte Hacks 2025. Now open for community contribution.** 

## License

MIT (for hackathon evaluation)

---

**Questions?** Check the Flow developer docs: https://developers.flow.com

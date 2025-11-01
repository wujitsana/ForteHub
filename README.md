# ForteHub - DeFi Workflow Automation Platform

**Forte Hacks 2025 Submission**

ForteHub is a decentralized workflow automation platform for Flow blockchain that enables users to create, deploy, and manage DeFi strategies without coding. Users can build complex workflows (rebalancing, dollar-cost averaging, arbitrage, governance automation) and deploy them directly to their own accounts.  This is done via LLM api calls and one transaction deployment of contracts.  New workflows are stored on chain to a registry and can then be cloned by other users. Workflows use Flow Defi-Actions and are handled by a manager contract deployed by each wallet.  The Manager contract also handles scheduling for transaction automation.    


## Architecture

### Smart Contracts (Cadence)

**Deployed to Flow Testnet:**
- **ForteHubRegistry** (`0xbd4c3996265ed830`) - Central registry tracking all workflows, clones, and forks
- **ForteHubManager** - Deployed per-wallet; manages all workflows for that user (auto-initialized on first deployment)

**Key Design Patterns:**
- **Wallet-owned workflows**: Each user's workflows deployed to their own account (not centralized)
- **Per-user manager**: ForteHubManager created once per wallet, manages all that user's workflows
- **Event-based tracking**: WorkflowExecuted events emitted on execution (no on-chain counters); indexer aggregates metrics later
- **Modular scheduling**: Optional FlowTransactionScheduler integration for autonomous workflows
- **One-atomic transaction**: Single deployment transaction handles manager setup, vault initialization, contract deployment, and registry

**Supported Workflows:**
- Manual execution (user-triggered)
- Scheduled execution (via FlowTransactionScheduler) at configurable frequencies
- Pauseable/resumable for user control

### Frontend (Next.js 16 + React)

**Architecture:**
- **React SDK** - Uses `@onflow/react-sdk` for all blockchain interactions 
- **TailwindCSS + shadcn/ui** - Component library for consistent UI
- **TypeScript** - Full type safety
- **Server-side queries** - `/api/flow-query` endpoint abstracts Cadence script execution

**Key Pages:**
- **Create** (`/create`) - AI-powered workflow generation with success/error modal feedback
- **Browse** (`/browse`) - Public workflow marketplace with filtering
- **Browse Detail** (`/browse/[id]`) - Workflow details with creator controls (list/unlist)
- **Dashboard** (`/dashboard`) - User's deployed workflows with execution controls

**Creator Controls:**
- **List/Unlist**: Toggle workflow visibility in public registry
- **Reschedule**: Change execution frequency for scheduled workflows (placeholder for implementation)
- **View Metrics**: Execution history (powered by indexer events)

**Token Detection & DeFi Integration:**
- **Dynamic Token Detection**: Automatically detects tokens from user descriptions (e.g., "FLOW-USDC rebalancer" → includes FLOW + USDC imports)
- **Network-Aware Addresses**: Token registry includes testnet and mainnet addresses; prompt generates correct imports based on deployment network
- **Hardcoded Token Registry** (MVP): `tokenRegistry.ts` contains all Flow testnet/mainnet token addresses (FLOW, USDC, USDT, USDF, WETH, WBTC, cbBTC, etc.)
- **Automatic Prompt Generation**: LLM prompt automatically includes only the tokens user mentioned, with correct import paths and vault types

## Current Implementation Status

### ✅ Completed
- [x] Smart contract architecture (ForteHubManager, ForteHubRegistry)
- [x] Wallet-owned deployment pattern with per-user managers
- [x] Event-based execution tracking (WorkflowExecuted events)
- [x] MetadataViews support for contract discovery
- [x] Testnet deployment (ForteHubRegistry live)

### ⏳ Future Work

- Needs more testing and improvement of major features. . .

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
# Contract address: 0xbd4c3996265ed830

# To deploy your own instance:
# 1. Update flow.json with your testnet account
# 2. Run: flow project deploy --network testnet
```

### Environment Variables (Frontend)
```env
# .env.local
NEXT_PUBLIC_FORTEHUB_REGISTRY=0xbd4c3996265ed830
NEXT_PUBLIC_NETWORK=testnet
```

## Technical Architecture Decisions

## Key Files

### Smart Contracts
```
cadence/
├── contracts/
│   ├── ForteHubManager.cdc          # Per-wallet workflow manager
│   ├── ForteHubRegistry.cdc         # Central registry
│   └── [other DeFi connectors]
└── transactions/
    └── deploy_workflow.cdc          # One-atomic deployment
```

### Frontend
```
frontend/
├── src/
│   ├── app/
│   │   ├── create/                  # Workflow creation UI
│   │   ├── browse/                  # Marketplace
│   │   └── dashboard/               # User's workflows
│   ├── components/                  # Reusable UI
│   ├── lib/
│   │   ├── forteHubManagerCode.ts   # Manager contract code for deployment
│   │   └── deploymentTransaction.ts # Transaction builder
│   └── services/
│       ├── ipfs.service.ts          # IPFS upload/fetch
│       └── [other services]
└── public/                           # Assets
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

**What We'd Do Differently:**
- **API Backend First**: Building LLM integration would unlock next-level UX (dynamic prompt → Cadence code)
- **Indexer Ready**: Set up indexer infrastructure in parallel with contracts (not after)

**Time Constraints Hit:**
- Flow MCP/Flow DeFi MCP integration deferred (would require backend)
- Advanced connector libraries not fully integrated

## Contributing
-  All contributions welcome. . .

This project was built for Forte Hacks 2025. 

## License

MIT (for hackathon evaluation)

---

**Questions?** Check the Flow developer docs: https://developers.flow.com

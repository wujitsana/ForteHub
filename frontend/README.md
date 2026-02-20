# ForteHub Frontend

Next.js 16 + React application for ForteHub - DeFi workflow automation platform on Flow blockchain.

## Architecture

### Stack
- **Framework**: Next.js 16 with App Router
- **Styling**: TailwindCSS + shadcn/ui
- **Blockchain**: `@onflow/react-sdk` (not FCL)
- **Language**: TypeScript (full type safety)
- **State**: React hooks + TanStack Query
- **IPFS**: Web3.Storage for workflow source code

### Key Design Decisions

**React SDK Over FCL:**
- Cleaner hook-based API (`useFlowQuery`, `useFlowMutate`)
- Better TypeScript support for Cadence arguments
- Smaller bundle size
- Easier testing and debugging

**Server-Side Query Endpoint:**
- API route `/api/flow-query` abstracts Cadence script execution
- Allows batching queries without exposing Flow network details
- Easier to add caching/optimization later

**Event-Based Metrics:**
- WorkflowExecuted events emitted on execution
- Frontend displays events from indexer (deferred implementation)
- No on-chain storage overhead

**Token Detection & DeFi Integration (MVP):**
- **Dynamic Token Registry** (`lib/tokenRegistry.ts`): Detects tokens mentioned in user descriptions
  - Example: User enters "Create a FLOW-USDC rebalancer" → automatically includes FLOW + USDC imports
  - Supports all Flow testnet/mainnet tokens (USDC, USDT, USDF, WETH, WBTC, cbBTC, stFlow, ankrFLOW, etc.)
  - Network-aware: generates correct import addresses based on `NEXT_PUBLIC_NETWORK` environment variable
- **Automatic Prompt Generation**: LLM prompt includes only detected tokens with:
  - Correct import paths (e.g., `import USDC from 0x1e4aa0b87d10b141` on mainnet)
  - Vault types (e.g., `Type<@USDC.Vault>()`)
  - Network-specific information
- **Future Migration to MCPs**: Will replace hardcoded token list with dynamic queries to `flow-mcp` and `flow-defi-mcp` (see main README)

**Clone Tickets & Payments:**
- `lib/cloneTransaction.ts` withdraws exactly the listed price, calls `ForteHub.purchaseCloneTicket`, borrows the signer’s ForteHub manager, and passes both the restricted manager reference and ticket into `createWorkflow(...)` so the workflow contract can call `manager.acceptWorkflow(...)`. Resales use `manager.depositWorkflow(token: <-token)` instead of re-cloning.
- Tickets ensure only managers that paid (or were issued a free ticket) can store the cloned workflow; refunds happen automatically on failure.
- Discover list/detail pages both consume the shared `prepareCloneTransaction` helper so UI always follows the ticket flow without duplicate logic.

## Folder Structure

```
frontend/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── create/                   # Workflow creation UI
│   │   │   └── page.tsx              # AI-powered form + deployment
│   │   ├── discover/                   # Marketplace listing
│   │   │   ├── page.tsx              # Public workflows grid
│   │   │   └── [id]/                 # Workflow detail page
│   │   │       └── page.tsx          # Creator controls, fork/clone
│   │   ├── dashboard/                # User's deployed workflows
│   │   │   └── page.tsx              # Execution history, metrics
│   │   ├── api/
│   │   │   └── flow-query/           # Cadence script executor
│   │   └── layout.tsx                # Root layout + providers
│   │
│   ├── components/                   # Reusable React components
│   │   ├── ui/                       # shadcn/ui (Card, Button, Modal, etc.)
│   │   └── [domain]/                 # Domain-specific components
│   │
│   ├── lib/                          # Utilities & helpers
│   │   ├── tokenRegistry.ts          # Token detection & network-aware imports
│   │   ├── agentPrompt.ts            # LLM prompt generation with token detection
│   │   ├── forteHubManagerCode.ts    # Manager contract code string
│   │   ├── deploymentTransaction.ts  # Deployment transaction builder
│   │   ├── cloneTransaction.ts       # Clone transaction with smart payment handling
│   │   ├── updateDescriptionWithValues.ts  # Auto-sync descriptions with parameters
│   │   ├── ipfs.service.ts           # IPFS upload/fetch
│   │   └── flow/                     # Flow SDK utilities
│   │
│   ├── services/                     # API & blockchain services
│   │   └── [services]
│   │
│   ├── types/                        # TypeScript interfaces
│   │   └── interfaces.ts             # Workflow, Registry types
│   │
│   ├── hooks/                        # Custom React hooks
│   │   └── [hooks]
│   │
│   └── styles/                       # Global styles
│       └── globals.css               # TailwindCSS imports
│
├── public/                           # Static assets
├── package.json
└── tsconfig.json
```

## Key Pages

### Create (`/create`)
- AI-powered workflow builder with dynamic token detection
- Form inputs for workflow strategy
- Automatic token detection from user description
- Source code generation via Claude AI (users copy prompt and paste generated code)
- **NEW**: Clone pricing input (free or any amount in FLOW)
- **NEW**: Real-time description sync (auto-updates description when parameters change)
- **Deployment Flow**:
  1. User enters strategy (e.g., "FLOW-USDC rebalancer")
  2. Frontend detects tokens → generates LLM prompt with correct imports
  3. User copies prompt to Claude, pastes generated code
  4. Frontend validates Cadence syntax
  5. User sets clone price (default: free)
  6. User adjusts default parameters
  7. Description auto-updates to reflect parameter values
  8. Code uploaded to IPFS
  9. One-atomic transaction deploys contract + registers in ForteHubRegistry with price
  10. **NEW**: Frontend polls for transaction sealing (up to 60 seconds)
  11. If sealed: Success modal with contract name, tx ID, Flowscan link
  12. If error: Detailed error modal with troubleshooting steps

**Components**:
- StrategyInput (user describes workflow)
- CodePaste (user pastes generated Cadence)
- ValidationFeedback (syntax checking)
- PriceInput (clone price field - main form and review modal)
- ParameterSync (real-time description updates)
- DeploymentResultModal (success/detailed error with actual blockchain error)
- TransactionStatusChecker (waits for sealing, extracts error messages)

### Discover (`/discover`)
- Public workflow marketplace
- Filter by category
- Search by name
- Clone/fork workflows
- Shows clone count, fork count, creator info
- **NEW**: Clone pricing displayed on cards (Free or {amount} FLOW)
- **NEW**: Workflow thumbnail images with fallback to default coffee image

**Components**:
- WorkflowCard (grid item with metadata, includes clone price and image thumbnail)
  - Image: 128px height (h-32), full width, rounded corners
  - Fallback: Default coffee image if custom image fails to load
- CategoryFilter (dropdown/tabs)
- SearchBar
- DeployModal (clone confirmation with price handling)
- Clone price shown prominently on each card
- Image thumbnails displayed above description

### Discover Detail (`/discover/[id]`)
- Full workflow information
- Source code link (IPFS)
- Execution history (from indexer)
- **NEW**: Clone pricing stat box (Free or {amount} FLOW)
- **NEW**: Large workflow thumbnail image (256px height) with fallback
- Creator controls (if logged in as creator)
  - **List/Unlist**: Toggle public visibility
  - **Reschedule**: Change execution frequency (placeholder)
- Fork/clone button with smart payment handling
- Metadata display (parameters, default values)

**Components**:
- WorkflowHeader (name, creator, stats)
- WorkflowImage (full-width image display, h-64, with fallback to default coffee image)
- PricingCard (Clone Price stat box)
- CreatorControlsCard (list/unlist, reschedule modals)
- WorkflowMetadata (parameter display)
- ExecutionHistory (event-based metrics)
- CloneModal (clone with smart payment handling)

### Dashboard (`/dashboard`)
- User's deployed workflows
- Execution controls (pause/resume, run manually)
- Metrics per workflow
- Edit configuration

**Components**:
- WorkflowList
- ExecutionCard (run/pause buttons)
- MetricsChart (success rate, frequency)

## API Endpoints

### `/api/flow-query` (POST)
Execute Cadence scripts safely on server.

**Request:**
```typescript
{
  cadence: string;           // Cadence script code
  args?: any[];             // Script arguments (array or formatted args)
}
```

**Response:**
```typescript
{
  result: any;              // Script return value
  error?: string;           // Error message if execution failed
}
```

**Example:**
```typescript
const response = await fetch('/api/flow-query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cadence: `
      import ForteHubRegistry from 0xc2b9e41bc947f855

      access(all) fun main(): [UInt64] {
        return ForteHubRegistry.listPublicWorkflows()
      }
    `,
    args: []
  })
});

const workflows = await response.json();
```

## React SDK Patterns

### Reading Data (`useFlowQuery`)
```typescript
import { useFlowQuery } from '@onflow/react-sdk';

const { data: workflows, isLoading } = useFlowQuery({
  cadence: `
    import ForteHubRegistry from 0xc2b9e41bc947f855

    access(all) fun main(): [UInt64] {
      return ForteHubRegistry.listPublicWorkflows()
    }
  `,
  query: {
    staleTime: 30000  // Cache for 30 seconds
  }
});
```

### Writing Data (`useFlowMutate`)
```typescript
import { useFlowMutate } from '@onflow/react-sdk';

const { mutate: deploy, isPending } = useFlowMutate({
  mutation: {
    onSuccess: (txId: string) => {
      console.log('Deployed:', txId);
    },
    onError: (error: Error) => {
      console.error('Deployment failed:', error.message);
    }
  }
});

// Later...
deploy({
  cadence: DEPLOY_WORKFLOW_TRANSACTION,
  args: [deploymentArgs],
  signers: [userAddress]
});
```

## Contract Interaction Patterns

### Deployment Transaction (`deploymentTransaction.ts`)

One-atomic transaction that:
1. Deploys ForteHub contract (if user's first time)
2. Sets up required vaults (FLOW, USDC, custom tokens)
3. Deploys workflow contract to user's account
4. Registers workflow in ForteHubRegistry

**Entry Point**: `buildDeploymentArgs()` function

**Key Variables**:
- `contractName`: Sanitized workflow name
- `contractCode`: Cadence contract as string
- `metadataJSON`: Workflow parameters and config
- `vaultSetupInfo`: Token addresses and storage paths
- `shouldDeployManager`: Boolean flag for manager deployment

### Vault Setup (`extractVaultSetupInfo()`)

Maps token names to storage paths:
```typescript
{
  "FLOW": "/storage/flowTokenVault",
  "USDC": "/storage/usdcVault"
}
```

Only FLOW is required by default; workflow can specify additional tokens.

### Description Parameter Sync (`updateDescriptionWithValues()`)

**File**: `lib/updateDescriptionWithValues.ts`

**Purpose**: Auto-sync workflow descriptions with current parameter values. When creators edit default parameters in the review modal, descriptions update in real-time to reflect the new values.

**Key Features**:
- **Percentage updates**: `flowTargetPercent: "0.75"` replaces "60% FLOW" with "75% FLOW"
- **Time conversions**: `defaultFrequency: "7200"` converts "7200 seconds" to "2 hours" or "every 2 hours"
- **Threshold updates**: Updates decimal values like `liquidityThreshold: "0.05"`
- **Amount updates**: Updates token amounts in descriptions

**Integration in Create Page**:
```typescript
// useEffect monitors parameter changes
useEffect(() => {
  if (!isReviewModalOpen || !reviewDescription) return;

  const paramValues = {
    ...metadataOverrides.defaultParameters,
    defaultFrequency: metadataOverrides.defaultFrequency || ''
  };

  const updatedDescription = updateDescriptionWithValues(reviewDescription, paramValues);
  if (updatedDescription !== reviewDescription) {
    setReviewDescription(updatedDescription);
  }
}, [metadataOverrides.defaultParameters, metadataOverrides.defaultFrequency, isReviewModalOpen]);
```

**Pattern Matching**:
- Percentages: `\d+\s*%?` (e.g., "60%", "0.60")
- Time values: `\d+\s+(seconds?|hours?|days?)` (e.g., "3600 seconds", "1 hour")
- Thresholds: `\d+\.\d*` (e.g., "0.05")
- Smart conversion logic for time (3600s → 1h, 86400s → 1d)

**User Experience**:
1. Creator enters default parameters in main form
2. Opens review modal
3. Edits a parameter value (e.g., flowTargetPercent from 0.60 to 0.75)
4. Description updates instantly: "targeting 60% FLOW" → "targeting 75% FLOW"
5. Creator sees final description before deployment
6. Deployed description reflects creator's intent

### NFT Metadata & Workflow Images

**Feature**: Workflows can have custom IPFS images displayed on marketplace cards and detail pages.

**Default Image**: `https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq`

**Frontend Implementation**:

1. **Create Page** (`src/app/create/page.tsx`):
   - Optional `imageIPFS` input field in main form
   - Optional `imageIPFS` input field in review modal
   - Default placeholder shows coffee image URL
   - User can paste IPFS URL for custom image

2. **Discover Cards** (`src/app/discover/page.tsx`):
   - Image thumbnail displayed above card description
   - Dimensions: Full width, 128px height (h-32 Tailwind class)
   - Rounded corners with proper aspect ratio
   - Error handling: Falls back to default coffee image if custom image fails to load

3. **Detail Page** (`src/app/discover/[id]/page.tsx`):
   - Large image displayed prominently below header
   - Dimensions: Full width, 256px height (h-64 Tailwind class)
   - Positioned above workflow description
   - Same fallback error handling as cards

**Image Error Handling**:
```typescript
<img
  src={workflow.imageIPFS}
  alt={workflow.name}
  className="w-full h-32 object-cover rounded-md"
  onError={(e) => {
    e.currentTarget.src = 'https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq';
  }}
/>
```

**Best Practices**:
- Image dimensions: 400x300px or larger (will be resized responsively)
- File format: PNG, JPG, WebP
- File size: <2MB recommended for fast loading
- Aspect ratio: 4:3 (landscape) recommended for card thumbnails
- Store on IPFS via Pinata for content-addressed persistence

**Deployment Flow**:
1. User optionally uploads image to IPFS (or provides IPFS URL)
2. User enters image URL in create form (optional)
3. Image URL passed to deployment transaction as `imageIPFS` parameter
4. ForteHubRegistry stores imageIPFS in WorkflowInfo struct
5. Discover pages query registry and display image with fallback

### Clone Pricing System

**Architecture**: Creators can set a FLOW price for cloning their workflows.

**Smart Payment Handling**:
- Clone transaction queries workflow price from registry
- If price = 0 or null → free clone (no payment)
- If price > 0 → Only withdraws exact FLOW amount needed from cloner's vault
- Prevents accidental large transfers by checking balance first
- Payment fails early if insufficient balance (before withdrawal)

**Frontend Files**:

**`lib/cloneTransaction.ts`**:
```typescript
// Get workflow price from registry
let workflowInfo = ForteHub.getWorkflowInfo(workflowId: workflowId)
  ?? panic("Workflow not found")

// Smart payment handling
var paymentVault: @FlowToken.Vault? <- nil

if let price = workflowInfo.price {
  if price > 0.0 {
    // Only withdraw exact price amount
    let flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(...)
    let withdrawn <- flowVault.withdraw(amount: price)
    paymentVault <-! withdrawn
  }
}

// Rest of clone logic...
```

**UI Components**:
- **Discover cards**: Show "Free" or "{amount} FLOW" on each workflow card
- **Discover detail**: "Clone Price" stat box showing cost
- **Create page**:
  - `clonePrice` input field in main form (default: "0")
  - `clonePrice` input field in review modal
  - Price shown in deployment summary

**Data Flow**:
1. Creator sets `clonePrice` when deploying workflow
2. Price stored in WorkflowInfo struct in registry
3. Discover pages query registry and display price
4. Cloner's clone transaction checks price before execution
5. Smart withdrawal only takes exact amount needed
6. Payment transferred to creator's account

**Use Cases**:
- Free: Community strategies, templates
- Paid: Advanced yield strategies, specialized bots
- Freemium: Multiple versions at different price points

### Execution Tracking

Events emitted by ForteHub on execution:
```cadence
event WorkflowExecuted(
  workflowId: UInt64,
  workflowName: String,
  ownerAddress: Address,
  timestamp: UFix64,
  executionType: String  // "manual" or "scheduled"
)
```

**Frontend Usage**:
- Indexer listens for events
- Dashboard queries indexer GraphQL for execution history
- Metrics computed per workflow (total runs, success rate, frequency)

## Styling Guide

### shadcn/ui Components
Pre-built, accessible components used throughout:
- `Card` - Container for content sections
- `Button` - All interactive buttons
- `Modal` - Dialogs (deployment result, confirmations)
- `Badge` - Status indicators (creator, listed/unlisted)
- `Input` - Form inputs
- `Select` - Dropdowns (category filter)

### TailwindCSS
- Utility-first styling
- Global styles in `styles/globals.css`
- Dark mode support (via next-themes)
- Responsive breakpoints: `sm`, `md`, `lg`, `xl`

### Color Scheme
- **Primary**: Blue (action buttons, highlights)
- **Success**: Green (deployment success)
- **Error**: Red (failed transactions)
- **Neutral**: Gray (borders, dividers)

## Environment Variables

**`.env.local`** (required for testing):
```env
# Flow Network
# NEXT_PUBLIC_FLOW_NETWORK=testnet
NEXT_PUBLIC_FORTEHUB_REGISTRY=0xc2b9e41bc947f855
NEXT_PUBLIC_NETWORK=testnet

# Optional: IPFS Gateway (defaults to gateway.pinata.cloud)
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud

# Optional: Web3.Storage Key (for IPFS uploads)
NEXT_PUBLIC_WEB3_STORAGE_KEY=your_key_here
```

## Development Workflow

### Local Setup
```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open http://localhost:3000
```

### Building for Production
```bash
# Build
npm run build

# Start production server
npm start
```

### Type Checking
```bash
# Run TypeScript compiler
npm run type-check

# Or with watch mode
npm run type-check:watch
```

### Linting
```bash
# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

## Testing

**Current State**: Unit/integration tests deferred for hackathon.

**Future Test Coverage**:
- Component tests (React Testing Library)
- Hook tests (TanStack React Query)
- Integration tests (Cadence + frontend)
- E2E tests (Playwright, Tenderly)

## Performance Optimizations

### Query Caching
- TanStack Query handles automatic cache invalidation
- Stale times configured per endpoint (30s default)
- Background refetches on window focus

### Code Splitting
- Next.js automatic route-based splitting
- Lazy-loaded modals and heavy components
- Dynamic imports for blockchain utilities

### Image Optimization
- Next.js Image component for responsive images
- IPFS gateway for workflow screenshots

## Known Limitations & Deferred Features

### Current Session Limitations
1. **Token Registry**: Hardcoded in `tokenRegistry.ts` with testnet/mainnet addresses
   - **Current**: Manual updates needed when Flow ecosystem adds tokens
   - **Next Phase**: Replace with dynamic queries to `flow-mcp` for real-time token data
2. **Reschedule Function**: Modal shows placeholder; backend transaction builder needed
3. **Execution History**: Events tracked, indexer integration deferred
4. **LLM Code Generation**: AI prompt UI ready; users manually paste Claude-generated code
5. **Advanced Connectors**: DeFi primitives (swap, oracle) referenced in prompt, full MCP integration deferred

### Completed Features (Phase 8)
- ✅ Clone pricing system (price field in registry, smart payment handling)
- ✅ Clone pricing UI (discovery cards + detail pages show prices)
- ✅ Clone price input on create page (main form + review modal)
- ✅ Description parameter sync utility (auto-update descriptions when parameters change)
- ✅ WorkflowInfo consolidation (cloneCount and forkCount in struct, removed separate dictionaries)
- ✅ NFT metadata image field (imageIPFS in WorkflowInfo struct)
- ✅ Workflow image thumbnails on discover cards (128px height with fallback)
- ✅ Workflow image display on detail page (256px height with fallback)
- ✅ Image input fields on create page (main form + review modal)

### Blockchain Limitations
- **Scheduler only on testnet**: FlowTransactionScheduler available testnet only
- **No arbitrary Cadence templates**: Security requires pre-validated patterns
- **Single manager per wallet**: By design (isolation + simplicity)

### Frontend Limitations
- **No offline support**: Requires active Flow network connection
- **Single wallet per session**: No multi-sig support yet
- **No workflow versioning UI**: Can track code versions, UI not implemented

## Future Improvements

### 🎯 **NEXT PHASE (Weeks 1-4): Migrate Token Registry to MCPs** (HIGHEST PRIORITY)
- **What's needed**: Backend API that queries `flow-mcp` and `flow-defi-mcp` servers
- **Why**: Replace hardcoded token list with real-time data from Flow ecosystem
- **Implementation**:
  1. Build Node.js/Python backend with MCP client
  2. Integrate `flow-mcp`: query available tokens, prices, liquidity
  3. Integrate `flow-defi-mcp`: swap quotes, DEX metadata, oracle data
  4. Expose `/api/tokens` endpoint that returns current token data
  5. Update frontend to call backend instead of `tokenRegistry.ts`
- **Benefit**: Automatic support for new tokens without code changes

### 🚀 **FUTURE: AI-Powered Goal-Based Strategy Generation** (Post-MCP)
- **Vision**: User defines financial goal → AI figures out the optimal path using real-time DeFi data
- **Examples**:
  - User: "Generate 15% annual yield on my USDC"
  - AI: Queries MCPs for available yield strategies → suggests staking pools, DEX LPs, lending → generates Cadence
  - User: "Arbitrage FLOW across multiple DEXs"
  - AI: Analyzes liquidity, pricing, slippage → determines optimal swap routes → generates multi-hop contract
- **How It Works**:
  1. User: States yield goal, risk tolerance, or strategy objective
  2. LLM + MCPs:
     - Queries `flow-defi-mcp` for available protocols (IncrementFi, StableSwap, lending pools)
     - Gets real-time prices, liquidity, APY from Band Protocol/Chainlink
     - Reasons about optimal strategy given constraints
  3. LLM: Generates Cadence with correct connector calls + token addresses
  4. User: Reviews generated code, adjusts parameters, deploys
- **Payment Model**: TBD (credit-based, subscription, per-generation fee, etc.)
- **Real-Time Data**: All strategy decisions based on live MCPs + oracle feeds

**Short-term (1-2 weeks after MCP foundation)**:
- Indexer integration for execution metrics
- Reschedule transaction builder
- Pre-built workflow templates
- Advanced parameter validation

**Medium-term (1-2 months)**:
- Subscription payment system
- Advanced connectors (DeFi, NFT, governance)
- Workflow versioning & rollback
- Swap slippage protection & multi-hop routing

**Long-term (3+ months)**:
- Multi-chain support
- Community template marketplace
- Creator earnings program
- Advanced scheduling (cron patterns)

## Debugging Tips

### Discoverr DevTools
1. Open Chrome DevTools (F12)
2. Look for Flow SDK logs in Console
3. Check Network tab for `/api/flow-query` requests
4. Use React DevTools extension for component debugging

### Common Issues
- **"Cannot find type MetadataViews"**: Check Cadence import addresses in scripts
- **"Insufficient balance"**: Fund testnet account with FLOW tokens
- **"Vault not found"**: Run account initialization transaction
- **Slow queries**: Check indexer status; may need to wait for block finalization

## Contributing

### Code Style
- TypeScript strict mode
- ESLint + Prettier formatting
- Component naming: PascalCase
- Variable/function naming: camelCase
- File structure mirrors component hierarchy

### Commit Messages
```
feat: Add reschedule modal to workflow detail page
fix: Correct MetadataViews import on discover page
docs: Update API endpoint documentation
refactor: Extract workflow query logic to hook
```

### Pull Request Process
1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes with TypeScript types
3. Test locally: `npm run dev` + manual testing
4. Run linter: `npm run lint:fix`
5. Submit PR with description of changes

## Token Detection & Network-Aware Imports (MVP Implementation)

### How It Works

1. **User Input** → User describes workflow (e.g., "FLOW-USDC rebalancer")
2. **Token Detection** → `detectTokensInDescription()` scans input for token symbols
3. **Network Resolution** → Gets testnet/mainnet addresses from `TOKEN_REGISTRY`
4. **Prompt Generation** → Includes only detected tokens with correct imports
5. **LLM → Cadence** → Claude generates code using provided imports
6. **Deployment** → Contract deployed with correct imports for the network

### Files & Functions

**`lib/tokenRegistry.ts`:**
- `TOKEN_REGISTRY`: Hardcoded token data (symbol, addresses, vault types)
- `detectTokensInDescription(text)`: Finds token mentions in user input
- `getTokenAddressForNetwork(token, network)`: Returns address for testnet/mainnet
- `generateTokenInfoForPrompt(tokens, network)`: Creates "AVAILABLE TOKENS" section for LLM
- `getAllImportsForTokens(tokens, network)`: Generates network-specific import statements

**`lib/agentPrompt.ts`:**
- `buildWorkflowPrompt()`: Detects tokens from user input → calls tokenRegistry functions → includes in LLM prompt
- Passes `NEXT_PUBLIC_NETWORK` to all token functions

### Example Flow

```
User: "Create a FLOW-USDC rebalancer"
         ↓
detectTokensInDescription() → [FLOW, USDC]
         ↓
getTokenAddressForNetwork(USDC, "testnet") → 0xdfc20aee650fcbdf
         ↓
LLM prompt includes:
## AVAILABLE TOKENS FOR THIS STRATEGY

**FLOW** (Flow Token):
- Import: `import FlowToken from 0x7e60df042a9c0868`
- Vault Type: `Type<@FlowToken.Vault>()`

**USDC** (USD Coin):
- Import: `import USDC from 0xdfc20aee650fcbdf`
- Vault Type: `Type<@USDC.Vault>()`
         ↓
Claude generates Cadence with correct imports
```

### Supported Tokens (MVP)

**Testnet:**
- FLOW, USDC, USDT, USDF, MOET, WETH, WBTC, cbBTC

**Mainnet:**
- FLOW, USDC (stgUSDC), USDT, USDF, USDCe (Celer), stFlow, ankrFLOW, WETH, WBTC, cbBTC

### Migration Path (Next Phase)

**Current:** Hardcoded addresses → Manual updates when new tokens appear
**Future:** Backend API queries `flow-mcp` → Real-time token data → No code changes needed

## Resources

- **Flow Documentation**: https://developers.flow.com
- **React SDK Docs**: https://github.com/onflow/flow-js-sdk
- **shadcn/ui**: https://ui.shadcn.com
- **TailwindCSS**: https://tailwindcss.com
- **Next.js**: https://nextjs.org
- **Flow MCP**: https://github.com/onflow/flow-mcp (coming soon)
- **Flow DeFi MCP**: https://github.com/onflow/flow-defi-mcp (coming soon)

---

**Questions?** Open an issue or check the main README for architecture overview.

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

## Folder Structure

```
frontend/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── create/                   # Workflow creation UI
│   │   │   └── page.tsx              # AI-powered form + deployment
│   │   ├── browse/                   # Marketplace listing
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
│   │   ├── transactionStatus.ts      # Transaction sealing verification
│   │   ├── forteHubManagerCode.ts    # Manager contract code string
│   │   ├── deploymentTransaction.ts  # Deployment transaction builder
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
- **Deployment Flow**:
  1. User enters strategy (e.g., "FLOW-USDC rebalancer")
  2. Frontend detects tokens → generates LLM prompt with correct imports
  3. User copies prompt to Claude, pastes generated code
  4. Frontend validates Cadence syntax
  5. Code uploaded to IPFS
  6. One-atomic transaction deploys contract + registers in ForteHubRegistry
  7. **NEW**: Frontend polls for transaction sealing (up to 60 seconds)
  8. If sealed: Success modal with contract name, tx ID, Flowscan link
  9. If error: Detailed error modal with troubleshooting steps

**Components**:
- StrategyInput (user describes workflow)
- CodePaste (user pastes generated Cadence)
- ValidationFeedback (syntax checking)
- DeploymentResultModal (success/detailed error with actual blockchain error)
- TransactionStatusChecker (waits for sealing, extracts error messages)

### Browse (`/browse`)
- Public workflow marketplace
- Filter by category
- Search by name
- Clone/fork workflows
- Shows clone count, fork count, creator info

**Components**:
- WorkflowCard (grid item with metadata)
- CategoryFilter (dropdown/tabs)
- SearchBar
- DeployModal (clone confirmation)

### Browse Detail (`/browse/[id]`)
- Full workflow information
- Source code link (IPFS)
- Execution history (from indexer)
- Creator controls (if logged in as creator)
  - **List/Unlist**: Toggle public visibility
  - **Reschedule**: Change execution frequency (placeholder)
- Fork/clone button
- Metadata display (parameters, default values)

**Components**:
- WorkflowHeader (name, creator, stats)
- CreatorControlsCard (list/unlist, reschedule modals)
- WorkflowMetadata (parameter display)
- ExecutionHistory (event-based metrics)
- ForkModal (clone with custom parameters)

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
      import ForteHubRegistry from 0xbd4c3996265ed830

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
    import ForteHubRegistry from 0xbd4c3996265ed830

    access(all) fun main(): [UInt64] {
      return ForteHubRegistry.listPublicWorkflows()
    }
  `,
  query: {
    queryKey: ['public-workflows'],
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
1. Deploys ForteHubManager contract (if user's first time)
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

### Execution Tracking

Events emitted by ForteHubManager on execution:
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
NEXT_PUBLIC_FORTEHUB_REGISTRY=0xbd4c3996265ed830
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

### Browser DevTools
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
fix: Correct MetadataViews import on browse page
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

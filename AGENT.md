# ForteHub DeFi Workflow Studio - Project Configuration

## Project Overview

ForteHub is a Flow blockchain application for generating, deploying, and sharing autonomous DeFi workflows. Users describe their strategy in plain English, Claude AI generates production-ready Cadence smart contracts, and users deploy them to their Flow Testnet wallets.

**Current Status**: MVP complete for testnet. Workflows terminology finalized. MetadataViews integration complete. Composition infrastructure (v2) staged for future enhancement.

## Team-wide Development Standards

- MCP servers standardized across development environments
- Git workflow and commit message standards enforced
- Follow official Flow documentation patterns
- Use incremental, checkpoint-based development
- Testnet-only deployment (no emulator in frontend)
- Implement proper resource handling with @ and & syntax
- Follow MetadataViews standards for standardized contract metadata
- Cadence 1.0 compliant: no custom destroy(), all variables initialized, no default init arguments

## Frequently Used Commands

### Development Setup
1. `flow emulator start --transaction-max-gas-limit=999999 --script-gas-limit=999999 --storage-limit=false` - Start local emulator (high gas limits for development)
2. `flow project deploy --network emulator` - Deploy contracts locally
3. `flow dev-wallet` - Start dev wallet on port 8701
4. `cd frontend && npm run dev` - Start frontend development server

**Important**: The high gas limit flags prevent "computation exceeds limit" errors during complex storage operations in development.

### Testnet Deployment
- Frontend is testnet-only (no emulator fallback)
- All contracts target Flow Testnet addresses
- Configure wallet via FCL discovery service

## Key Files to Reference

- **flow.json** - Project configuration and contract deployments (testnet addresses)
- **cadence/contracts/** - Smart contract implementations
  - ForteHubRegistry.cdc - Global registry tracking all workflows
  - ForteHubManager.cdc - Per-wallet orchestration manager
  - Workflow contracts - User-generated strategy code
- **frontend/** - Next.js 16 + React with shadcn/ui
  - **Blockchain Interaction**: FCL (`@onflow/fcl`) for wallet connection and transactions
  - src/lib/agentPrompt.ts - LLM system prompt for Cadence generation
  - src/lib/deploymentTransaction.ts - Unified deployment transaction builder
  - src/app/create/ - Workflow creation UI
  - src/app/browse/ - Browse/discover workflows (formerly agents)
  - src/app/fork/ - Fork workflow UI (Phase 3, currently disabled)

## MCP Servers

- Use flow-mcp for reading blockchain data, managing accounts, checking balances
- Use flow-defi-mcp for checking token prices, swapping tokens, interacting with DeFi connectors

## Technical Stack

- **Smart Contracts**: Cadence 1.0
- **Blockchain Interaction**:
  - **Frontend**: FCL (`@onflow/fcl`) for wallet connection and transaction submission
  - **Backend/CLI**: Flow SDK for contract deployment and direct chain interactions
- **Frontend**: Next.js 16 + React with shadcn/ui
- **Styling**: Tailwind CSS
- **Deployment**: Flow Testnet only
- **Focus**: Smart contract functionality + workflow marketplace UI

---

## Workflow Architecture (Renamed from Agent)

### Core Terminology

**Workflow** (formerly "Agent"):
- A DeFi strategy deployed to a user's wallet
- Contains strategy logic (rebalancing, yield farming, DCA, arbitrage, custom)
- Managed by per-wallet ForteHubManager
- Can be manually executed or autonomously scheduled
- Examples: Yield Optimizer, DCA Bot, Portfolio Rebalancer, Arbitrage Detector

**ForteHubRegistry** (formerly "AgentRegistry"):
- Global contract tracking all workflows on-chain
- Stores metadata (name, category, description, source code IPFS CID)
- Records clone/fork counts and listing status
- Implements MetadataViews.Resolver for standardized metadata access

**ForteHubManager** (formerly "AgentManager"):
- Deployed once per user wallet
- Orchestrates all workflows owned by that user
- Manages scheduling state, workflow lifecycle
- Handles FlowTransactionScheduler integration for autonomous execution

### Workflow Lifecycle

1. **Creation**: User describes strategy → Claude generates Cadence → Workflow contract deployed
2. **Registration**: ForteHubRegistry records workflow metadata (id, creator, category, IPFS CID)
3. **Cloning**: Users can clone existing workflows, deploy to own wallet
4. **Execution**: Manual `run()` or autonomous via ForteHubManager scheduler
5. **Configuration**: Users update strategy parameters via `setXxx()` methods
6. **Lifecycle**: Pause/resume, unlist, track clone count

### Contract Naming & Storage Paths

- Workflows deploy with clean names (e.g., `DailyRebalancer`)
- Storage paths use: `ForteHub_<deployer>_<ContractName>_Manager/Public` pattern
- No `_2` suffix needed since each user has own account
- ForteHubManager is deployed once per wallet and never overwritten

### Registry Metadata

ForteHubRegistry stores complete workflow metadata:
- `workflowId`: UInt64 - unique identifier
- `creator`: Address - deployer/owner
- `name`: String - display name
- `category`: String - "yield", "dca", "rebalancing", "arbitrage", etc.
- `description`: String - human-readable strategy description
- `sourceCodeIPFS`: String - IPFS CID for source code (content-addressed)
- `contractName`: String - contract identifier for cloning
- `metadataJSON`: String - strategy-specific config field definitions
- `isListed`: Bool - discoverable in public registry
- `capabilities`: {String: AnyStruct} - **NEW**: composition metadata for v2 orchestrator
- `parentWorkflowId`: UInt64? - if forked from another workflow
- `cloneCount`: UInt64 - number of times cloned (excludes original)
- `forkCount`: UInt64 - number of direct forks (children with parentWorkflowId)

### Workflow Composition Infrastructure (v2 - Future)

**Current Status**: Foundation staged, not actively used in MVP.

The `capabilities` field in WorkflowInfo enables future v2 orchestrator that chains workflows:

```json
{
  "inputCapabilities": {
    "tokenType": "FlowToken.Vault",
    "minAmount": "10.0"
  },
  "outputCapabilities": {
    "tokenType": "FlowToken.Vault",
    "produces": "rebalanced_balance"
  },
  "requiredTokens": ["FLOW", "USDC"]
}
```

**Benefits of this design**:
- Zero breaking changes to MVP - capabilities dict can be empty
- Future UI can auto-discover compatible workflows for chaining
- LLM can hint at composition metadata (optional)
- Frontend can build complex strategies by combining simpler workflows
- No code generation needed - just data flow between workflows

**Migration path**:
1. MVP (current): Capabilities field exists but empty `{}`
2. Phase 1.5: LLM optionally populates composition hints
3. Phase 2: Frontend UI for workflow composition
4. Phase 3: Orchestrator contract chains workflows based on capabilities

### Listing & Unlisting

- Workflows start as `isListed=true` (discoverable)
- Creator can unlist anytime: `setWorkflowListing(id, isListed: false)`
- **NEW**: Creator can re-list if no clones exist: `setWorkflowListing(id, isListed: true)`
- Once clones exist: unlist only (prevent re-listing with clones)
- Prevents confusion when original is modified but clones exist

### Clone Recording

`recordClone(workflowId, deployer, contractName)`:
- Precondition: `getAccount(deployer).contracts.get(name: contractName) != nil`
- Verifies caller actually deployed the contract
- Increments `cloneCount` in registry
- Emits `WorkflowCloneRecorded` event

### Fork Tracking

When registering a workflow with `parentWorkflowId != nil`:
- Parent's `forkCount` increments
- New workflow references parent via `parentWorkflowId`
- Enables "see all derivatives of this workflow" queries
- Deeper genealogy derived client-side using `getWorkflowsByParent()`

**TODO (Phase 3+)**: Add explicit `recordFork()` function to ForteHubRegistry for consistency with `recordClone()`:
- Similar precondition validation as `recordClone()`
- Allows explicit fork recording after initial registration if needed
- Emit `WorkflowForkRecorded` event for off-chain indexing
- Current impl: forks auto-increment during registration only

---

## Scheduler & Autonomous Execution Architecture

### Separation of Concerns

**Workflow** (generated per strategy):
- Contains BUSINESS LOGIC ONLY
- Has `run()` method that executes the strategy
- NO scheduler awareness, NO scheduling fields
- Strategy parameters: rebalanceThreshold, flowTargetPercent, etc.
- Optional self-rate-limiting: `minTimeBetweenRuns` (for expensive operations)

**ForteHubManager** (deployed once per wallet):
- **Per-Wallet Deployment**: Each user gets their own manager
- Orchestrates WHEN and IF each workflow runs
- Scheduling state: `executionFrequency`, `isScheduled`, `lastExecutionTime`, etc.
- Methods: `run(workflowId)`, `enableScheduling()`, `disableScheduling()`, `setExecutionFrequency()`
- Scheduler integration: Imports FlowTransactionScheduler, registers/reschedules/cancels tasks

**ForteHubRegistry** (global):
- Template metadata for discovery and cloning
- Does NOT store runtime state
- `isSchedulable`: bool (can this workflow type be scheduled?)
- `defaultFrequency`: UFix64? (suggested frequency if schedulable)
- `configFields`: workflow-owned strategy parameters only

### Workflow Scheduling Metadata

LLM detects scheduling keywords in user description and sets:

```json
{
  "isSchedulable": true,
  "defaultFrequency": "86400.0",
  "description": "Rebalances daily, targeting 60% FLOW..."
}
```

**Scheduling Keywords** that trigger `isSchedulable=true`:
- "daily", "weekly", "monthly", "hourly"
- "recurring", "autonomous", "scheduled"
- "automatically", "every X hours/days"

Manual workflows have `isSchedulable=false` (no scheduling fields in Manager).

### Scheduling Flow

1. **At Deploy**:
   - Frontend parses LLM metadata (isSchedulable, defaultFrequency)
   - If isSchedulable=true: Manager calls `enableScheduling(workflowId, frequency)`
   - ForteHubManager registers task with FlowTransactionScheduler

2. **At Execution**:
   - FlowTransactionScheduler calls registered task at scheduled time
   - Manager executes `run(workflowId)`
   - Workflow executes its strategy logic
   - Task self-reschedules for next interval

3. **At Frequency Change**:
   - Manager's `setExecutionFrequency()` reschedules task with new interval
   - Old task cancelled, new task registered

4. **At Pause/Resume**:
   - Pause: Task cancelled, handler destroyed
   - Resume: New task registered with same or updated frequency

### Handler Resource Pattern

ForteHubManager uses `WorkflowHandler` resource (implements FlowTransactionScheduler interface):
- Stores owner address for accessing manager at execution time
- Executes workflow logic
- Self-reschedules for next execution
- Supports pause/resume via task cancellation/re-registration

Complete handler implementation in CLAUDE.md Security Review Checklist section (lines 528+).

---

## LLM Prompt & Code Generation

### Prompt File: `frontend/src/lib/agentPrompt.ts`

**Function**: `buildWorkflowPrompt(params)` generates system prompt for Cadence generation

**Input Parameters**:
- `strategy`: User's high-level strategy description
- `description`: Full user requirements

**Output**: System prompt covering:
- Cadence 1.0 syntax rules (no custom destroy, all variables initialized, ternary operators)
- Variable initialization patterns with concrete examples
- Network requirements (Testnet only: FLOW, USDC, fuUSDT, fuDAI)
- Function templates for common patterns
- Connector API reference (VaultSource, VaultSink, Swapper, PriceOracle)
- Code structure (contract declaration, resource, init, run methods)
- Type system rules (curly braces only for interfaces)
- DeFi operations patterns (transfer, swap, oracle checks)
- Configurable fields & metadata format
- Response format (JSON with contractCode, metadata, scheduling info)

### LLM Response Format

```json
{
  "agentName": "Descriptive Workflow Name",
  "category": "rebalancing",
  "description": "Strategy description with tokens and defaults",
  "isSchedulable": true,
  "defaultFrequency": "86400.0",
  "configFields": [
    {
      "name": "flowTargetPercent",
      "fieldType": "UFix64",
      "label": "FLOW Target %",
      "default": "0.60",
      "min": "0.0",
      "max": "1.0"
    }
  ],
  "contractCode": "import FungibleToken...complete Cadence code..."
}
```

### Common LLM Errors & Fixes

| Error | Root Cause | Fix |
|---|---|---|
| `missing transfer operator` | Uninitialized variable `let amount: UFix64` | Add initializer: `let amount: UFix64 = 0.0` |
| `expected colon in dictionary` | if/else block in assignment | Use ternary: `x ? a : b` |
| `intersection type with invalid type` | Curly braces on concrete type | Remove braces: `Type<@FlowToken.Vault>()` |
| `ambiguous intersection type` | Wrong curly brace usage | Only use {} for interfaces: `Type<@{FungibleToken.Vault}>()` |
| `cannot assign to constant field` | Using `let` for mutable field | Use `var` instead: `access(all) var field: Type` |
| `missing access modifier` | Field/function without access keyword | Add: `access(all)` or `access(account)` |

---

## Deployment Architecture

### One-Shot Deployment Transaction

**File**: `frontend/src/lib/deploymentTransaction.ts`

**Transaction**: `DEPLOY_WORKFLOW_TRANSACTION`

**Steps**:
1. Deploy ForteHubManager contract (if not exists)
2. Set up required token vaults (FLOW always, USDC/fuUSDT/fuDAI if needed)
3. Deploy workflow contract code
4. Register workflow in ForteHubRegistry with metadata + capabilities dict

**Arguments**:
- `contractName`, `contractCode` - Workflow contract
- `name`, `category`, `description` - Metadata
- `ipfsCID` - IPFS content hash for source code
- `isListed` - Discoverable in public registry
- `metadataJSON` - Strategy-specific config fields JSON
- `vaultSetupInfo` - Map of token names to storage paths (e.g., {"FLOW": "/storage/flowTokenVault"})
- `deployManagerCode`, `managerCode` - ForteHubManager deployment (first time only)
- `capabilities` - **NEW**: Composition metadata dict (empty {} for MVP)

### Vault Setup

`extractVaultSetupInfo()` determines which vaults to set up:
- FLOW: Always included (testnet standard)
- USDC/fuUSDT/fuDAI: Only if tokens detected in strategy description
- Each token gets standard testnet storage path

### Frontend Deployment Flow

1. User describes strategy
2. Claude generates Cadence + metadata JSON
3. Frontend parses response
4. User reviews contract code in modal
5. User confirms deployment
6. Frontend calls `buildDeploymentArgs()` to construct transaction args (including empty capabilities dict)
7. FCL executes deployment transaction
8. On success: Workflow deployed, registered, queryable in registry

---

## Testnet Configuration

### Network Details


### Testnet Readiness Status

- [x] Workflow terminology finalized (Agent → Workflow)
- [x] ForteHubRegistry & ForteHubManager implemented with MetadataViews
- [x] LLM prompt updated with Cadence 1.0 rules and composition guidance
- [x] Deployment transaction supports capabilities metadata
- [x] Frontend testnet-only configuration
- [x] Workflow composition infrastructure staged (v2 ready)
- [ ] Full FlowTransactionScheduler integration (handlers, rescheduling)
- [ ] Testnet smoke tests (deploy, run, schedule, update config)
- [ ] User acceptance testing with real workflow strategies

---

## Security Review Checklist

### Code Generation & Validation

- **Variable Initialization**: LLM reinforced with 6 layers of syntax rules. All `let`/`var` MUST have `=` or `<-` immediately.
- **No Custom Destroy**: Cadence 1.0 auto-destroys. Forbidden pattern: `fun destroy() { ... }`
- **No Default Init Arguments**: LLM forbidden from using `init(param: Type = default)`
- **Ternary Operators**: Required for assignments: `let x: UFix64 = condition ? a : b` (not if/else blocks)
- **Type System**: Curly braces {} ONLY for interfaces. Concrete types: `Type<@FlowToken.Vault>()` (no braces)

### Workflow Safety

- **Strategy Logic Only**: Workflow contains business logic, NO scheduler awareness
- **Run Method**: Pure strategy execution, no timing logic
- **No Scheduler Fields**: executionFrequencySeconds, lastExecutionTime forbidden in workflow code
- **Manager Handles Orchestration**: Scheduling, pause/resume, frequency changes all in ForteHubManager

### ForteHubManager Safety

- `createWorkflow()` destroys replaced workflows to prevent resource loss
- Manager stored at fixed path: `FIXED_MANAGER_STORAGE` (deterministic access)
- One manager per wallet (per-wallet deployment pattern)
- Handler capability properly authorized with Execute entitlement

### Access Control

- **Strategy Setters**: `access(account)` so only deployer can change strategy params
- **Scheduler Operations**: Pause/resume can be `access(all)` but validated internally
- **Registry Restrictions**: Only creator can change workflow listing status
- **Clone Recording**: Verifies deployer actually owns the contract

### Registry Safety

- `recordClone()` precondition: `getAccount(deployer).contracts.get(name: contractName) != nil`
- `cloneCount` excludes original deployment (starts at 0)
- Cannot re-list workflow with existing clones (prevents confusion)
- Fork tracking via `parentWorkflowId` enables lineage queries

### Fund Handling

- Vault withdrawals bounded and guarded with preconditions
- Always destroy or return local vaults after use
- Never leave resources dangling
- Connector calls use correct entitlements: `auth(FungibleToken.Withdraw) &{FungibleToken.Vault}`

### MetadataViews Compliance

- ForteHubRegistry implements Resolver with Display, ExternalURL views
- ForteHubManager implements Resolver for standardized access
- Supports future composability via capabilities metadata field

---

## Open Decisions & Future Enhancements

### Phase 1.5: Composition Infrastructure (Candidate)

**Status**: Foundation coded but disabled. Can be enabled by:

1. LLM optionally populates `capabilities` dict with composition hints
2. Frontend UI parses capabilities and shows "compatible workflows"
3. Orchestrator contract chains workflows based on I/O matching
4. Zero breaking changes - empty `{}` dict for MVP

**Questions to resolve**:
- Should composition be UI-driven or code-driven?
- How to handle type mismatches (UFix64 output → UInt64 input)?
- Should workflows support variadic inputs/outputs?
- Gas costs for chained execution?

### Phase 2: FlowTransactionScheduler Full Integration

**Current**: Manager has placeholder methods for scheduling.

**Future**: Complete implementation with:
- Handler resource self-rescheduling (see handler pattern above)
- Task metadata storage for tracking
- Pause/resume by task cancellation/re-registration
- Frequency updates via reschedule

### Phase 3: Clone UI Improvements (Deferred - Fork UI)

**Fork Workflow** (disabled for now):
- **Current Status**: Fork UI disabled in MVP for simplification
  - Fork button hidden from Browse cards
  - Fork modal disabled in browse/[id]/page.tsx
  - Fork initialization disabled in create/page.tsx
  - Fork code structure preserved for future implementation
  - ForkCount tracking kept in ForteHubRegistry for analytics

- **Future Implementation** (Phase 3):
  - Dedicated `/fork/[id]` route bypassing AI prompt
  - Preload parent metadata and defaults
  - Editable form controls for strategy parameters
  - Deterministic template rewriting instead of LLM regeneration
  - Contract code preview with metadata diff before deployment

### Phase 4: Advanced Features

- Search & filtering in registry (category, creator, popularity)
- Workflow versioning (track all revisions)
- Revenue sharing model (if clones pay creator)
- Workflow composition UI (visual workflow builder)
- Governance for high-risk operations (multi-sig, timelocks)

### Open Considerations

- Persist migration guide if on-chain schema changes (existing WorkflowInfo requires manual redeploy)
- Evaluate hashing contract bytecode in `recordClone()` for full integrity verification
- Document Cadence template expectations (pause/resume, setters, events) for contract authors
- Monitor real workflow patterns to inform future scheduling enhancements

---

## Development Workflow

### Local Emulator Testing

```bash
# Terminal 1: Start emulator
flow emulator start --transaction-max-gas-limit=999999 --script-gas-limit=999999 --storage-limit=false

# Terminal 2: Deploy contracts
flow project deploy --network emulator

# Terminal 3: Start dev wallet (optional)
flow dev-wallet

# Terminal 4: Start frontend
cd frontend && npm run dev
```

### Testnet Deployment

1. Configure wallet via FCL discovery service
2. Ensure wallet has FLOW tokens on testnet
3. Deploy transactions via frontend UI
4. Verify workflow appears in ForteHubRegistry

### Debugging

- LLM generation errors: Check agentPrompt.ts for rule violations
- Deployment transaction failures: Validate contract code syntax, vault setup
- Scheduling issues: Check ForteHubManager handler implementation, scheduler capability
- Frontend errors: Check console logs, FCL transaction results

---

## Key Files Map

### Cadence Contracts

- **cadence/contracts/ForteHubRegistry.cdc** - Global workflow registry
  - WorkflowInfo struct with capabilities field
  - registerWorkflow(), recordClone(), setWorkflowListing()
  - getWorkflowCapabilities() for v2 composition
  - MetadataViews.Resolver implementation

- **cadence/contracts/ForteHubManager.cdc** - Per-wallet orchestration
  - WorkflowHandler resource for scheduling
  - Workflow management (create, run, pause, resume)
  - Scheduling state (frequency, last execution, task IDs)
  - FlowTransactionScheduler integration

- **cadence/defi-actions/** - DeFi connector libraries
  - FungibleTokenConnectors (VaultSource, VaultSink)
  - IncrementFiSwapConnectors (Swapper)
  - BandOracleConnectors (PriceOracle)

### Frontend

- **src/lib/agentPrompt.ts** - LLM system prompt generator
  - buildWorkflowPrompt() - Main prompt builder
  - 20+ sections covering Cadence 1.0 rules, patterns, examples
  - Composition guidance section (optional for MVP)

- **src/lib/deploymentTransaction.ts** - Deployment transaction builder
  - DEPLOY_WORKFLOW_TRANSACTION - Main deployment transaction
  - buildDeploymentArgs() - Constructs FCL arguments
  - extractVaultSetupInfo() - Determines which vaults to set up
  - Includes capabilities parameter (empty {} for MVP)

- **src/app/create/page.tsx** - Workflow creation UI
  - Takes strategy description from user
  - Calls Claude API with LLM prompt
  - Reviews generated contract code
  - Executes deployment transaction
  - Fork initialization disabled (preserved for Phase 3)

- **src/app/browse/page.tsx** - Browse/discover workflows
  - Lists all public workflows from ForteHubRegistry
  - Filter by category
  - Clone button uses recordClone transaction
  - Fork button disabled (will be Phase 3)

- **src/app/browse/[id]/page.tsx** - Workflow details
  - View individual workflow metadata
  - Fork modal disabled (preserved for Phase 3)

- **src/app/page.tsx** - Landing page
  - ForteHub branding
  - "How It Works" (Generate, Deploy, Share)
  - Workflow categories (Yield, DCA, Rebalancing, Arbitrage)
  - Call-to-action buttons

- **src/components/providers/FlowProviderWrapper.tsx** - FCL configuration
  - Testnet-only setup (no emulator)
  - Fixed hydration issues with useState/useEffect pattern

### Configuration

- **flow.json** - Flow CLI configuration
  - testnet contract deployments
  - Account addresses and keys
  - Network settings

- **CLAUDE.md** - This file
  - Project architecture and decisions
  - Deployment guides and checklists

---

## Recent Changes Summary (Finalized)

### Session 1 Changes:
1. **Terminology Refactoring**: Agent → Workflow throughout
2. **Contract Renames**: AgentRegistry → ForteHubRegistry, AgentManager → ForteHubManager
3. **Testnet Migration**: Removed all emulator references from frontend
4. **MetadataViews**: Implemented Resolver pattern in both registry and manager
5. **Composition Infrastructure**: Added capabilities field to WorkflowInfo (empty for MVP, ready for v2)
6. **LLM Prompt**: Updated to explain workflows, composition guidance, Cadence 1.0 rules
7. **Deployment Transaction**: Added capabilities parameter, supports empty dict
8. **Branding**: Updated landing page to ForteHub + DeFi Workflows terminology

### Session 2 Changes (Fork UI Refactoring):
1. **Fork UI Disabled**: Removed fork button from Browse cards, hidden fork modal
2. **Fork Code Extracted**: Created dedicated `/fork/[id]` page for Phase 3 implementation
3. **Create Page Cleaned**: Removed fork-specific state variables, kept core workflow creation
4. **Browse Page Rename**: agents/ → browse/ for clarity (Workflow discovery, not management)
5. **Clone Button Updated**: Uses recordClone transaction with correct parameter names (workflowId, deployer, contractName)
6. **ForkCount Tracking**: Maintained in ForteHubRegistry for future genealogy and analytics
7. **Documentation Updated**: Fixed SDK/FCL terminology, added fork page reference, clarified blockchain interactions

### Git Commits:
- Comprehensive variable initialization fixes in agentPrompt.ts
- Contract renames across Cadence and frontend
- Testnet-only configuration for FCL
- MetadataViews implementation and documentation

### Testing Status:
- [x] LLM code generation (Cadence 1.0 compliant)
- [x] Deployment transaction structure
- [x] Registry metadata + capabilities field
- [x] ForteHubRegistry config struct with owner-only setters
- [ ] Full FlowTransactionScheduler integration (pending)
- [ ] Testnet end-to-end workflow (pending user acceptance)

---

## ForteHubRegistry v2 Enhancements (Future)

### Currently Implemented (v1.0)
- Global workflow registry with workflow metadata
- Clone and fork tracking for analytics
- Public listing controls (creator can list/unlist)
- MetadataViews (Display, ExternalURL) for contract introspection
- Config struct with owner-only setters following Cadence 1.0 best practices

### Configuration Fields (Updatable via `access(account)` setters)
- **listingFeePercentage** (UFix64): Fee charged for listing workflows (0-10%)
- **requireCreatorVerification** (Bool): Whether creators must be verified
- **maxDescriptionLength** (UInt64): Maximum workflow description length
- **enabledCategories** ([String]): Allowed workflow categories
- **owner** (Address): Registry owner for admin functions

### v2 Considerations for Next Phase
1. **Fee Collection & Distribution**
   - Integrate Flow token deposit/withdrawal for listing fees
   - Add fee collector and revenue tracking
   - Implement refund mechanism for withdrawn workflows

2. **Creator Verification System**
   - Link to external identity verification service (future)
   - Trusted creator badges/ratings
   - KYC/AML integration points

3. **Advanced Search & Filtering**
   - Category filters with config-controlled enabled categories
   - Creator reputation scores
   - Clone/fork count-based sorting
   - Time-based trending (new, popular)

4. **Workflow Versioning**
   - Track workflow updates and versions
   - Deprecation mechanism for old versions
   - Backward compatibility checks

5. **Governance & Community**
   - Workflow moderation/reporting system
   - Community voting on featured workflows
   - Admin controls for removing malicious contracts

6. **Analytics & Metrics**
   - Execution count per workflow
   - Gas usage tracking
   - Success/failure rates
   - User retention metrics

7. **Security Enhancements**
   - Contract code audit status tracking
   - Security scoring/rating system
   - Automated code analysis integration
   - Bytecode verification beyond IPFS hash

### Architecture Notes for v2
- RegistryConfig allows dynamic policy updates without redeployment
- Config update events should be emitted for frontend tracking
- Consider Rate limiting for API endpoints that query registry
- Pagination support for large workflow lists (future API)
- Batch registration/update operations for efficiency


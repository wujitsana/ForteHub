# ForteHub DeFi Workflow Studio - Project Configuration

## Project Overview

ForteHub is a Flow blockchain application for generating, deploying, and sharing autonomous DeFi workflows. Users describe their strategy in plain English, AI generates production-ready Cadence smart contracts, and users deploy them to their Flow Testnet wallets.

**Current Status**: MVP complete for testnet. Workflows terminology finalized. MetadataViews integration complete. Clone pricing system implemented. Composition infrastructure (v2) staged for future enhancement.

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
  - ForteHub.cdc - Per-wallet orchestration manager (stores each clone inside a transferable `WorkflowToken`)
  - ForteHubMarket.cdc - Secondary marketplace contract that escrows `WorkflowToken`s and handles peer-to-peer clone resales
  - Workflow contracts - User-generated strategy code
- **frontend/** - Next.js 16 + React with shadcn/ui
  - **Blockchain Interaction**: Flow React SDK (`@onflow/react-sdk`) drives wallet auth plus every transaction via `TransactionButton` + `TransactionDialog`, so sealing status and error handling are consistent without custom polling helpers
  - src/lib/agentPrompt.ts - LLM system prompt for Cadence generation
  - src/lib/deploymentTransaction.ts - Unified deployment transaction builder
  - src/app/create/ - Workflow creation UI
  - src/app/discover/ - Discover/discover workflows (formerly agents)
  - src/app/fork/ - Fork workflow UI (Phase 3, currently disabled)

## MCP Servers

- Use flow-mcp for reading blockchain data, managing accounts, checking balances
- Use flow-defi-mcp for checking token prices, swapping tokens, interacting with DeFi connectors

## Technical Stack

- **Smart Contracts**: Cadence 1.0
- **Blockchain Interaction**:
  - **Frontend**: Flow React SDK (`@onflow/react-sdk`) for wallet auth + transaction UX (wraps `@onflow/fcl` under the hood)
  - **Backend/CLI**: Flow SDK for contract deployment and direct chain interactions
- **Frontend**: Next.js 16 + React with shadcn/ui
- **Styling**: Tailwind CSS
- **Deployment**: Flow Testnet only
- **Focus**: Smart contract functionality + workflow marketplace UI

---

## Workflow Architecture (Renamed from Agent)

### Core Terminology

**Workflow** :
- A DeFi strategy deployed to a user's wallet
- Contains strategy logic (rebalancing, yield farming, DCA, arbitrage, custom)
- Managed by per-user Manager resource (created from central ForteHub)
- Can be manually executed or autonomously scheduled
- Examples: Yield Optimizer, DCA Bot, Portfolio Rebalancer, Arbitrage Detector

**ForteHubRegistry** :
- Global contract tracking all workflows on-chain
- Stores metadata (name, category, description, source code IPFS CID)
- Records clone/fork counts and listing status
- Implements MetadataViews.Resolver for standardized metadata access

**ForteHub** :
- Deployed once centrally 
- Users create Manager resources from the central contract
- Each Manager resource orchestrates workflows owned by that user
- Manages scheduling state, workflow lifecycle, autonomous execution
- Handles FlowTransactionScheduler integration for autonomous execution

### Workflow Lifecycle

1. **Creation**: User describes strategy → LLM generates Cadence → Workflow contract deployed
2. **Registration**: ForteHub Registry records workflow metadata (id, creator, category, IPFS CID)
3. **Cloning**: Users can clone existing workflows, deploy to own wallet
4. **Execution**: Manual `run()` or autonomous via ForteHub scheduler
5. **Configuration**: Users update strategy parameters via `setXxx()` methods
6. **Lifecycle**: Pause/resume, unlist, track clone count

### Workflow Resource Pattern & Factory Functions

**ARCHITECTURE DECISION**: Workflows are **RESOURCES** conforming to `ForteHub.IWorkflow`, not contract-level functions.

**Why Resources?**
- State isolation: Each workflow is independent
- Lifecycle management: Can pause, resume, burn
- Configuration: Strategy parameters stored in resource fields
- Future composition: Resources can coordinate via stored references

**How It Works:**
1. **LLM generates**: Contract with `Workflow resource` + `createWorkflow(workflowId, config, manager: &{ForteHub.WorkflowAcceptance}, ticket: @ForteHub.CloneTicket?)` factory function.
2. **Factory pattern**: Workflow factory **does not return** a resource; it creates one and immediately calls `manager.acceptWorkflow(workflowId: workflowId, workflow: <-workflow, ticket: <-ticket)` so only ForteHub managers can store clones (ticket can be `nil` when the creator is cloning their own workflow).
3. **Deployment**: One-shot transaction calls factory to instantiate resource
4. **Storage**: Resource stored in `ForteHub.workflows` dictionary
5. **Execution**: Manager calls `workflow.run()` (manual or scheduled)
6. **Configuration**: User calls setter functions like `setFlowTargetPercent()`

**Required Interface Conformance:**

Every Workflow resource MUST have:
```cadence
// Required fields (IWorkflow interface)
access(all) let id: UInt64           // Unique workflow ID
access(all) let name: String          // Display name
access(all) let category: String      // Category (yield, dca, rebalancing, etc.)
access(all) var isPaused: Bool        // Pause/resume state

// Required methods (IWorkflow interface)
access(all) fun run()                 // Execute strategy
access(all) fun pause()               // Pause execution
access(all) fun resume()              // Resume execution

// Strategy-specific fields
access(all) var flowTargetPercent: UFix64    // Example: rebalance target

// Strategy setters (access(account) for permission control)
access(account) fun setFlowTargetPercent(val: UFix64)
```

**Alternatives Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Resources (CHOSEN)** | State isolation, lifecycle control, composition-ready | More complex deployment |
| Contract-level functions | Simple deployment, matches Flow patterns | Less state management, no composition |
| Pre-stored resources | Even simpler deployment | Inflexible, harder to update |

### Deployment Pipeline (Two Transactions)

**Stage 1 – Setup & Registry (`DEPLOY_WORKFLOW_TRANSACTION`)**
- Initializes FlowTransactionScheduler manager (idempotent helper)
- Calls `ForteHub.initializeManager(account: signer)` to guarantee the wallet owns a Manager resource
- Deploys the workflow contract (panics if redeployed)
- Creates & publishes token vaults/capabilities for every required asset
- Registers the workflow via `Manager.registerWorkflow(...)`, which computes the on-chain code hash and stores metadata/IPFS references
- Auto-schedules via `ForteHub.scheduleWorkflow(...)` when metadata marks the workflow as schedulable
- **Does not instantiate the workflow resource**—that is now handled separately.

**Stage 2 – Workflow Factory Transaction (per contract)**
- Imports the workflow contract + ForteHub, borrows the manager acceptance interface, and calls `createWorkflow(...)`
- Factory creates the resource and immediately deposits it via `manager.acceptWorkflow(...)`
- Creators pass `ticket: <-nil`; cloners pass the ticket purchased via `ForteHub.purchaseCloneTicket`

```cadence
import DailyRebalancer from 0xCREATOR
import ForteHub from 0xc2b9e41bc947f855

transaction(
  workflowId: UInt64,
  config: {String: AnyStruct},
  ticket: @ForteHub.CloneTicket?
) {
  prepare(signer: auth(Storage, Capabilities) &Account) {
    let managerRef = signer.storage.borrow<&ForteHub.Manager>(
      from: ForteHub.FORTEHUB_MANAGER_STORAGE
    ) ?? panic("Manager not initialized")
    let managerAcceptance: &{ForteHub.WorkflowAcceptance} = managerRef

    DailyRebalancer.createWorkflow(
      workflowId: workflowId,
      config: config,
      manager: managerAcceptance,
      ticket: <-ticket
    )
  }
}
```

**Helper**: `generatePerWorkflowDeploymentTransaction(contractName, userAddress)` (in `deploymentTransaction.ts`) emits a Stage‑2 template so devs can embed the concrete contract import + config dictionary when they need to seed an instance.

### Contract Naming & Storage Paths

- Workflows deploy with clean names (e.g., `DailyRebalancer`)
- Storage paths use: `ForteHub_<deployer>_<ContractName>_Manager/Public` pattern
- No `_2` suffix needed since each user has own account
- ForteHub is deployed once per wallet and never overwritten
- **FlowTransactionScheduler Manager**: Stored at standard `FlowTransactionSchedulerUtils.managerStoragePath`

### Registry Metadata

ForteHub stores complete workflow metadata:
- `workflowId`: UInt64 - unique identifier
- `creator`: Address - deployer/owner
- `name`: String - display name
- `category`: String - "yield", "dca", "rebalancing", "arbitrage", etc.
- `description`: String - human-readable strategy description
- `sourceCodeIPFS`: String - IPFS CID for source code (content-addressed)
- `contractName`: String - contract identifier for cloning
- `metadataJSON`: String - strategy-specific config field definitions
- `isListed`: Bool - discoverable in public registry
- `price`: UFix64? - FLOW amount charged per clone (null/0 for free)
- `imageIPFS`: String? - **NEW**: IPFS URL for workflow thumbnail image (defaults to coffee image)
- `capabilities`: {String: AnyStruct} - composition metadata for v2 orchestrator
- `parentWorkflowId`: UInt64? - if forked from another workflow
- `cloneCount`: UInt64 - number of times cloned (excludes original)
- `forkCount`: UInt64 - number of direct forks (children with parentWorkflowId)

### Workflow Cloning Architecture

**Key Principle**: Each user gets their **own independent resource instance** - nobody has access to your resources.

**Cloning Flow**:

1. **Registry Lookup**
   - User calls `CloneWorkflow` transaction with `sourceWorkflowId`
   - Manager queries registry for workflow metadata (creator, contract name, IPFS CID)

2. **Contract Verification**
   - Manager verifies contract code exists at creator's address
   - Uses `ForteHub.verifyContractCode()` to compute SHA-256 hash (on-chain, real-time)
   - Compares hash against IPFS CID stored at registration (immutable reference)
   - If contract doesn't exist or code was modified, clone fails immediately

3. **Resource Factory**
   - Transaction calls `SourceContract.createWorkflow(workflowId, config, manager, ticket)` factory function
   - Factory creates the resource and immediately deposits it via `manager.acceptWorkflow(...)`

4. **Storage**
   - Manager stores the workflow under the canonical workflowId (registry ID) once `acceptWorkflow` succeeds
   - You have full ownership and control

5. **Recording**
   - `Manager.cloneResource(sourceWorkflowId)` calls `Registry.recordClone()`
   - Registry increments clone count (verified on-chain)
   - Event emitted for indexing

**Security Guarantees**:
- ✅ Contract code verified against IPFS CID before creating instance
- ✅ Each clone is completely independent (different resource instances)
- ✅ No access to other users' resources
- ✅ Clone count accurate (requires verified contract + registry record)
- ✅ `recordClone()` restricted to `access(account)` (only ForteHub contract can call)

### Clone Pricing System

**Architecture**: Creators can charge FLOW for each clone of their workflow. Prices are stored in the registry and enforced at clone time.

**Price Field**:
- `price`: UFix64? - FLOW amount charged per clone
- `null` or `0.0` = free clone
- Example: `0.5` charges 0.5 FLOW per clone

**Payment Flow**:

1. **At Clone**:
   - Cloner initiates `CloneWorkflow` transaction
   - Smart contract checks workflow's `price` from registry
   - If price > 0.0: Cloner's FLOW vault is queried for sufficient balance
   - Exact price amount is withdrawn from cloner's vault (smart withdrawal - only withdraw what's needed)
   - Payment vault created and sent to creator's account via transfer
   - Workflow resource instantiated and stored in cloner's Manager
   - Clone recorded in registry

2. **Smart Payment Handling**:
   - Contract checks if price > 0.0 before attempting withdrawal
   - Only withdraws the exact FLOW amount needed (not entire vault)
   - Prevents accidental large transfers
   - If cloner has insufficient balance: transaction panics before payment is taken

3. **Creator Incentives**:
   - Creators set price on initial deployment (default: free)
   - Can update price after deployment via `setWorkflowPrice()` function
   - Only affects future clones (existing clones unaffected)
   - Price update restricted to `access(account)` (creator only)

**Frontend Implementation**:

1. **Create Workflow Page** (`frontend/src/app/create/page.tsx`):
   - Added `clonePrice` state (default: "0" for free)
   - Price input field in main form
   - Price input field in review modal
   - Price shown in deployment summary
   - Passed to deployment transaction via `buildDeploymentArgs()`

2. **Discovery Pages**:
   - **discover/page.tsx**: Lists all public workflows with clone prices displayed on cards
   - **discover/[id]/page.tsx**: Shows detailed workflow view with "Clone Price" stat box
   - Price displays as "Free" or "{amount} FLOW"
   - Clone button includes price in transaction

3. **Clone Transaction** (`frontend/src/lib/cloneTransaction.ts`):
   - Queries registry for workflow price before cloning
   - Smart withdrawal: only withdraw if price > 0.0
   - Handles optional UFix64? price type properly
   - Payment vault created and transferred to creator

**Use Cases**:
- **Free Workflows**: Community strategies, educational templates
- **Premium Workflows**: Advanced yield strategies, arbitrage bots, specialized DeFi operations
- **Freemium Model**: Free basic version with paid enhanced version as separate workflow
- **Revenue Sharing**: Creators earn FLOW from popular workflows

**Future Enhancements**:
- Batch clone pricing (discounts for multiple clones)
- Revenue sharing tiers (platform fee % goes to creator)
- Subscription-based access (periodic payments vs. one-time)
- Refund mechanism for unsatisfactory clones

### NFT Metadata & Workflow Images

**Architecture**: Workflows store optional image metadata for marketplace display and NFT compatibility.

**Image Field**:
- `imageIPFS`: String? - IPFS URL for workflow thumbnail image
- Default: `https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq` (coffee image)
- Optional: Creators can upload custom images to IPFS and provide URL

**Frontend Implementation**:

1. **Create Workflow Page** (`frontend/src/app/create/page.tsx`):
   - `imageIPFS` input field in main form (optional)
   - `imageIPFS` input field in review modal
   - Passed to deployment transaction with default fallback

2. **Discover Cards** (`frontend/src/app/discover/page.tsx`):
   - Small image thumbnail (h-32, full width)
   - Graceful error handling: Falls back to coffee image if URL fails
   - Positioned below card header for visual appeal

3. **Discover Detail Page** (`frontend/src/app/discover/[id]/page.tsx`):
   - Large image display (h-64, full width)
   - Positioned prominently above description
   - Same fallback mechanism for reliability

**NFT Marketplace Support**:
- Images enable future NFT marketplace integration
- MetadataViews-compatible structure (Display view can reference imageIPFS)
- Supports workflow as NFT with custom artwork
- Enables secondary market with resale royalties

**Best Practices**:
- Use Pinata or similar IPFS service for image uploads
- Image dimensions: 500×500px or larger (square aspect ratio)
- File size: Keep under 5MB for optimal loading
- Format: PNG or JPEG recommended
- Keep images professional and relevant to workflow category

### Workflow Destruction & Cleanup

**burnWorkflow() Function**:
- Permanently destroys a workflow resource from the Manager
- **NEW**: Automatically cancels scheduled tasks before destruction
- Requires Account parameter to clean up scheduled handler resources
- Prevents orphaned handler resources and scheduler tasks

**Implementation**:
```cadence
fun burnWorkflow(workflowId: UInt64, account: auth(Storage) &Account) {
    // Step 1: Unschedule if scheduled
    let handlerStoragePath = StoragePath(identifier: "ForteHubWorkFlow_".concat(workflowId.toString()).concat("_Handler"))!
    if account.storage.check<@ForteHubTransactionHandler>(from: handlerStoragePath) {
        let handler <- account.storage.load<@ForteHubTransactionHandler>(from: handlerStoragePath)
        destroy handler
    }

    // Step 2: Remove and destroy workflow resource
    let workflow <- self.workflows.remove(key: workflowId)!
    destroy workflow
}
```

**Why Account Parameter?**
- Manager resource cannot directly access Account storage
- Handler resources stored at specific paths need account-level access to remove
- Account parameter provides necessary authority for cleanup
- Follows Cadence best practice: move side effects outside resource methods

**Transfer Functionality (Future)**:
- `removeWorkflow()` allows extracting workflow before destruction
- Enables workflow marketplace: users can transfer ownership
- Paired with `depositWorkflow()` for deposit-then-execute pattern
- Separate from burnWorkflow (destruction with cleanup vs. transfer)

### Contract Code Verification Architecture

**Single Source of Truth**: All contract verification logic lives in **ForteHub** contract. ForteHub Manager calls registry functions to verify contracts.

**Why This Design?**
- Avoids duplicate verification logic
- Registry is authoritative source for workflow metadata (including IPFS CID)
- One place to maintain and audit verification code

**Verification Functions** (in ForteHub):

```cadence
/// Compute SHA-256 hash of deployed contract code
/// Returns hash as hex-encoded string (matches IPFS content addressing algorithm)
/// Panics if contract not found (handles both verification AND existence check)
access(all) fun verifyContractCode(
    creatorAddress: Address,
    contractName: String
): String

/// Used by both:
/// - registerWorkflow() to verify code at registration time
/// - Manager.cloneResource() to verify code hasn't been modified
```

**Two-Point Verification**:

**1. At Registration**:
- Creator deploys workflow contract to their account
- Registry.registerWorkflow() calls verifyContractCode() to:
  - Confirm contract exists at creator's address
  - Compute SHA-256 hash of deployed code (on-chain)
  - Verify contract is hashable and deployable
- Registry stores IPFS CID as immutable reference (not the hash)
- Verification ensures the registered IPFS CID contains the actual deployed code

**2. At Cloning** (Real-time verification):
- Cloner calls Manager.cloneResource(sourceWorkflowId)
- Manager calls Registry.verifyContractCode() to:
  - Compute SHA-256 hash of CURRENT deployed code at creator's address (real-time)
  - If contract doesn't exist: panic immediately (deleted contract)
  - If code was modified: hash will differ from original (can be detected)
- Compare hashes against stored IPFS CID
- If contract modified/deleted: verification fails, clone prevented
- **Key**: This prevents creators from modifying contracts after registration and spreading malicious code

**Code Flow**:

```cadence
// In Manager.cloneResource()
let registryRef = getAccount(self.registryAddress).contracts.borrow<&ForteHub>(...)
let workflowInfo = registryRef.getWorkflowInfo(sourceWorkflowId)

// STEP 1: Real-time verification via registry
// Computes SHA-256 hash of CURRENT deployed contract code
// Panics if contract doesn't exist (deleted) or cannot be hashed
let currentCodeHash = registryRef.verifyContractCode(
    creatorAddress: workflowInfo.creator,
    contractName: workflowInfo.contractName
)

// STEP 2: Get immutable reference (registered at deployment time)
let ipfsCID = workflowInfo.sourceCodeIPFS

// STEP 3: Compare hashes
// currentCodeHash: hex-encoded SHA-256 of deployed code (on-chain computed)
// ipfsCID: IPFS CIDv1 (bafy...) which encodes SHA-256 of original code (base32-encoded)
//
// If currentCodeHash != ipfsCID (after decoding from base32):
//   → Code was modified after registration
//   → Clone fails
```

**IPFS CID Verification**:
- IPFS CID format: CIDv1 (bafy...) - latest IPFS standard, more future-proof than CIDv0 (Qm...)
- CIDv1 uses base32 encoding, CIDv0 uses base58 - both encode SHA-256 hash
- Frontend uses SHA-256 algorithm (ipfs.service.ts: `crypto.createHash('sha256')`)
- On-chain: verifyContractCode() computes SHA-256 of deployed code
- Comparison: Decode base32(bafy...) CID to extract SHA-256 hash, compare with currentCodeHash
- **Security**: If code modified → hash changes → verification fails → clone blocked

**Access Control**:
- `verifyContractCode()` is `access(all)` - anyone can verify
- `registerWorkflow()` verifies contracts exist but is public
- `recordClone()` is `access(account)` - only ForteHub contract can call
- Prevents transaction-level bypass of verification

**Contract Requirements**:

Every cloneable workflow contract MUST expose:
```cadence
access(all) fun createWorkflow(
    workflowId: UInt64,
    config: {String: AnyStruct},
    manager: &{ForteHub.WorkflowAcceptance},
    ticket: @ForteHub.CloneTicket?
) {
    let workflow <- create Workflow(
        id: workflowId,
        name: "...",
        category: "...",
        ...strategy-specific-params...
    )

    manager.acceptWorkflow(
        workflowId: workflowId,
        workflow: <-workflow,
        ticket: <-ticket
    )
}
```

Users clone by calling this factory with their own parameters, not by copying resources.

### Frontend Code Verification

**Goal**: Verify IPFS source code matches on-chain registry hash to detect tampering or corruption.

**Implementation Layers**:

1. **At Deployment** (create/page.tsx):
   - Upload source code to IPFS via Pinata API with `cidVersion: 1` (bafy... format)
   - Compute SHA-256 hash of source code: `crypto.createHash('sha256').update(sourceCode).digest('hex')`
   - Verify CIDv1 integrity: Decode base32 from CID and compare extracted hash with computed hash
   - If mismatch: Block deployment (IPFS upload corrupted)
   - Hash is stored on-chain as `sourceCodeHash` in WorkflowInfo

2. **At Discovery/Cloning** (discover/[id]/page.tsx):
   - Fetch workflow data (either from context if navigated from discover page, or via on-chain query if direct page load)
   - Fetch source code from IPFS using the `sourceCodeIPFS` CID
   - Compute SHA-256 hash of fetched code: `crypto.createHash('sha256').update(sourceCode).digest('hex')`
   - Compare with `workflow.sourceCodeHash` (on-chain registry value)
   - Display three-way verification:
     - IPFS Code Hash: SHA-256 computed from fetched source
     - Registry Hash: SHA-256 stored on-chain at registration
     - Match Status: ✓ Match (safe) or ✗ Mismatch (tampered/corrupted)
   - If mismatch: Show warning "Do not clone this workflow"

**Security Properties**:

| Scenario | IPFS Upload | Registry | Current Deploy | Frontend Shows | Action |
|----------|-------------|----------|-----------------|-----------------|--------|
| Normal flow | ✓ Match | ✓ Recorded | ✓ Match registry | ✓ Verified | Safe to clone |
| IPFS corrupted | ✗ Mismatch | ✓ Correct | ✓ Correct | ✗ Mismatch | Block deployment |
| Code modified post-reg | ✓ Was correct | ✓ Original hash | ✗ Different | ✗ Mismatch | Warn user, block clone |
| Creator bypass attempt | N/A | ✗ Wrong hash | N/A | ✗ Mismatch | Reject clone |

**Implementation Details**:

- **CIDv1 Decoding** (ipfs.service.ts: `decodeCIDv1ToHash()`):
  - CIDv1 format: `bafy...` (base32-encoded)
  - Base32 alphabet: `a-z, 2-7` (RFC 4648)
  - Extract multihash: Skip codec byte (0x12 = SHA2_256), length byte (0x20 = 32 bytes)
  - Result: 32-byte SHA-256 hash as hex string

- **IPFS Upload** (ipfs.service.ts: `uploadWorkflowToIPFS()`):
  - Request CIDv1 via Pinata options: `{ cidVersion: 1 }`
  - Return both CID and SHA-256 hash for frontend verification

- **Hash Verification** (discover/[id]/page.tsx):
  - Computes hash of fetched source: `computeSourceHash(source)`
  - Compares with registry hash: `ipfsHash === registryHash`
  - Displays both hashes for debugging/transparency
  - Stores computed hash in state for UI display

**Frontend Trust Model**:

- ✅ IPFS is canonical source (content-addressed, immutable by hash)
- ⚠️ On-chain registry can be wrong (if someone bypasses frontend to register with wrong hash)
- ⚠️ Deployed contract can change (if creator updates after registration)
- ✅ Frontend verification catches both on-chain and IPFS mismatches
- ✅ On-chain verification (at clone time) catches code modifications after registration

**Future Optimizations**:

1. **IPFS Dependency Removal** (optional, Phase 2):
   - Currently store both IPFS CID and SHA-256 hash
   - Could remove IPFS dependency by fetching contract code directly from blockchain
   - Trade-off: More blockchain queries vs. faster UX (IPFS is faster)

2. **Three-Way Verification** (optional, Phase 2):
   - Fetch current deployed contract code from blockchain
   - Compare: IPFS hash vs Registry hash vs Deployed hash
   - Detects if contract was updated after registration

3. **Base32 CID Comparison** (optional, Phase 3):
   - Implement base32 decoder in Cadence
   - Compare CID directly on-chain without needing separate hash field
   - Reduces on-chain storage (store only CID, compute hash as needed)

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

### Future Workflow Orchestration (Phase 3+)

**Current Architecture Foundation**:
- `ForteHub.Manager` (per-wallet): Manages individual workflow execution and scheduling
- Single entry point: `run(workflowId)` executes one workflow at a time
- Shared resources: All workflows in Manager access same vaults (FLOW, USDC, etc.)

**Orchestrating Workflow Combinations**:
When ready to enable multi-workflow orchestration, the Manager can support:
1. **Sequential execution**: `runWorkflowSequence([workflowIds])` - execute workflows in order
2. **Capability matching**: Match output tokens/amounts from workflow A to input requirements of workflow B
3. **Data flow**: Workflows share vault state, enabling natural composition (A modifies vault, B reads it)
4. **Scheduling combinations**: Coordinate execution frequency of dependent workflows

**Why current design supports this**:
- Each workflow already has isolated `run()` logic but shared vault access
- Manager stores all workflows and their configs in one place
- No inter-workflow dependencies are hardcoded - all coordination can be added in Manager
- Empty `capabilities` dict in WorkflowInfo is reserved for composition hints (input/output types, amounts)
- No breaking changes needed - composition is additive

**Naming Rationale**:
- Resource remains `ForteHub.Manager` (not "Orchestrator") until we actually orchestrate workflows
- Keeps naming simple and true to current functionality
- When Phase 3 adds multi-workflow coordination, we can enhance Manager methods without renaming
- "Manager" accurately describes current role: manages workflows (add, remove, run, schedule)

### Listing & Unlisting

- Workflows start as `isListed=true` (discoverable)
- Creator can unlist anytime: `setWorkflowListing(id, isListed: false)`
- **NEW**: Creator can re-list if no clones exist: `setWorkflowListing(id, isListed: true)`
- Once clones exist: unlist only (prevent re-listing with clones)
- Prevents confusion when original is modified but clones exist

### Clone Recording & Cloning Strategy

#### Clone Recording

`recordClone(workflowId, cloner)`:
- Precondition: Caller initiates clone; records `cloner` address
- No contract deployment verification needed (resource-based cloning)
- Increments `cloneCount` in registry
- Emits `WorkflowCloneRecorded` event

#### Cloning Model (Resource-Based)

**Architecture Decision**: Use resource-based cloning instead of contract deployment.

**Resource-Based Cloning (NEW - Recommended)**
- Calls original workflow contract's factory function
- Instantiates `Workflow resource` from parent contract
- No new contract deployment (lightweight)
- Config fields snapshot current Registry template defaults
- Immutable reference (each clone gets isolated resource)
- Fast and efficient (no IPFS fetch, no contract code replication)
- Best for: Performance, simplicity, registry-driven defaults

**Instance Configuration Freezing**
- When cloner instantiates workflow resource, `run()` captures current Registry metadata
- Config fields stored in resource instance remain frozen for that clone
- Original Registry continues to evolve for future cloners
- Creator updates trigger `WorkflowMetadataUpdated` events
- Clones get optional notifications but maintain snapshot config

**Why Resource-Based?**
- Avoids contract code duplication (reduces wallet bloat)
- One-shot factory call (no AddContract auth needed)
- Registry-driven metadata evolution (creator updates apply to future clones only)
- Cleaner separation: Template (Registry) vs Instance (Resource)
- Enables event-driven update notifications

**Previous Approaches (Deprecated)**
- ~~Contract cloning~~: Required AddContract auth, code duplication, difficult contract name management
- ~~IPFS cloning~~: Still available for source code reference, but instantiation is resource-based now

### Fork Tracking

When registering a workflow with `parentWorkflowId != nil`:
- Parent's `forkCount` increments
- New workflow references parent via `parentWorkflowId`
- Enables "see all derivatives of this workflow" queries
- Deeper genealogy derived client-side using `getWorkflowsByParent()`

**TODO (Phase 3+)**: Add explicit `recordFork()` function to ForteHub for consistency with `recordClone()`:
- Similar precondition validation as `recordClone()`
- Allows explicit fork recording after initial registration if needed
- Emit `WorkflowForkRecorded` event for off-chain indexing
- Current impl: forks auto-increment during registration only

### Metadata Updates & Event-Driven Notifications

**Architecture Decision**: Creators can update workflow metadata (name, description, config fields) after deployment.

**Update Transaction**: `updateWorkflowMetadata(workflowId, creator, name, description, metadataJSON)`
- Only creator can update
- Updates Registry template metadata
- Emits `WorkflowMetadataUpdated` event
- Does NOT affect existing clones (they keep their snapshot config)
- Future clones receive updated defaults from Registry

**Event-Driven Notifications**
- Frontend listens for `WorkflowMetadataUpdated` events via `useFlowEvents` hook
- Discover page shows "Updated" badge when a parent workflow has been updated
- Dashboard notifies users when their cloned workflow's parent has updates
- No automatic sync (clones maintain config isolation)

**Use Cases**
- Creator tweaks default config parameters
- Adds/removes strategy-specific config fields
- Improves workflow name or description for clarity
- Propagates updates to future cloners without breaking existing instances

**Implementation**
- `UpdateMetadataModal` component in dashboard for creators
- Registry function verifies creator authorization
- Frontend subscribes to WorkflowMetadataUpdated event
- Clones remain isolated but get notified of parent changes

---

## Scheduler & Autonomous Execution Architecture

### Separation of Concerns

**Workflow** (generated per strategy):
- Contains BUSINESS LOGIC ONLY
- Has `run()` method that executes the strategy
- NO scheduler awareness, NO scheduling fields
- Strategy parameters: rebalanceThreshold, flowTargetPercent, etc.
- Optional self-rate-limiting: `minTimeBetweenRuns` (for expensive operations)

**ForteHub.Manager** (per-user Manager resource):
- **Central Contract Deployment**: ForteHub contract deployed once at 0xd695aea7bfa88279 (never changes)
- **Per-User Resources**: Each user creates their own Manager resource via initializeManager()
- Orchestrates WHEN and IF each workflow runs
- Methods: `run(workflowId)`, stores workflows, manages execution
- Scheduler integration: WorkflowHandler callback borrows Manager to execute workflows
- Handler stores capability to Manager for autonomous execution
- **No vault holding**: Scheduler fees come directly from user's wallet transaction gas (user maintains FLOW balance)

**ForteHub** (global):
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

### Scheduling Flow - Three Scenarios

#### 1. **Automatic Scheduling at Deployment** (DEFAULT for schedulable workflows)
```
User describes strategy → LLM returns isSchedulable=true + defaultFrequency
        ↓
DEPLOY_WORKFLOW_TRANSACTION executes
        ↓
Step 3b: Auto-schedules if isSchedulable && defaultFrequency != nil
        ↓
ForteHub.scheduleWorkflow() called automatically
        ↓
Workflow begins autonomous execution on schedule
```
- No extra user steps needed
- Scheduling happens atomically with deployment
- 0.01 FLOW withdrawn directly from user's wallet

#### 2. **Clone with Automatic Scheduling** (For schedulable workflows)
```
User clones a schedulable workflow from registry
        ↓
CloneWorkflowWithScheduling.cdc executes
        ↓
Deploys contract + sets up vaults
        ↓
if isSchedulable && defaultFrequency:
    Calls ForteHub.scheduleWorkflow()
        ↓
Clone is deployed AND automatically scheduled in one transaction
```
- Clone inherits scheduling settings from parent
- No separate scheduling transaction needed

#### 3. **Manual Enable/Disable** (For toggling autonomous execution)
```
User navigates to dashboard
        ↓
Selects already-deployed workflow
        ↓
Clicks "Enable/Disable Scheduling" button
        ↓
EnableWorkflowScheduling transaction sends
        ↓
ForteHub.scheduleWorkflow() called
        ↓
User can now manually control when workflow runs autonomously
```
- For workflows that weren't auto-scheduled
- For pausing/resuming already-scheduled workflows
- Direct wallet fee deduction (0.01 FLOW)

### Handler Resource Pattern

ForteHub uses `WorkflowHandler` resource (implements FlowTransactionScheduler interface):
- Stores owner address for accessing manager at execution time
- Executes workflow logic
- Self-reschedules for next execution
- Supports pause/resume via task cancellation/re-registration

Complete handler implementation in ForteHub.cdc.

### Scheduling Events & Balance Monitoring

**SchedulingBalanceAlert Event** - Emitted during scheduling to warn of fund issues
```cadence
access(all) event SchedulingBalanceAlert(
    workflowId: UInt64,
    status: String,  // "failed" or "warning"
    currentBalance: UFix64,
    requiredAmount: UFix64,
    message: String
)
```

**When emitted:**
- **status: "failed"** - User doesn't have enough FLOW for 0.01 fee
  - Transaction panics and fails
  - Frontend can display error message to user

- **status: "warning"** - Scheduling succeeds but balance drops below 0.05 FLOW after fee
  - Transaction still succeeds
  - Frontend can show warning: "Low FLOW balance after scheduling"
  - Helps users avoid future scheduling failures

**Frontend monitoring:** Listen for SchedulingBalanceAlert events to:
- Alert users when scheduling fails (insufficient balance)
- Warn users when balance is running low
- Suggest depositing more FLOW if multiple scheduled workflows exist

### Fee Handling & Safety

**Fee Withdrawal Timeline:**
```
scheduleWorkflow():
  ↓
  1. Check balance (precondition) - if fails, panic BEFORE withdrawal
  ↓
  2. Withdraw 0.01 FLOW from user's vault
  ↓
  3. Transfer vault to FlowTransactionScheduler
  ↓
  4. Scheduler registers task and holds fees
```

**Fee Safety:**
- If transaction fails BEFORE withdrawal: No fees charged ✓
- If transaction fails AFTER withdrawal: Fees transferred to scheduler
  - Scheduler holds fees in task deposit
  - When task is cancelled (unschedule), scheduler refunds remaining amount
  - User's 0.01 FLOW is not lost - managed by scheduler

**Important:** Fees are held by FlowTransactionScheduler, not lost if scheduling is disabled. User can unschedule workflow with `DisableWorkflowScheduling` transaction and scheduler will clean up the task and fees.

### Workflow Pause/Resume Design Decision

**Removed workflow-level pause/resume** (isPaused field, pause()/resume() methods):
- Was redundant with scheduling control
- Added unnecessary check in run() method
- Would charge scheduler fees while workflow is paused (wasteful)
- Users can simply disable scheduling instead of pausing

**Simplified UX Model:**
- **Scheduling Control** = "Pause/Resume Autonomous Execution" on dashboard
  - Disable: `DisableWorkflowScheduling` → stops scheduler calling run()
  - Enable: `EnableWorkflowScheduling` → resumes autonomous execution
- No separate pause/resume concept in workflow contract
- Clean separation: scheduling on/off = all control needed

**If pause/resume needed in future:**
- Revert by adding `isPaused` field back to workflow resource
- Add `pause()` and `resume()` methods to IWorkflow interface
- Update LLM prompt to generate pause/resume methods
- Trade-off: Slightly more complex, but more flexible

### Scheduler Architecture: Wrapper Role

**Why ForteHub wrapper exists:**

1. **User workflow storage** - Stores deployed workflow resources
   - Needed for `run()` execution via ForteHub.run(workflowId)
   - Keeps workflows organized per user
   - Essential, not duplicative

2. **Event coordination** - Emits ForteHub-specific events
   - FlowTransactionScheduler emits generic task events
   - ForteHub emits workflow-specific events (WorkflowScheduled, WorkflowExecuted, etc.)
   - Indexer can correlate: "Workflow X scheduled as task Y"

3. **Manager initialization event** - Optional but convenient
   - Emitted when manager created
   - Allows indexer to discover ForteHub accounts without API calls
   - Alternative: Query Flowscan directly for "ForteHub" contract deployments

**What the wrapper should NOT do:**
- ❌ Duplicate scheduling state (isScheduled, frequency, taskId in WorkflowConfig)
- ❌ Store information already tracked by FlowTransactionScheduler

**Optimal architecture (current MVP → Phase 1.5 refactor):**
```
ForteHub:
  - Stores: workflows (resources), metadata
  - Emits: ManagerInitialized, WorkflowScheduled, WorkflowExecuted events
  - Does NOT store: isScheduled, frequency, taskId (redundant)

FlowTransactionScheduler:
  - Manages: actual task state, execution, fees
  - Source of truth for: "is this workflow scheduled?"

Frontend:
  - Queries scheduler via useFlowScheduledTransactionList() for runtime state
  - Displays: "Workflow X is scheduled" based on scheduler response

Indexer:
  - Discovers accounts: via ManagerInitialized events (convenient) OR Flowscan contract search
  - Correlates: ForteHub events + scheduler events + registry metadata
```

**Phase 1.5 Refactoring (candidate):**
Remove WorkflowConfig.isScheduled/frequency/taskId fields - use scheduler as single source of truth. Keep manager for workflow storage, event emission, and discovery event.

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

### Central ForteHub Model

**Architecture Overview**:
- **ForteHub.cdc** - Centrally deployed at 0xd695aea7bfa88279 (registry account)
- **ForteHub.cdc** - Also at 0xd695aea7bfa88279 (shared registry)
- **Users**: Import ForteHub from central address, create per-account Manager resources

**Benefits**:
- Single source of truth for ForteHub code
- 50-70% gas savings (no contract deployment per user)
- Centralized updates (fix bugs once, all users benefit)
- No code tampering (users can't modify central contract)
- Simpler security model (verify Manager exists, not contract hash)

### One-Shot Deployment Transaction

**File**: `frontend/src/lib/deploymentTransaction.ts`

**Transaction**: `DEPLOY_WORKFLOW_TRANSACTION`

**Steps**:
1. Initialize FlowTransactionScheduler Manager (if needed)
2. Initialize ForteHub Manager resource (from central contract)
3. Deploy workflow contract code to user's account
4. Set up required token vaults (FLOW always, USDC/fuUSDT/fuDAI if needed)
5. Register workflow in ForteHub via Manager

**Arguments**:
- `contractName`, `contractCode` - Workflow contract
- `name`, `category`, `description` - Metadata
- `ipfsCID` - IPFS content hash for source code
- `sourceCodeHash` - SHA-256 hash of source code for verification
- `isListed` - Discoverable in public registry
- `metadataJSON` - Strategy-specific config fields JSON
- `vaultSetupInfo` - Map of token names to storage paths
- `vaultTypes` - Map of token names to type identifiers
- `deployManagerCode` - Deploy ForteHub Manager if first time
- `managerCode` - ForteHub Manager contract code (first-time deployment only)
- `capabilities` - Composition metadata dict (empty {} for MVP)
- `creatorSchedulerFee` - Fee per scheduled execution

### Vault Setup

`extractVaultSetupInfo()` determines which vaults to set up:
- FLOW: Always included (testnet standard)
- USDC/fuUSDT/fuDAI: Only if tokens detected in strategy description
- Each token gets standard testnet storage path

### Frontend Deployment Flow

1. User describes strategy
2. LLM generates Cadence + metadata JSON
3. Frontend parses response
4. User reviews contract code in modal
5. User confirms deployment
6. Frontend calls `buildDeploymentArgs()` to construct transaction args
7. FCL executes deployment transaction (imports central ForteHub)
8. On success: Workflow deployed, Manager resource created, workflow registered in global registry

### Description Update Utility

**File**: `frontend/src/lib/updateDescriptionWithValues.ts`

**Purpose**: Automatically sync workflow descriptions with current parameter values. When creators change default parameters in the review modal, descriptions are updated to reflect the new values.

**Functions**:

1. **`updateDescriptionWithValues(description, parameterValues)`**:
   - Searches description for numeric patterns matching parameter names
   - Updates values dynamically as parameters change
   - Handles three types of parameters:
     - **Percentages**: `flowTargetPercent: "0.60"` → replaces "60% FLOW" patterns
     - **Time values**: `defaultFrequency: "7200"` → converts "7200 seconds" to "2 hours"
     - **Thresholds/Amounts**: `liquidityThreshold: "0.05"` → updates threshold values

2. **`extractParametersFromDescription(description)`**:
   - Extracts all numeric values that might be parameters
   - Returns array of: `{ label: string, value: string | number }`
   - Useful for understanding which parameters a description references

**Example Flow**:

```
User edits flowTargetPercent from 0.60 to 0.75 in review modal
        ↓
useEffect hook detects parameter change
        ↓
updateDescriptionWithValues() called with new value
        ↓
Description: "Rebalances portfolio targeting 60% FLOW daily"
Becomes: "Rebalances portfolio targeting 75% FLOW daily"
        ↓
Review display updates in real-time
        ↓
Deployed description reflects creator's final intent
```

**Integration in Create Page** (`frontend/src/app/create/page.tsx`):
- useEffect hook monitors `metadataOverrides.defaultParameters` for changes
- Automatically updates `reviewDescription` state
- Only updates if description actually changed (prevents loops)
- Syncs in review modal before deployment

**Pattern Matching**:
- Percentages: Matches `\d+\s*%?` (e.g., "60%", "0.60")
- Time: Matches `\d+\s+(seconds?|hours?|days?)` (e.g., "3600 seconds")
- Thresholds: Matches `\d+\.\d*` (e.g., "0.05")
- Smart conversion: 3600 seconds → 1 hour, 86400 seconds → 1 day

### Metadata Architecture: No Duplication

**Key Design Principle**: Metadata is stored **exactly once** in the registry. Managers do NOT duplicate metadata.

**ForteHub.Manager Storage** (per-account, created from central contract):
- ✅ Stores **workflow resources** (`@{UInt64: {IWorkflow}}`) - the actual contract instances
- ✅ Extracts **minimal local metadata** for quick access (name, category only, pulled from resource itself)
- ❌ Does NOT store complete metadata (description, IPFS CID, creator, fees, etc.)
- Code comment: "Metadata is managed by ForteHub, not stored here"

**ForteHub Storage** (global, at 0xd695aea7bfa88279):
- ✅ Stores **complete workflow metadata** (WorkflowInfo struct)
- ✅ Single source of truth for all workflow information globally
- ✅ Contains: workflowId, creator, name, category, description, sourceCodeIPFS, sourceCodeHash, contractName, isListed, capabilities, creatorSchedulerFee, cloneCount, forkCount, parentWorkflowId
- ✅ Shared across all user accounts - no per-account duplication

**Why This Design?**
1. **Single Source of Truth**: Registry is the authoritative reference for all workflow data
2. **Storage Efficiency**: No metadata duplication across 1000s of user accounts
3. **Consistency**: Updates to workflow metadata (listing status, clone counts) happen in one place
4. **Scalability**: Global registry doesn't scale linearly with number of users
5. **Security**: Metadata cannot be tampered with by individual users (registry is centrally managed)

**Query Pattern**:
```cadence
// In Manager: Quick local lookup
let name = managerRef.getWorkflowName(workflowId) // Returns from resource

// In Registry: Complete metadata lookup (used for discovery, cloning)
let workflowInfo = registryRef.getWorkflowInfo(workflowId) // Returns full WorkflowInfo
```

---

## Testnet Configuration

### Network Details


### Testnet Readiness Status

- [x] Workflow terminology finalized (Agent → Workflow)
- [x] ForteHub & ForteHub implemented with MetadataViews
- [x] LLM prompt updated with Cadence 1.0 rules and composition guidance
- [x] Deployment transaction supports capabilities metadata
- [x] Frontend testnet-only configuration
- [x] Workflow composition infrastructure staged (v2 ready)
- [x] Clone pricing system implemented (WorkflowInfo.price field)
- [x] Smart payment handling (only withdraw exact price needed)
- [x] Clone price UI on discovery pages (list view + detail view)
- [x] Clone price input on create page (main form + review modal)
- [x] Description update utility for parameter sync
- [x] Clone count and fork count in WorkflowInfo struct (removed separate dictionaries)
- [x] NFT metadata image field (WorkflowInfo.imageIPFS)
- [x] Image input on create page (main form + review modal)
- [x] Image thumbnails on discovery cards (h-32 with fallback)
- [x] Image display on detail page (h-64 with fallback)
- [x] Full FlowTransactionScheduler integration (handlers, autonomous execution, rescheduling)
- [ ] Testnet smoke tests (deploy, run, schedule, update config)
- [ ] User acceptance testing with real workflow strategies with clone pricing and custom images

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
- **Manager Handles Orchestration**: Scheduling, pause/resume, frequency changes all in ForteHub

### ForteHub Safety

- `createWorkflow()` destroys replaced workflows to prevent resource loss
- Manager stored at fixed path: `FORTEHUB_MANAGER_STORAGE` (deterministic access)
- One manager per wallet (per-wallet deployment pattern)
- Handler capability properly authorized with Execute entitlement

### Access Control

- **Strategy Setters**: `access(account)` so only deployer can change strategy params
- **Scheduler Operations**: Pause/resume can be `access(all)` but validated internally
- **Registry Restrictions**: Only creator can change workflow listing status
- **Clone Recording**: Verifies deployer actually owns the contract

### Registry Safety

- `recordClone()`: Takes `workflowId` and `cloner` address only (resource-based cloning)
- `cloneCount` excludes original deployment (starts at 0)
- Cannot re-list workflow with existing clones (prevents confusion)
- Fork tracking via `parentWorkflowId` enables lineage queries
- `updateWorkflowMetadata()`: Only creator can update, verified via signer address
- Metadata updates emit event for frontend notifications

### Fund Handling

- Vault withdrawals bounded and guarded with preconditions
- Always destroy or return local vaults after use
- Never leave resources dangling
- Connector calls use correct entitlements: `auth(FungibleToken.Withdraw) &{FungibleToken.Vault}`

### MetadataViews Compliance

- ForteHub implements Resolver with Display, ExternalURL views
- ForteHub implements Resolver for standardized access
- Supports future composability via capabilities metadata field

---

## Scheduler Fee Monetization Architecture (MVP Implementation)

### Current MVP Implementation (v1.0)

**Status**: ✅ FULLY IMPLEMENTED - Creators earn fees when users schedule their workflows

**How It Works:**
1. Creators set an immutable `creatorSchedulerFee` (in FLOW) when deploying a workflow
2. When users schedule a workflow for autonomous execution, fees are charged:
   - **0.01 FLOW**: Base fee to FlowTransactionScheduler (required by scheduler)
   - **creatorFee**: Set by creator at deployment, earned by workflow creator
   - **platformFee**: Set by registry owner, collected by platform
3. Total fee: `0.01 + creatorFee + platformFee`
4. User's FLOW vault is charged the total, fees distributed accordingly

**Implementation Details:**

| Component | File | Details |
|-----------|------|---------|
| **WorkflowInfo Struct** | ForteHubRegistry.cdc | Added `creatorSchedulerFee: UFix64` - immutable, set at registration |
| **Registry Storage** | ForteHubRegistry.cdc | `platformSchedulerFee` (UFix64) and `feeCollectorAddress` (Address) for global config |
| **Owner Functions** | ForteHubRegistry.cdc | `setPlatformSchedulerFee()` and `setFeeCollectorAddress()` - owner-only, can be updated anytime |
| **Registration** | ForteHubRegistry.cdc | `registerWorkflow()` now requires `creatorSchedulerFee` parameter (max 1.0 FLOW per execution) |
| **Fee Distribution** | ForteHub.cdc (scheduleWorkflow) | Queries registry for fees, withdraws total from user, splits and distributes to scheduler, creator, and platform |
| **Frontend Input** | create/page.tsx | Input field with default 0.001 FLOW, min/max validation, helpful text |
| **Deployment Tx** | deploymentTransaction.ts | `creatorSchedulerFee` parameter added to transaction, passed to registerWorkflow() |

**Key Constraints (Security):**
- Creator fee is **immutable once set** (cannot be changed after deployment)
  - Rationale: Prevents creators from changing fees on existing clones
  - Option to unlist workflow if unsatisfied with fee structure
- Platform fee is **mutable by owner only** (applies to all workflows)
  - Uses `access(account)` functions for security
  - Can be updated independently
- Both fees capped at **1.0 FLOW maximum**
- Fees validated at registration and distribution time

**User Flow:**
1. Creator deploys workflow → specifies `creatorSchedulerFee` (e.g., 0.001 FLOW)
2. Other users discover workflow in registry
3. User schedules workflow for autonomous execution
4. System calculates total: 0.01 + 0.001 + platformFee (e.g., 0.005) = 0.016 FLOW
5. User's FLOW balance checked (must have >= 0.016)
6. Fees withdrawn and distributed:
   - 0.01 FLOW → FlowTransactionScheduler
   - 0.001 FLOW → Original creator's wallet
   - 0.005 FLOW → Platform fee collector address

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

**Current Status**: ✅ IMPLEMENTED
- Handler resource (`WorkflowHandler`) fully implemented (see handler pattern above)
- Task registration/cancellation with FlowTransactionScheduler
- Pause/resume by task cancellation/re-registration
- Frequency updates via reschedule
- Balance monitoring and alerts
- Self-contained handler resources for per-workflow execution

**Completed features:**
- `enableScheduling(workflowId, frequency)` - Register workflow with scheduler
- `disableScheduling(workflowId)` - Cancel scheduled task
- `setExecutionFrequency(workflowId, newFrequency)` - Update task frequency
- Handler implements `FlowTransactionScheduler.TransactionHandler` interface
- Execute entitlement properly authorized for scheduler access
- Balance checks prevent insufficient funds for scheduling fee (0.01 FLOW)

### Phase 3: Clone UI Improvements (Deferred - Fork UI)

**Fork Workflow** (disabled for now):
- **Current Status**: Fork UI disabled in MVP for simplification
  - Fork button hidden from Discover cards
  - Fork modal disabled in discover/[id]/page.tsx
  - Fork initialization disabled in create/page.tsx
  - Fork code structure preserved for future implementation
  - ForkCount tracking kept in ForteHubRegistry for analytics

- **Future Implementation** (Phase 3):
  - Dedicated `/fork/[id]` route bypassing AI prompt
  - Preload parent metadata and defaults
  - Editable form controls for strategy parameters
  - Deterministic template rewriting instead of LLM regeneration
  - Contract code preview with metadata diff before deployment

### Phase 4: Advanced Features & Future Monetization

**Current Features**:
- Search & filtering in registry (category, creator, popularity)
- Workflow versioning (track all revisions)
- Workflow composition UI (visual workflow builder)
- Governance for high-risk operations (multi-sig, timelocks)

**Future Monetization Options** (Building on MVP scheduler fees):

1. **One-Time Clone Purchase Fee** (Phase 4+)
   - Option: Fixed per-clone fee (e.g., 0.5 FLOW per clone)
   - Option: Percentage of creator fee (e.g., 10% × creator's scheduler fee)
   - Storage: Add `clonePurchaseFee: UFix64?` to WorkflowInfo (optional)
   - Implementation: Charge at clone time in recordClone() transaction
   - Benefit: Reward creators for popular workflows

2. **Creator Fee Updates for New Clones Only** (Phase 4+)
   - Change strategy: Allow fee updates but apply only to newly deployed clones
   - Track fee per WorkflowInfo (immutable) vs. default for new registrations
   - Use case: Creators can advertise differently to new users
   - Complexity: Requires tracking which clones use which fee version

3. **Revenue Sharing Model** (Phase 4+)
   - Platform takes fixed percentage of creator fees (e.g., 20%)
   - Replaces fixed platformSchedulerFee with percentage-based
   - Pros: Scales with ecosystem growth
   - Cons: More complex distribution logic, rounding issues
   - Implementation: Split fees in scheduleWorkflow() after fee distribution

4. **Rate Limiting on Fee Changes** (Phase 4+)
   - Prevent rapid fee adjustments (e.g., max 1 change per 30 days)
   - Track `lastFeeChangeTimestamp` per workflow
   - Benefit: Stability for users, prevents abuse

5. **Fee History & Transparency Logging** (Phase 4+)
   - Emit events when fees are set/updated
   - Frontend indexes events to show fee evolution
   - Benefit: Trust and transparency

6. **Creator Earnings Withdrawal & Treasury System** (Phase 4+)
   - Dedicated vault per creator for accumulated earnings
   - Withdraw function with optional recipient address
   - Multi-sig approval for large withdrawals
   - Benefit: Creators control their earnings, platform compliance

7. **Tiered Fee Tiers Based on Creator Reputation** (Phase 5+)
   - Verified creators: Lower base fees, higher earner share
   - Unverified creators: Higher base fees, lower earner share
   - Integration with creator verification system
   - Benefit: Encourages creator verification, rewards community trust

### Open Considerations

- Persist migration guide if on-chain schema changes (existing WorkflowInfo requires manual redeploy)
- **Contract Code Verification**: Implemented in `verifyContractCode()` - SHA-256 hashing at both registration and cloning
  - Prevents malicious code modifications after registration
  - Real-time on-chain verification (cannot be bypassed off-chain)
  - TODO: Implement base58 CID decoding for direct on-chain IPFS CID comparison (currently off-chain)
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
- Scheduling issues: Check ForteHub handler implementation, scheduler capability
- Frontend errors: Check console logs and the Flow React SDK `TransactionDialog` status messages

---

## Key Files Map

### Cadence Contracts

- **cadence/contracts/ForteHubRegistry.cdc** - Global workflow registry
  - WorkflowInfo struct with capabilities field
  - registerWorkflow(), recordClone(), setWorkflowListing()
  - getWorkflowCapabilities() for v2 composition
  - MetadataViews.Resolver implementation

- **cadence/contracts/ForteHub.cdc** - Per-wallet orchestration
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
  - Calls LLM API with LLM prompt
  - Reviews generated contract code
  - Prepares deployment payload (LLM + IPFS) then hands signing to Flow React SDK (`TransactionButton` + `TransactionDialog`)
  - Fork initialization disabled (preserved for Phase 3)

- **src/app/discover/page.tsx** - Discover/discover workflows
  - Lists all public workflows from ForteHubRegistry
  - Filter by category
  - Clone button builds transaction config, executes via `TransactionButton`
  - Fork button disabled (will be Phase 3)

- **src/app/discover/[id]/page.tsx** - Workflow details
  - View individual workflow metadata
  - Clone + creator-only actions (unlist/burn) use the same Flow React SDK transaction UX
  - Fork modal disabled (preserved for Phase 3)

- **src/app/dashboard/page.tsx** - Creator management console
  - Lists user-owned workflows, configurable variables, and wallet vaults
  - Pause/resume, burn, unlist, and config updates are all executed through `TransactionButton` with sealing feedback surfaced by `TransactionDialog`

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
2. **Contract Renames**: AgentRegistry → ForteHubRegistry, AgentManager → ForteHub
3. **Testnet Migration**: Removed all emulator references from frontend
4. **MetadataViews**: Implemented Resolver pattern in both registry and manager
5. **Composition Infrastructure**: Added capabilities field to WorkflowInfo (empty for MVP, ready for v2)
6. **LLM Prompt**: Updated to explain workflows, composition guidance, Cadence 1.0 rules
7. **Deployment Transaction**: Added capabilities parameter, supports empty dict
8. **Branding**: Updated landing page to ForteHub + DeFi Workflows terminology

### Session 2 Changes (Fork UI Refactoring):
1. **Fork UI Disabled**: Removed fork button from Discover cards, hidden fork modal
2. **Fork Code Extracted**: Created dedicated `/fork/[id]` page for Phase 3 implementation
3. **Create Page Cleaned**: Removed fork-specific state variables, kept core workflow creation
4. **Discover Page Rename**: agents/ → discover/ for clarity (Workflow discovery, not management)
5. **Clone Button Updated**: Uses recordClone transaction with correct parameter names (workflowId, deployer, contractName)
6. **ForkCount Tracking**: Maintained in ForteHubRegistry for future genealogy and analytics
7. **Documentation Updated**: Fixed SDK/FCL terminology, added fork page reference, clarified blockchain interactions

### Session 4 Changes (Resource-Based Cloning & Metadata Updates):
1. **Resource-Based Cloning Architecture**:
   - Replaced contract deployment cloning with lightweight resource factory instantiation
   - Clones now use original workflow's factory function (no AddContract auth needed)
   - Config fields snapshot Registry defaults at clone time
   - Updated recordClone() signature: `recordClone(workflowId, cloner)` (removed deployer, contractName)

2. **Metadata Update Infrastructure**:
   - Created updateMetadataTransaction.ts for creator-initiated metadata updates
   - Added `updateWorkflowMetadata()` to ForteHubRegistry with creator verification
   - Implemented `WorkflowMetadataUpdated` event for off-chain notifications
   - Config field updates emit events to notify cloners of parent changes

3. **Event-Driven Frontend Updates**:
   - Added useFlowEvents hook to discover/page.tsx for metadata update notifications
   - Discover page displays "Updated" badge for workflows that have been updated
   - Added useFlowEvents to dashboard/page.tsx for parent workflow update notifications
   - Dashboard shows when cloned workflow's parent has updates available

4. **UI Components**:
   - Created UpdateMetadataModal component for creators to update workflow metadata
   - Form validation with min/max length constraints
   - Creator-only access control with appropriate error messaging
   - Explains snapshot isolation and event propagation behavior

5. **Test Transaction Updates**:
   - Updated TestWorkflowDeploy.cdc: Removed metadata parameter from addWorkflow()
   - Updated test-clone-workflow.cdc: Resource-based cloning, recordClone() simplified
   - Updated DeployFlowTransferScheduled.cdc: Removed metadata param, updated addWorkflow()
   - Updated DeployDCAAuto.cdc: Removed metadata dict, streamlined addWorkflow()
   - All test transactions reflect new architecture patterns

6. **Documentation**:
   - Updated "Clone Recording & Cloning Strategy" section with resource-based model
   - Added "Metadata Updates & Event-Driven Notifications" section
   - Updated Registry Safety checklist for new updateWorkflowMetadata() function
   - Documented instance configuration freezing behavior

### Session 5 Changes (Contract Code Verification & CIDv1 IPFS Upgrade):
1. **Contract Code Verification Architecture**:
   - Implemented SHA2_256 hashing for contract code verification (matches IPFS standard)
   - `verifyContractCode()` in ForteHubRegistry computes real-time hash of deployed code
   - Called at both registration and cloning to detect modifications
   - Prevents malicious code changes after registration and deployment

2. **Two-Point Verification**:
   - **At Registration**: Verify contract exists and code is hashable
   - **At Cloning**: Real-time verification prevents spreading modified code
   - No stored hashes - verification happens on-chain every time

3. **IPFS Upgrade to CIDv1 Format**:
   - Updated ipfs.service.ts to request CIDv1 (bafy...) instead of CIDv0 (Qm...)
   - Added `cidVersion: 1` to Pinata upload options
   - CIDv1 uses base32 encoding (more future-proof than base58)
   - Both versions encode same SHA-256 hash, CIDv1 is IPFS standard

4. **Frontend IPFS Integration**:
   - Extracts both `cid` (CIDv1) and `hash` (SHA-256 hex) from IPFS upload
   - Passes CIDv1 to deployment transaction for immutable reference
   - Uses SHA-256 hashing (matching on-chain `verifyContractCode()`)

5. **Documentation Updates**:
   - Updated CLAUDE.md verification architecture sections (all SHA3 → SHA2_256)
   - Clarified CIDv1 format documentation (base32 vs base58)
   - Added threat model and security guarantees
   - Documented TODO for base32 CID decoding (off-chain for now)

### Session 3 Changes (Deployment Transaction Fixes & Scheduler Testing):
1. **FlowTransferScheduled Workflow**: Created complete scheduler test workflow (0.01 FLOW transfer every 30min, configurable amount/recipient)
2. **Testnet Deployment**: Successfully deployed FlowTransferScheduled with ForteHub and scheduler integration
3. **Scheduler Infrastructure**: Verified FlowTransactionScheduler Manager initialization and capability publishing pattern
4. **Deployment Transaction Corrections** (frontend/src/lib/deploymentTransaction.ts):
   - Removed Owner-entitlement capability publishing to public paths (Cadence 1.0 limitation)
   - Fixed vault capability publishing: now properly publishes read-only capabilities to public paths
   - Added proper ForteHub initialization call (`initializeManager()`) after contract deployment
   - Fixed workflow instantiation: removed non-existent `getNextWorkflowId()`, use `addWorkflow()` return value instead
   - Simplified workflow creation parameters (only id, name, category required)
   - Removed DeFiActionsUtils dependency from generated transactions (unnecessary for basic workflows)
5. **Cadence 1.0 Constraints Documentation**:
   - Confirmed: Cannot publish capabilities with entitlements to public paths
   - Confirmed: `capabilities.get()` returns non-optional Capability in Cadence 1.0
   - Confirmed: Need to unpublish before republish when idempotent
   - All public path capabilities must be read-only (no auth modifiers)

### Session 7 Changes (Phase 7: Paid Cloning, Marketplace, & Scheduler Fee Architecture):

1. **Paid Cloning Implementation**:
   - Added `price: UFix64?` field to WorkflowInfo struct (nil/0.0 = free)
   - Implemented payment handling in `Manager.cloneResource()` with dynamic fee splitting
   - Payment split: 95% to creator, 5% to platform (configurable via platformFeePercent)
   - Added `WorkflowClonePurchased` event for payment tracking (price, fees, creator payment)
   - Direct deposit to creator and platform fee collector vaults (no intermediate holding)

2. **Updateable Platform Fee System**:
   - Added `platformFeePercent: UFix64` storage field (0.0-1.0, default 5%)
   - Created `setPlatformFeePercent()` function (owner-only with validation)
   - Created `getPlatformFeePercent()` function for public reads
   - Fees calculated dynamically at clone time: `platformFee = price × platformFeePercent`

3. **Duplicate Clone Prevention**:
   - Added precondition to `cloneResource()`: `!self.workflows.containsKey(sourceWorkflowId)`
   - Prevents users from cloning same workflow twice into their wallet
   - Must remove existing clone before re-cloning

4. **Workflow Unscheduling on Removal**:
   - Enhanced `removeWorkflow()` to accept optional `account: auth(Storage) &Account?` parameter
   - Automatically cancels scheduled tasks before workflow removal
   - Checks for and destroys WorkflowHandler resource at deterministic path
   - Prevents orphaned scheduled tasks

5. **Scheduler Fee Architecture Clarification**:
   - Removed `platformSchedulerFee` and `creatorSchedulerFee` from WorkflowInfo
   - Removed `getPlatformSchedulerFee()` and `setPlatformSchedulerFee()` functions
   - Kept only `schedulerTransactionFee` (0.01 FLOW) as reference for FlowTransactionScheduler base cost
   - **Fee payment flow**: User's wallet → Transaction gas → FlowTransactionScheduler
   - ForteHub NEVER extracts scheduler fees from user's vault

6. **Manager Vault Cleanup**:
   - Removed unused `flowTokenVault: @FlowToken.Vault` field from Manager
   - Removed `depositSchedulingFees()` method (user deposits directly via transaction)
   - Removed `withdrawSchedulingFees()` method (scheduler uses transaction gas)
   - Removed `getSchedulingFeeBalance()` method (no longer needed)
   - **User's only responsibility**: Maintain sufficient FLOW balance in wallet

7. **Fixed scheduleWorkflow() Function**:
   - Removed fee splitting logic (deleted code trying to extract creator/platform scheduler fees)
   - Simplified to check user's wallet FLOW balance against baseSchedulerFee (0.01 FLOW)
   - Retained balance alert events (status: "failed" and "warning")
   - Passes empty vault to FlowTransactionScheduler (scheduler handles its own fees via gas)

8. **Metadata Views for NFT Marketplace**:
   - Updated `IWorkflow` interface to inherit from `MetadataViews.Resolver`
   - Created `getWorkflowMetadataViews()` function providing 4 standard views:
     - **Display**: Workflow name, description, thumbnail (IPFS or fallback)
     - **Royalties**: 5% creator royalty with Flow token receiver
     - **Serial**: Unique workflow ID
     - **ExternalURL**: Link to workflow details page
   - Enables workflow resources on Flow NFT marketplaces for secondary resale

9. **Added imageIPFS Field**:
   - Added `imageIPFS: String?` to WorkflowInfo struct for marketplace preview images
   - Updated registration and deployment transaction signatures to accept imageIPFS parameter
   - Falls back to default ForteHub image if imageIPFS not provided

10. **Two-Tier Marketplace Architecture**:
    - **Primary Market**: Template cloning via ForteHub with paid clone mechanism
    - **Secondary Market**: `ForteHubMarket` enables peer-to-peer resales—listings escrow the `WorkflowToken`, buyers pay FLOW, and the token transfers into the buyer’s manager via `manager.depositWorkflow(token: <-token)`
    - Both tiers tracked in events (WorkflowClonePurchased, creator royalties)

11. **Balance Alert Events Retained**:
    - `SchedulingBalanceAlert` event with two states:
      - **"failed"**: Insufficient balance to schedule (panics transaction)
      - **"warning"**: Balance drops below 0.05 FLOW after scheduling
    - Emitted in `scheduleWorkflow()` for wallet monitoring

### Git Commits:
- Comprehensive variable initialization fixes in agentPrompt.ts
- Contract renames across Cadence and frontend
- Testnet-only configuration for FCL
- MetadataViews implementation and documentation
- Paid cloning and marketplace features (Phase 7)
- Scheduler fee architecture cleanup and vault removal (Phase 7)

### Session 6 Changes (Code Verification Optimization & Marketplace Features):
1. **Function Naming Clarity**:
   - Renamed `verifyContractCode()` → `getContractCodeHash()` for semantic accuracy
   - Function computes hash for storage, doesn't verify anything
   - Updated call sites: Manager.registerWorkflow() and VerifyContractHash.cdc transaction

2. **Hash Verification Consolidation**:
   - Removed redundant contract fetches (was fetching contract code 3x per clone)
   - `verifyContractCodeMatchesHash()` now returns DeployedContract object
   - Manager.cloneResource() reuses returned contract, eliminating 2x fetches
   - Gas efficiency improvement: 66% reduction in contract queries per clone

3. **Deployment Protection**:
   - Added precondition to DEPLOY_WORKFLOW_TRANSACTION preventing contract redeployment
   - Ensures contract name can only be deployed once per wallet
   - Blocks attacker from redeploying modified contract under same name

4. **RecordClone Type Safety**:
   - Changed precondition from `@AnyResource` to `@Manager` for strict type checking
   - Uses `self.FORTEHUB_MANAGER_STORAGE` constant instead of hardcoded path
   - Strengthens security by ensuring exact Manager type presence

5. **Marketplace Transfer Infrastructure**:
   - Implemented `depositWorkflow()` method in Manager resource
   - Enables workflow transfers between managers (for marketplace listings/purchases)
   - Ownership determined implicitly by storage location
   - Supports future marketplace features: list → purchase → transfer to buyer

6. **LLM Prompt Enhancement**:
   - Strengthened `createWorkflow()` documentation in agentPrompt.ts
   - Added `CRITICAL REQUIREMENT` section with clear visual markers
   - Documented that Manager.cloneResource() calls this during cloning
   - Clarified function signature constraints for LLM compliance

### Testing Status:
- [x] LLM code generation (Cadence 1.0 compliant)
- [x] Deployment transaction structure (Session 3: fixed and tested)
- [x] Registry metadata + capabilities field
- [x] ForteHubRegistry config struct with owner-only setters
- [x] FlowTransactionScheduler Manager initialization (tested in Session 3)
- [x] FlowTransferScheduled workflow deployment and registration
- [x] Scheduler capability publishing patterns verified
- [x] Resource-based cloning architecture (Session 4: implemented)
- [x] Code hash verification with optimization (Session 6: implemented)
- [x] Marketplace transfer infrastructure (Session 6: implemented)
- [x] Deployment protection preconditions (Session 6: implemented)
- [x] Metadata update transactions and events (Session 4: implemented)
- [x] Event-driven frontend notifications (Session 4: implemented)
- [x] UpdateMetadataModal component (Session 4: implemented)
- [x] Contract code verification with SHA2_256 hashing (Session 5: implemented)
- [x] IPFS CIDv1 (bafy...) format integration (Session 5: implemented)
- [x] Real-time code verification at registration (Session 5: implemented)
- [x] Real-time code verification at cloning (verifyContractCode() confirms hashability)
- [x] Full FlowTransactionScheduler Handler integration (autonomous execution) - Phase 2 complete
- [x] Workflow scheduling (enableScheduling, disableScheduling, setExecutionFrequency)
- [x] WorkflowHandler resource with TransactionHandler interface
- [x] Balance monitoring and scheduling alerts
- [ ] CID base32 decoding for direct on-chain hash comparison (future optimization)
- [ ] Testnet end-to-end workflow deployment via frontend
- [ ] Multi-workflow deployment scenarios
- [ ] Event subscription functional testing on testnet

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

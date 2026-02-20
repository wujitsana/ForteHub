Cadence Smart Contracts for ForteHub

This directory contains all Cadence smart contracts for the ForteHub DeFi workflow automation platform on Flow blockchain.

Architecture

Contracts (Source of Truth)

ForteHubRegistry.cdc (0xc2b9e41bc947f855 on testnet)
  Central registry tracking all deployed workflows across all users
  Records workflow metadata, creator info, IPFS references
  Tracks clone/fork counts per workflow
  Manages listing/unlisting (soft delete)
  Implements MetadataViews for discovery tools
  No execution logic; purely data storage and tracking

ForteHub.cdc (deployed once per user wallet)
  Per-wallet workflow manager deployed to each user's account
  Auto-initializes on first deployment
  Stores each cloned workflow inside a `WorkflowToken` wrapper so transfers behave like NFTs
  Implements pause/resume/run functionality
  Emits WorkflowExecuted events for execution tracking
  Optional FlowTransactionScheduler integration for autonomous execution
  Each manager is isolated - no cross-wallet interference

ForteHubMarket.cdc (secondary marketplace)
  Enables peer-to-peer resales of cloned workflows
  Sellers move a workflow out of their manager via `removeWorkflow`, create a listing, and escrow the resource inside a ListingCollection resource
  Buyers provide FLOW payment plus their manager reference; purchased workflows deposit via `manager.depositWorkflow`
  Mirrors Flow NFT marketplace primitives (sale collections, public capability for purchase)
  Supports configurable platform fee routed to ForteHub fee collector

DeFi Connectors (Reference implementations)
  IncrementFiSwapConnectors.cdc - Swap execution via IncrementFi DEX
  BandOracleConnectors.cdc - Price oracle via Band Protocol
  FungibleTokenConnectors.cdc - Token vault sources/sinks
  DeFiActions.cdc - Common DeFi operations

Transactions

DEPLOY_WORKFLOW_TRANSACTION.cdc
  The main deployment transaction used by the frontend + CLI helpers
  Handles the account-level setup in one atomic operation:
    0. Initialize FlowTransactionScheduler manager (idempotent helper)
    1. Initialize ForteHub manager resource (delegates to contract helper)
    2. Deploy workflow contract code to the creator's account (one-time)
    3. Create/publish required token vaults + capabilities
    4. Register workflow via Manager.registerWorkflow (computes hash on-chain)
    5. Optionally schedule the workflow via ForteHub.scheduleWorkflow
  Source: frontend/src/lib/deploymentTransaction.ts (string copy kept in sync)
  IMPORTANT: Workflow instantiation happens in the per-workflow factory transaction
             that calls `createWorkflow(..., manager: managerAcceptance, ticket: <-nil)`.

Data Flow

Workflow Creation (Frontend)
  1. User fills form with strategy parameters
  2. Frontend generates Cadence contract code
  3. Code uploaded to IPFS
  4. Frontend calls DEPLOY_WORKFLOW_TRANSACTION with:
     - contractName / contractCode
     - metadataJSON + configDefaults (default parameter snapshot)
     - vaultSetupInfo + vaultTypes (token storage + type IDs)
     - capabilities map (schedulable flags, input/output tokens, etc.)
     - isSchedulable + defaultFrequency (optional auto-scheduling hints)
     - price + imageIPFS (marketplace metadata)

Manager Initialization
  1. Transaction calls `ForteHub.initializeManager(account: signer)`
  2. Helper creates the Manager resource on first run and no-ops afterwards
  3. Capability paths remain consistent across every wallet

Vault Setup
  1. Transaction checks each vault in vaultSetupInfo
  2. Creates FLOW vault if missing
  3. Issues Withdraw capabilities for transaction use
  4. Logs warnings for custom vaults not found (user's responsibility)

Workflow Registration & Scheduling
  1. Transaction registers via `Manager.registerWorkflow(...)`
  2. Manager computes `sourceCodeHash` on-chain and forwards to registry
  3. Registry returns workflowId; metadata + IPFS hashes recorded on-chain
  4. If `isSchedulable` && `defaultFrequency != nil`, transaction immediately
     calls `ForteHub.scheduleWorkflow(...)` so the workflow starts on a cadence

Workflow Instantiation
  - After deployment, the creator (or frontend) runs a per-workflow factory
    transaction that imports the workflow contract and calls
    `createWorkflow(workflowId, config, manager: &{ForteHub.WorkflowAcceptance}, ticket: <-nil)`.
  - The factory creates the Workflow resource and immediately deposits it into
    the Manager via `manager.acceptWorkflow(...)`, so no resource ever returns to script scope.
  - Legacy `manager.addWorkflow` is retired; all clones and initial seeding use the same path.

Secondary Marketplace (ForteHubMarket.cdc)
  1. Seller borrows their Manager, calls `removeWorkflow(workflowId, account: signer)` to withdraw the `WorkflowToken` (unschedules handlers if needed). The token guarantees authenticity because only ForteHub can mint it.
  2. Seller stores a `ForteHubMarket.ListingCollection` resource in their account (one per wallet) and calls `createListing(workflow: <-token, price: price)` which escrows the token and emits `ListingCreated`.
  3. Buyers discover listings via the seller's public capability (`ListingCollectionPublic`) and call `purchase(listingId, payment: <-flowVault.withdraw(amount: price), buyerManager: &ForteHub.Manager, buyerAddress: signer.address)`.
     - The Listing splits payment into seller proceeds plus the configured platform fee (default 2%) routed to `ForteHubMarket.getFeeCollector()`.
     - The escrowed token deposits into the buyer's manager through `manager.depositWorkflow(token: <-token)`—no clone ticket is required for resales because the edition already exists.
  4. Sellers can `updateListingPrice` without touching the workflow, or `withdrawListing` to reclaim the resource and re-deposit it into their manager.
  5. Events (`ListingCreated`, `ListingPriceUpdated`, `ListingCancelled`, `ListingPurchased`) mirror Flow NFT storefront patterns so indexers can track secondary activity.

Clone Tickets & Paid Cloning
  - Non-creator cloners must call `ForteHub.purchaseCloneTicket(workflowId: UInt64, buyer: Address, payment: @FlowToken.Vault?)` before instantiating a workflow.
  - Tickets escrow the exact FLOW price (if any) and emit `CloneTicketIssued` for analytics.
  - Workflow contracts must expose `createWorkflow(workflowId, config, manager: &{ForteHub.WorkflowAcceptance}, ticket: @ForteHub.CloneTicket?)` and call `manager.acceptWorkflow(...)` so only ForteHub managers can store clones (ticket can be `nil` for creator self-clones).
  - `Manager.acceptWorkflow` wraps `cloneResource`, which validates the ticket, distributes creator/platform fees, refunds mismatches, and panics if free workflows include payment (non-creators must provide a ticket).
  - Original deployments (creator calling `addWorkflow`/`registerWorkflow`) skip tickets entirely; only clones need them.
  - Frontend transaction builder (`src/lib/cloneTransaction.ts`) withdraws the exact price, purchases the ticket, borrows the manager reference, and passes both into the factory.

Edition Locking
  - Creators can call `Manager.lockWorkflowClones(workflowId)` to permanently prevent new clones once they want editions fixed.
  - `ForteHub.lockClones()` marks the workflow as locked, emits `WorkflowCloningLocked`, and `Manager.cloneResource` will panic for all future clone attempts (including the creator).

Execution Tracking (Events)

WorkflowExecuted event emitted when workflow runs:
  - workflowId: UInt64
  - workflowName: String
  - ownerAddress: Address (for multi-user analytics)
  - timestamp: UFix64
  - executionType: String ("manual" or "scheduled")

No on-chain counters; indexer aggregates event data for metrics.
Saves storage costs and gas during execution.

Key Design Patterns

Per-Wallet Manager Pattern
  - Isolation: Each wallet's workflows are independent
  - Scalability: No central bottleneck
  - Simplicity: No governance/permissions complexity
  - Resource safety: Manager resource owned by wallet account

Self-Initializing Contracts
  ForteHub.init() automatically:
  - Creates Manager resource
  - Saves to /storage/forteHubManager
  - Issues public capability at /public/forteHubManager
  No separate initialization transaction needed

Execution Event Pattern
  WorkflowExecuted events emitted on success
  WorkflowExecutionFailed emitted on error
  No on-chain storage of execution history
  Indexer listens for events and aggregates metrics

Optional Scheduler Integration
  Workflows can optionally use FlowTransactionScheduler
  Manager holds reference to scheduler manager capability
  Handler resource implements TransactionHandler interface
  Automatic rescheduling on each execution

Cadence 1.0 Best Practices
  - Proper resource handling with @ and & syntax
  - Access control annotations (access(all), access(self), auth(...))
  - View functions for read-only queries
  - Struct composition for configuration
  - Clear type safety and entitlements

Contract Interaction Patterns

Reading Workflow Data

  import ForteHubRegistry from 0xc2b9e41bc947f855

  access(all) fun main(): [UInt64] {
    return ForteHubRegistry.listPublicWorkflows()
  }

Getting Workflow Metadata

  import ForteHubRegistry from 0xc2b9e41bc947f855

  access(all) fun main(id: UInt64): ForteHubRegistry.WorkflowInfo? {
    return ForteHubRegistry.getWorkflowInfo(workflowId: id)
  }

Getting Execution Stats (from Manager)

  import ForteHub from 0xUSER_ADDRESS

  access(all) fun main(): {String: AnyStruct} {
    let manager = getAccount(0xUSER_ADDRESS)
      .getCapability<&ForteHub.Manager>(/public/forteHubManager)
      .borrow() ?? panic("Manager not found")

    let config = manager.getWorkflowConfig(workflowId: 1)
    return config.getSchedulingInfo()
  }

Deployment Process Walkthrough

User Initiates Deployment (Frontend)
  1. User navigates to /create
  2. Fills form with strategy details
  3. Submits form with wallet connection

Code Generation (Frontend)
  1. Frontend generates Cadence contract template
  2. Inserts user parameters into template
  3. Uploads code to IPFS
  4. Gets IPFS CID for immutable reference

Transaction Building (Frontend)
  1. buildDeploymentArgs() constructs transaction arguments
  2. Includes ForteHub contract code
  3. Sets deployManagerCode = true (first time) or false (subsequent)
  4. Builds vaultSetupInfo dictionary with required tokens

Transaction Submission (Frontend)
  1. User confirms in wallet
  2. Sends DEPLOY_WORKFLOW_TRANSACTION
  3. Signer authorizes contract additions

Manager Deployment (Transaction)
  1. Prepare block checks for ForteHub
  2. If missing, adds contract code to signer's account
  3. Contract init() auto-executes:
     - Creates Manager resource
     - Saves to storage at known path
     - Issues public capability
  4. Manager now exists and ready

Vault Setup (Transaction)
  1. For each token in vaultSetupInfo:
     - Check if storage path has vault
     - Create FLOW vault if missing
     - Issue Withdraw capability
  2. Custom vaults must already exist (user creates them separately)

Workflow Deployment (Transaction)
  1. Deploy workflow contract to signer's account
  2. Contract includes generated Cadence code
  3. Contract name = sanitized user workflow name

Registration (Transaction Execute)
  1. Call ForteHubRegistry.registerWorkflow()
  2. Registry stores metadata on-chain
  3. Returns assigned workflowId

Success Feedback (Frontend)
  1. Frontend receives transaction ID
  2. Shows success modal with Flowscan link
  3. User can navigate to dashboard

Testing

Local Testing (Emulator)

Start emulator with high gas limits:
  flow emulator start --transaction-max-gas-limit=999999 --script-gas-limit=999999 --storage-limit=false

Deploy contracts:
  flow project deploy --network emulator

Run scripts:
  flow scripts execute cadence/scripts/example.cdc --network emulator

Run transactions:
  flow transactions send cadence/transactions/DEPLOY_WORKFLOW_TRANSACTION.cdc \
    --arg String "MyWorkflow" \
    --arg String "..." \
    --network emulator

Testnet Testing

ForteHubRegistry already deployed to testnet (0xc2b9e41bc947f855)

Deploy your own instance:
  1. Create testnet account
  2. Update flow.json with account
  3. fund account with FLOW tokens
  4. flow project deploy --network testnet

Future Improvements

Deferred Features

Advanced Connectors
  - Full DeFi MCP integration
  - Swap execution on multiple DEXs
  - Oracle data caching
  - Slippage protection

Workflow Versioning
  - Track contract bytecode changes
  - Allow users to roll back to previous versions
  - Fork from specific versions

Governance
  - Creator voting on shared workflows
  - Protocol parameter updates
  - Treasury management

Multi-Chain Support
  - Atomic cross-chain execution
  - Bridge integrations
  - Chain-specific optimization

Architecture Limitations & Trade-offs

Single Manager per Wallet
  Trade-off: Simplicity vs. sharing
  Reasoning: Isolation prevents interference, easier to manage
  Alternative: Shared hub with access control (more complex)

No Arbitrary Cadence
  Trade-off: Safety vs. flexibility
  Reasoning: Prevents malicious code injection
  Alternative: Contract verification + sandboxing (deferred)

Event-Based Metrics
  Trade-off: Storage vs. off-chain computation
  Reasoning: Cheaper gas, flexible analytics
  Alternative: On-chain counters (higher execution cost)

Scheduler Optional
  Trade-off: Flexibility vs. user confusion
  Reasoning: Users choose what they need
  Alternative: Always-scheduled (forces user complexity)

Security Considerations

Access Control
  - Only contract creator can list/unlist workflows
  - Manager resources owned by wallet (isolated per user)
  - Vault capabilities issued with auth(FungibleToken.Withdraw) entitlements

Resource Safety
  - Proper resource destruction (destroy statement)
  - No dangling resources
  - Capabilities checked before use

Code Validation
  - Source code hash stored in registry
  - IPFS CID immutably references code
  - Frontend verifies hash before deployment

Vault Management
  - Storage path validation
  - Capability authorization checks
  - Empty vault creation for missing tokens

Files Reference

contracts/
  ForteHubRegistry.cdc - Main registry (source of truth)
  ForteHub.cdc - Per-wallet manager (source of truth)
  [connector contracts] - DeFi integration references

transactions/
  DEPLOY_WORKFLOW_TRANSACTION.cdc - Active deployment transaction

scripts/
  [query scripts for reading data]

Frontend Copies

frontend/src/lib/forteHubManagerCode.ts
  Contains ForteHub contract code as string for deployment
  Must stay in sync with cadence/contracts/ForteHub.cdc

frontend/src/lib/deploymentTransaction.ts
  Contains DEPLOY_WORKFLOW_TRANSACTION as string constant
  Must stay in sync with cadence/transactions/DEPLOY_WORKFLOW_TRANSACTION.cdc

Workflow Clone Transactions

  - `transactions/fortehub/CloneWorkflow.cdc`
    - Minimal template for command-line cloning
    - Sets up required token vaults, purchases clone tickets, merges `configOverrides`, and calls the creator contract’s `createWorkflow(...)`
    - Replace the placeholder `YourWorkflowContract` import with the actual contract name/address before sending
  - `transactions/fortehub/CloneWorkflowWithScheduling.cdc`
    - Same flow as above plus optional auto-scheduling via `ForteHub.scheduleWorkflow`
    - Includes boolean + frequency arguments so wallets can opt-in to scheduling in the same transaction
  - Both templates now mirror the frontend generator (`frontend/src/lib/cloneTransaction.ts`), guaranteeing clone tickets, lock checks, and registry price validation behave consistently regardless of who builds the transaction.

Marketplace Transactions & Scripts

  - `transactions/fortehub/InitializeListingCollection.cdc`
    - Saves a `ForteHubMarket.ListingCollection` resource in the caller’s storage and publishes `/public/forteHubMarketListings`
  - `transactions/fortehub/ListWorkflowForSale.cdc`
    - Removes a `WorkflowToken` from the caller’s manager and escrows it in the listing collection at a specified price
  - `transactions/fortehub/WithdrawMarketplaceListing.cdc`
    - Cancels a listing and redeposits the token via `manager.depositWorkflow`
  - `transactions/fortehub/PurchaseMarketplaceListing.cdc`
    - Buyers withdraw FLOW, borrow the seller’s listing capability, and call `purchase` so the token lands in their manager without re-cloning
  - `transactions/fortehub/LockWorkflowClones.cdc`
    - Creator-only helper that flips the clone lock bit for a workflowId once supply should be capped
  - `scripts/GetMarketplaceListing.cdc`
    - Reads the public listing capability to inspect price/seller data for any active listing
  - These match Flow storefront practices: resource escrow lives with the seller, the listing exposes a public capability, payments split into seller proceeds + platform fee, and the asset transfers atomically when the buyer calls `purchase`.

Legacy Workflow Migration

  1. Use `scripts/GetWorkflow.cdc` (or the Discover detail page) to pull the existing registry entry so you have the original config defaults, metadata, and workflowId.
  2. Update the workflow contract so its `createWorkflow` function matches the new signature (`manager: &{ForteHub.WorkflowAcceptance}, ticket: @ForteHub.CloneTicket?`) and make sure it calls `manager.acceptWorkflow(...)`.
  3. Upload the refreshed contract source to IPFS and compute the hash with `scripts/GetContractCode.cdc` or `VerifyContractHash.cdc`.
  4. Run `transactions/fortehub/UpdateWorkflowIPFS.cdc` (and `UpdateWorkflowImageIPFS.cdc` if needed) to push the new code hash + metadata into the registry.
  5. For managers that already had the workflow stored, execute `transactions/fortehub/ReAddWorkflowToManager.cdc` (or the per-workflow helper transaction) so the wallet now owns an instance built from the new factory.
  6. Once every legacy workflow has been re-registered with the updated factory, future clones automatically route through `manager.acceptWorkflow`, clone tickets, and lock/unlist enforcement.

Marketplace Test Flow

 1. **Deploy creator workflows** – From the creator account (e.g., `fortehub-v3`) run `transactions/fortehub/DeployDCAAuto.cdc` and `transactions/fortehub/DeployFlowTransferScheduled.cdc`.
 2. **Clone as tester** – With a second wallet (e.g., `fortehub-test`), run `transactions/fortehub/CloneWorkflow.cdc` for each workflowId so the tester manager now holds one copy of DCA and TransferScheduled.
 3. **Initialize listing collections** – Run `transactions/fortehub/InitializeListingCollection.cdc` once per wallet to store a `ForteHubMarket.ListingCollection` at `/storage/forteHubMarketListings` and publish `/public/forteHubMarketListings`.
 4. **List a workflow** – Tester executes `transactions/fortehub/ListWorkflowForSale.cdc` with the workflow they want to sell and the asking price (UFix64). This removes the `WorkflowToken` from their manager (freeing their “one edition” slot) and emits `ListingCreated`.
 5. **Inspect listing** – Call `scripts/GetMarketplaceListing.cdc` to verify price/seller data. Because the manager no longer contains that workflowId, the tester can immediately re-run `CloneWorkflow.cdc` to mint a fresh copy while the escrowed listing remains available for sale.
 6. **Lock clones (creator)** – When the creator wants to cap supply, run `transactions/fortehub/LockWorkflowClones.cdc`. Future non-creators can no longer clone and must rely on marketplace transfers.
 7. **Purchase listing** – Creator (or any buyer with an empty slot) runs `transactions/fortehub/PurchaseMarketplaceListing.cdc`, passing the seller address, listingId, and expected price. The transaction withdraws FLOW, routes platform fees to `ForteHubMarket.getFeeCollector()`, and deposits the token into the buyer’s manager via `manager.depositWorkflow`.
 8. **Cancel / reclaim** – If a sale is no longer needed, seller calls `transactions/fortehub/WithdrawMarketplaceListing.cdc` to retrieve the token, which reinserts it into their manager.

Migration Notes

For future developers:
  - ForteHub.cdc and forteHubManagerCode.ts must be synchronized
  - Any Cadence changes to Manager need to be copied to frontend copy
  - DEPLOY_WORKFLOW_TRANSACTION is the source of truth for deployment logic
  - Registry contract (ForteHubRegistry.cdc) is deployed to testnet and live

Next Steps

1. Implement indexer to listen for WorkflowExecuted events
2. Build GraphQL API to expose aggregated metrics
3. Add advanced connector implementations (full DeFi MCP)
4. Create workflow template library
5. Build subscription system for autonomous execution

Resources

Flow Documentation: https://developers.flow.com
Cadence Documentation: https://cadence-lang.org
Flow CLI Reference: https://github.com/onflow/flow-cli

---

Questions? Check the main README.md or frontend README for architecture overview.

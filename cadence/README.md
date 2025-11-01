Cadence Smart Contracts for ForteHub

This directory contains all Cadence smart contracts for the ForteHub DeFi workflow automation platform on Flow blockchain.

Architecture

Contracts (Source of Truth)

ForteHubRegistry.cdc (0xbd4c3996265ed830 on testnet)
  Central registry tracking all deployed workflows across all users
  Records workflow metadata, creator info, IPFS references
  Tracks clone/fork counts per workflow
  Manages listing/unlisting (soft delete)
  Implements MetadataViews for discovery tools
  No execution logic; purely data storage and tracking

ForteHubManager.cdc (deployed once per user wallet)
  Per-wallet workflow manager deployed to each user's account
  Auto-initializes on first deployment
  Stores and executes all that user's workflows
  Implements pause/resume/run functionality
  Emits WorkflowExecuted events for execution tracking
  Optional FlowTransactionScheduler integration for autonomous execution
  Each manager is isolated - no cross-wallet interference

DeFi Connectors (Reference implementations)
  IncrementFiSwapConnectors.cdc - Swap execution via IncrementFi DEX
  BandOracleConnectors.cdc - Price oracle via Band Protocol
  FungibleTokenConnectors.cdc - Token vault sources/sinks
  DeFiActions.cdc - Common DeFi operations

Transactions

DEPLOY_WORKFLOW_TRANSACTION.cdc
  The main one-atomic deployment transaction used by the frontend
  Handles complete workflow deployment in a single atomic operation:
    1. Deploy ForteHubManager contract (first time only per wallet)
    2. Initialize required vaults (FLOW, USDC, custom tokens)
    3. Deploy workflow contract to user's account
    4. Register workflow in ForteHubRegistry
  Source: frontend/src/lib/deploymentTransaction.ts
  Called by: create/page.tsx during workflow deployment

Data Flow

Workflow Creation (Frontend)
  1. User fills form with strategy parameters
  2. Frontend generates Cadence contract code
  3. Code uploaded to IPFS
  4. Frontend calls DEPLOY_WORKFLOW_TRANSACTION with:
     - contractName: User's workflow name (sanitized)
     - contractCode: Generated Cadence code as string
     - metadataJSON: Parameters, config fields, defaults
     - vaultSetupInfo: Token addresses and storage paths
     - deployManagerCode: Boolean (true if user's first workflow)
     - managerCode: ForteHubManager contract as string (embedded from frontend)

Manager Deployment
  1. Transaction checks if ForteHubManager exists in signer's account
  2. If missing, deploys contract (auto-initializes via contract init())
  3. Manager.init() creates Manager resource and publishes capability
  4. Manager creates empty dictionary for workflows

Vault Setup
  1. Transaction checks each vault in vaultSetupInfo
  2. Creates FLOW vault if missing
  3. Issues Withdraw capabilities for transaction use
  4. Logs warnings for custom vaults not found (user's responsibility)

Workflow Registration
  1. Execute block registers workflow in ForteHubRegistry
  2. Registry returns assigned workflowId
  3. Metadata stored on-chain; source code referenced by IPFS CID
  4. Creator address recorded for access control

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
  ForteHubManager.init() automatically:
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

  import ForteHubRegistry from 0xbd4c3996265ed830

  access(all) fun main(): [UInt64] {
    return ForteHubRegistry.listPublicWorkflows()
  }

Getting Workflow Metadata

  import ForteHubRegistry from 0xbd4c3996265ed830

  access(all) fun main(id: UInt64): ForteHubRegistry.WorkflowInfo? {
    return ForteHubRegistry.getWorkflowInfo(workflowId: id)
  }

Getting Execution Stats (from Manager)

  import ForteHubManager from 0xUSER_ADDRESS

  access(all) fun main(): {String: AnyStruct} {
    let manager = getAccount(0xUSER_ADDRESS)
      .getCapability<&ForteHubManager.Manager>(/public/forteHubManager)
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
  2. Includes ForteHubManager contract code
  3. Sets deployManagerCode = true (first time) or false (subsequent)
  4. Builds vaultSetupInfo dictionary with required tokens

Transaction Submission (Frontend)
  1. User confirms in wallet
  2. Sends DEPLOY_WORKFLOW_TRANSACTION
  3. Signer authorizes contract additions

Manager Deployment (Transaction)
  1. Prepare block checks for ForteHubManager
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

ForteHubRegistry already deployed to testnet (0xbd4c3996265ed830)

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
  ForteHubManager.cdc - Per-wallet manager (source of truth)
  [connector contracts] - DeFi integration references

transactions/
  DEPLOY_WORKFLOW_TRANSACTION.cdc - Active deployment transaction

scripts/
  [query scripts for reading data]

Frontend Copies

frontend/src/lib/forteHubManagerCode.ts
  Contains ForteHubManager contract code as string for deployment
  Must stay in sync with cadence/contracts/ForteHubManager.cdc

frontend/src/lib/deploymentTransaction.ts
  Contains DEPLOY_WORKFLOW_TRANSACTION as string constant
  Must stay in sync with cadence/transactions/DEPLOY_WORKFLOW_TRANSACTION.cdc

Migration Notes

For future developers:
  - ForteHubManager.cdc and forteHubManagerCode.ts must be synchronized
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

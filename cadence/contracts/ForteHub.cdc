/**
 * ForteHub.cdc
 *
 * Unified ForteHub contract - merged architecture combining Manager and Registry
 * Deployed ONCE
 *
 * This contract combines workflow management (Manager) and global registry (Registry)
 * into a single deployment for simplified architecture and better cohesion.
 *
 * Each user creates their own Manager resource via createManager() or initializeManager().
 * The Manager resource owns and controls all Workflow resources for that user.
 * Each workflow strategy (rebalancer, arbitrage, etc.) is deployed as a separate
 * contract to the user's account, but all workflow instances are stored in their Manager.
 *
 * Architecture:
 * - One ForteHub (central, never changes)
 * - Multiple Manager resources (one per user account)
 * - Multiple workflow strategy contracts (deployed separately per user)
 * - Each workflow strategy contract exports a Workflow resource
 * - Manager stores all workflows in a dictionary
 * - Global registry tracks all workflow metadata on-chain
 * - Provides run methods for all workflows
 * - Supports FlowTransactionScheduler for autonomous workflows (optional)
 *
 * SCHEDULING:
 * - Workflows can be scheduled for autonomous execution via enableScheduling transaction
 * - ForteHub.scheduleWorkflow() function manages FlowTransactionScheduler integration
 * - ForteHubTransactionHandler resources execute workflows when scheduler calls them
 * - Handler uses capability to borrow Manager and execute workflows
 * - Manual workflows can be called directly by user/external systems via run()
 *
 * REGISTRY:
 * - Global workflow registry with metadata storage
 * - IPFS references for source code (content-addressed)
 * - Clone and fork tracking for analytics
 * - Public listing controls (creator can list/unlist)
 * - MetadataViews for standardized metadata access
 */

import FlowToken from 0x7e60df042a9c0868
import FungibleToken from 0x9a0766d93b6608b7
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import MetadataViews from 0x631e88ae7f1d7c20
import ViewResolver from 0x631e88ae7f1d7c20

access(all) contract ForteHub {

    // ==================== Events ====================

    // Manager Events
    access(all) event WorkflowAdded(
        workflowId: UInt64,
        workflowName: String,
        contractName: String,
        category: String
    )

    access(all) event WorkflowRemoved(
        workflowId: UInt64,
        workflowName: String
    )

    access(all) event WorkflowBurned(
        workflowId: UInt64,
        workflowName: String,
        timestamp: UFix64
    )

    /// Enhanced event for execution tracking - indexer aggregates statistics
    /// No on-chain storage overhead; indexer handles analytics
    access(all) event WorkflowExecuted(
        workflowId: UInt64,
        workflowName: String,
        ownerAddress: Address,
        timestamp: UFix64,
        executionType: String  // "manual" or "scheduled"
    )

    access(all) event WorkflowScheduled(
        workflowId: UInt64,
        frequency: UFix64,
        taskId: UInt64
    )

    access(all) event WorkflowUnscheduled(
        workflowId: UInt64,
        taskId: UInt64
    )

    /// Emitted when a workflow is cloned to another manager
    /// Caught by Registry to update clone counts
    access(all) event WorkflowCloned(
        sourceWorkflowId: UInt64,
        cloner: Address,
        sourceManagerAddress: Address
    )

    /// Emitted when workflow scheduling encounters a balance issue
    /// status: "failed" (insufficient funds), "warning" (low balance after scheduling)
    access(all) event SchedulingBalanceAlert(
        workflowId: UInt64,
        status: String,
        currentBalance: UFix64,
        requiredAmount: UFix64,
        message: String
    )

    // Registry Events
    access(all) event WorkflowRegistered(
        workflowId: UInt64,
        creator: Address,
        name: String,
        category: String,
        ipfsCID: String,
        isListed: Bool,
        contractName: String,
        metadataJSON: String,
        parentWorkflowId: UInt64?
    )

    access(all) event WorkflowCloneRecorded(
        workflowId: UInt64,
        deployer: Address,
        contractName: String,
        totalClones: UInt64
    )

    /// Emitted when a paid clone is purchased
    /// Tracks payment information for analytics and revenue tracking
    access(all) event WorkflowClonePurchased(
        sourceWorkflowId: UInt64,
        buyer: Address,
        creator: Address,
        priceFlowTokens: UFix64,
        platformFeeFlowTokens: UFix64,
        creatorPaymentFlowTokens: UFix64
    )

    /// Emitted when a clone ticket is issued for a workflow
    access(all) event CloneTicketIssued(
        workflowId: UInt64,
        buyer: Address,
        creator: Address,
        priceFlowTokens: UFix64,
        timestamp: UFix64
    )

    access(all) event WorkflowForkRecorded(
        parentWorkflowId: UInt64,
        newWorkflowId: UInt64,
        deployer: Address,
        totalForks: UInt64
    )

    access(all) event WorkflowListingChanged(
        workflowId: UInt64,
        creator: Address,
        isListed: Bool
    )

    access(all) event WorkflowMetadataUpdated(
        workflowId: UInt64,
        timestamp: UFix64
    )

    access(all) event WorkflowConfigDefaultsUpdated(
        workflowId: UInt64,
        creator: Address,
        timestamp: UFix64
    )

    access(all) event WorkflowPriceUpdated(
        workflowId: UInt64,
        creator: Address,
        newPrice: UFix64?,
        timestamp: UFix64
    )

    access(all) event WorkflowImageIPFSUpdated(
        workflowId: UInt64,
        creator: Address,
        newImageIPFS: String?,
        timestamp: UFix64
    )

    access(all) event WorkflowImageIPFSLocked(
        workflowId: UInt64,
        creator: Address,
        timestamp: UFix64
    )

    /// Emitted when a workflow creator locks further cloning
    access(all) event WorkflowCloningLocked(
        workflowId: UInt64,
        creator: Address,
        timestamp: UFix64
    )

    // ==================== Storage Paths & Constants ====================

    // Fixed paths so they can be reliably referenced in scheduled scripts
    // Fixed paths for ForteHub Manager (used in FlowTransactionScheduler scripts)
    access(all) let FORTEHUB_MANAGER_STORAGE: StoragePath
    access(all) let FORTEHUB_MANAGER_PUBLIC: PublicPath

    // ==================== Structs ====================

    /// Workflow metadata and IPFS reference
    access(all) struct WorkflowInfo {
        access(all) let workflowId: UInt64
        access(all) let creator: Address  // Also the contract deployment address
        access(all) let name: String
        access(all) let category: String
        access(all) let description: String
        access(all) let sourceCodeIPFS: String  // IPFS CIDv1 (bafy...) - immutable content-addressed reference
        access(all) let sourceCodeHash: String  // SHA-256 hex hash of contract code - for on-chain verification
        access(all) let isListed: Bool
        access(all) let createdAt: UFix64
        access(all) let lastUpdatedAt: UFix64
        access(all) let contractName: String
        access(all) let metadataJSON: String
        access(all) let configDefaults: {String: AnyStruct}
        access(all) let parentWorkflowId: UInt64?
        access(all) let capabilities: {String: AnyStruct}
        access(all) let price: UFix64?  // Clone price in FLOW tokens (nil or 0.0 = free)
        access(all) let imageIPFS: String?  // IPFS CID for workflow preview image
        access(all) var cloneCount: UInt64  // Number of times this workflow has been cloned
        access(all) var forkCount: UInt64   // Number of direct forks (children with parentWorkflowId)
        access(all) var clonesLocked: Bool  // When true, no further clones are allowed

        init(
            workflowId: UInt64,
            creator: Address,
            name: String,
            category: String,
            description: String,
            sourceCodeIPFS: String,
            sourceCodeHash: String,
            isListed: Bool,
            contractName: String,
            metadataJSON: String,
            configDefaults: {String: AnyStruct},
            parentWorkflowId: UInt64?,
            capabilities: {String: AnyStruct},
            price: UFix64?,
            imageIPFS: String?
        ) {
            self.workflowId = workflowId
            self.creator = creator
            self.name = name
            self.category = category
            self.description = description
            self.sourceCodeIPFS = sourceCodeIPFS
            self.sourceCodeHash = sourceCodeHash
            self.isListed = isListed
            self.createdAt = getCurrentBlock().timestamp
            self.lastUpdatedAt = getCurrentBlock().timestamp
            self.contractName = contractName
            self.metadataJSON = metadataJSON
            self.configDefaults = configDefaults
            self.parentWorkflowId = parentWorkflowId
            self.capabilities = capabilities
            self.price = price
            self.imageIPFS = imageIPFS
            self.cloneCount = 0
            self.forkCount = 0
            self.clonesLocked = false
        }

        access(contract) fun setCloneCount(_ count: UInt64) {
            self.cloneCount = count
        }

        access(contract) fun setForkCount(_ count: UInt64) {
            self.forkCount = count
        }

        access(contract) fun setClonesLocked(_ locked: Bool) {
            self.clonesLocked = locked
        }
    }

    // ==================== Registry Storage ====================

    access(self) var workflows: {UInt64: WorkflowInfo}
    access(self) var unlistedWorkflows: {UInt64: Bool}
    access(self) var nextWorkflowId: UInt64
    access(self) var lockedImageIPFS: {UInt64: Bool}  // Track workflows with permanently locked images

    // Fee Management
    access(self) var platformFeePercent: UFix64    // Platform fee percentage for paid clones (0.0-1.0)
    access(self) var schedulerTransactionFee: UFix64  // Base fee for FlowTransactionScheduler operations
    access(self) var feeCollectorAddress: Address  // Where platform fees are sent
    access(self) var registryOwner: Address        // Owner who can update fees

    // ==================== Interfaces ====================

    /// Public interface for workflows - each workflow resource must conform
    /// Workflows implement MetadataViews.Resolver for NFT marketplace compatibility
    access(all) resource interface IWorkflow {
        access(all) let id: UInt64
        access(all) let name: String
        access(all) let category: String

        access(all) fun run()
    }

    /// Wrapped workflow token used for transfers (authenticity guaranteed by this type)
    access(all) resource WorkflowToken: ViewResolver.Resolver {
        access(all) let workflowId: UInt64
        access(all) let creator: Address
        access(self) var workflow: @{IWorkflow}

        init(workflowId: UInt64, creator: Address, workflow: @{IWorkflow}) {
            self.workflowId = workflowId
            self.creator = creator
            self.workflow <- workflow
        }

        access(all) fun borrowWorkflow(): &{IWorkflow} {
            return (&self.workflow as &{IWorkflow})!
        }

        access(all) view fun getViews(): [Type] {
            return [
                Type<MetadataViews.Display>(),
                Type<MetadataViews.Royalties>(),
                Type<MetadataViews.Serial>(),
                Type<MetadataViews.ExternalURL>()
            ]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            let info = ForteHub.getWorkflowInfo(workflowId: self.workflowId)
                ?? panic("Workflow metadata not found")

            switch view {
                case Type<MetadataViews.Display>():
                    let thumbnail: {MetadataViews.File} = info.imageIPFS != nil
                        ? MetadataViews.IPFSFile(cid: info.imageIPFS!, path: nil)
                        : MetadataViews.IPFSFile(cid: "bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq", path: nil)
                    return MetadataViews.Display(
                        name: info.name,
                        description: info.description,
                        thumbnail: thumbnail
                    )

                case Type<MetadataViews.Royalties>():
                    let receiver = getAccount(info.creator).capabilities
                        .get<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                    if receiver == nil {
                        return nil
                    }
                    let royalty = MetadataViews.Royalty(
                        receiver: receiver!,
                        cut: 0.05,
                        description: "Creator royalty for ForteHub workflow"
                    )
                    return MetadataViews.Royalties([royalty])

                case Type<MetadataViews.Serial>():
                    return MetadataViews.Serial(self.workflowId)

                case Type<MetadataViews.ExternalURL>():
                    return MetadataViews.ExternalURL(
                        "https://fortehub.flow.com/workflow/".concat(self.workflowId.toString())
                    )

                default:
                    return nil
            }
        }

    }

    /// Helper to destroy wrapped workflow tokens (handles inner resource cleanup)
    access(contract) fun destroyWorkflowToken(token: @WorkflowToken) {
        destroy token
    }

    /// Get the type of a workflow (implemented in concrete workflow contracts)
    access(all) fun getWorkflowType(workflow: &{IWorkflow}): String {
        return workflow.name
    }

    // wrapper added elsewhere

    /// Restricted interface that lets workflow contracts deposit newly cloned resources directly
    /// into the caller's manager. Exposed so `createWorkflow` can require a manager reference.
    access(all) resource interface WorkflowAcceptance {
        access(all) fun acceptWorkflow(
            workflowId: UInt64,
            workflow: @{IWorkflow},
            ticket: @CloneTicket?
        ): UInt64

        access(all) fun depositWorkflow(token: @WorkflowToken)
    }

    // ==================== Clone Ticket Resource ====================

    /// CloneTicket resources prove that the cloner paid (or intentionally acquired) the right to clone
    /// a workflow. Tickets are issued by ForteHub and must be supplied when calling Manager.cloneResource.
    access(all) resource CloneTicket {
        access(all) let workflowId: UInt64
        access(all) let buyer: Address
        access(all) let creator: Address
        access(all) let price: UFix64
        access(all) let timestamp: UFix64
        access(contract) var paymentVault: @FlowToken.Vault?

        init(
            workflowId: UInt64,
            buyer: Address,
            creator: Address,
            price: UFix64,
            timestamp: UFix64,
            paymentVault: @FlowToken.Vault?
        ) {
            self.workflowId = workflowId
            self.buyer = buyer
            self.creator = creator
            self.price = price
            self.timestamp = timestamp
            self.paymentVault <- paymentVault
        }

        /// Move out the payment vault (if any). Only the contract can call this.
        access(contract) fun takePaymentVault(): @FlowToken.Vault? {
            let vault <- self.paymentVault <- nil
            return <-vault
        }

    }

    /// Helper to destroy clone tickets safely (cleans up any escrowed payment)
    access(contract) fun destroyCloneTicket(ticket: @CloneTicket) {
        if let payment <- ticket.takePaymentVault() {
            destroy payment
        }
        destroy ticket
    }

    // ==================== ForteHubTransactionHandler Resource ====================

    /// ForteHubTransactionHandler implements FlowTransactionScheduler.TransactionHandler
    /// for autonomous workflow execution with self-rescheduling
    /// Stored at a known path so it can be borrowed by the scheduler
    access(all) resource ForteHubTransactionHandler: FlowTransactionScheduler.TransactionHandler {

        // Store manager capability for accessing manager at execution time
        access(self) let managerCap: Capability<&Manager>
        access(self) let ownerAddress: Address

        init(
            managerCap: Capability<&Manager>,
            ownerAddress: Address
        ) {
            self.managerCap = managerCap
            self.ownerAddress = ownerAddress
        }

        // Required ViewResolver methods (for FlowTransactionScheduler.TransactionHandler interface)
        access(all) view fun getViews(): [Type] {
            return [
                Type<MetadataViews.Display>()
            ]
        }

        //do we need this?
        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<MetadataViews.Display>():
                    return MetadataViews.Display(
                        name: "ForteHub Workflow Handler",
                        description: "Transaction handler for autonomous workflow execution via FlowTransactionScheduler",
                        thumbnail: MetadataViews.HTTPFile(url: "https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq")
                    )
                default:
                    return nil
            }
        }

        /// Execute scheduled workflow and reschedule for next interval
        access(FlowTransactionScheduler.Execute) fun executeTransaction(id: UInt64, data: AnyStruct?) {
            // Extract workflow ID and frequency from transaction data
            let dictData = (data as? {String: AnyStruct}) ?? panic("Invalid transaction data")
            let workflowId = (dictData["workflowId"] as? UInt64) ?? panic("Missing workflowId in transaction data")
            let frequency = (dictData["frequency"] as? UFix64) ?? panic("Missing frequency in transaction data")

            // Borrow the manager using stored capability
            let managerRef = self.managerCap.borrow()
                ?? panic("Cannot borrow manager capability")

            // Execute the workflow
            managerRef.run(workflowId: workflowId, isScheduledExecution: true)
        }
    }

    // ==================== Manager Resource ====================

    access(all) resource Manager: WorkflowAcceptance {
        /// Owner account address - stored because resources don't have self.account
        access(self) let ownerAddress: Address

        /// Dictionary mapping workflow ID -> Workflow token (wraps workflow resource)
        access(self) var workflows: @{UInt64: WorkflowToken}

        access(self) var nextWorkflowId: UInt64

        init(ownerAddress: Address) {
            self.ownerAddress = ownerAddress
            self.workflows <- {}
            self.nextWorkflowId = 1
        }

        /// Register a newly created workflow in ForteHub registry
        /// Ensures the workflow is properly tracked and discoverable
        /// Uses registry's verifyContractCode to compute hash on-chain
        /// Only the manager owner can call this through their account authorization
        access(all) fun registerWorkflow(
            name: String,
            category: String,
            description: String,
            sourceCodeIPFS: String,
            isListed: Bool,
            contractName: String,
            metadataJSON: String,
            parentWorkflowId: UInt64?,
            capabilities: {String: AnyStruct},
            price: UFix64?,
            imageIPFS: String?,
            configDefaults: {String: AnyStruct}
        ): UInt64 {
            // Compute the contract code hash on-chain for registry storage
            // During cloning, verifyContractCodeMatchesHash() verifies this hash matches
            let sourceCodeHash = ForteHub.getContractCodeHash(
                creatorAddress: self.ownerAddress,
                contractName: contractName
            )

            // Call ForteHub registry to register the workflow
            let workflowId = ForteHub.registerWorkflow(
                name: name,
                category: category,
                description: description,
                sourceCodeIPFS: sourceCodeIPFS,
                sourceCodeHash: sourceCodeHash,
                isListed: isListed,
                creator: self.ownerAddress,
                contractName: contractName,
                metadataJSON: metadataJSON,
                parentWorkflowId: parentWorkflowId,
                capabilities: capabilities,
                price: price,
                imageIPFS: imageIPFS,
                configDefaults: configDefaults
            )

            return workflowId
        }

        // ===== Cloning Workflows from Other Managers =====

        /// Clone a workflow by creating a new instance from the source contract
        /// Verifies the source workflow's contract code matches what's in the registry
        /// Creates our own independent resource instance - nobody else has access
        /// Calls ForteHub.recordClone() to update clone count
        /// Prevents duplicate clones - user can only have one instance of each workflow
        /// Requires a ForteHub-issued CloneTicket which contains (or proves absence of) payment
        /// Workflow creators can bypass tickets when cloning their own workflows (treated as free)
        access(all) fun cloneResource(
            sourceWorkflowId: UInt64,
            workflow: @{IWorkflow},
            ticket: @CloneTicket?
        ): UInt64 {
            pre {
                !self.workflows.containsKey(sourceWorkflowId) :
                    "You already have this workflow cloned. Remove it first if you want to re-clone."
            }

            // STEP 1: Verify workflow exists in registry
            let workflowInfo = ForteHub.getWorkflowInfo(workflowId: sourceWorkflowId)
                ?? panic("Workflow not found in registry")

            if workflowInfo.clonesLocked {
                panic("Cloning disabled: Workflow has reached its edition limit")
            }

            if !workflowInfo.isListed && workflowInfo.creator != self.ownerAddress {
                panic("Workflow is unlisted and cannot be cloned by other users")
            }

            // STEP 2: Verify contract code hash matches registered version (single fetch, returns contract object)
            let _ = ForteHub.verifyContractCodeMatchesHash(
                creatorAddress: workflowInfo.creator,
                contractName: workflowInfo.contractName,
                expectedHash: workflowInfo.sourceCodeHash
            )

            let isCreatorClone = self.ownerAddress == workflowInfo.creator

            // STEP 2.5: Validate clone ticket (or allow creator self-clone without ticket)
            var cloneTicket: @CloneTicket? <- ticket
            if cloneTicket == nil {
                if !isCreatorClone {
                    panic("Clone ticket required for non-creators")
                }
            } else {
                if (cloneTicket?.workflowId)! != sourceWorkflowId {
                    let ticket <- cloneTicket <- nil
                    if ticket != nil {
                        ForteHub.destroyCloneTicket(ticket: <-ticket!)
                    }
                    panic("Clone ticket workflow mismatch")
                }
                if (cloneTicket?.buyer)! != self.ownerAddress {
                    let ticket <- cloneTicket <- nil
                    if ticket != nil {
                        ForteHub.destroyCloneTicket(ticket: <-ticket!)
                    }
                    panic("Clone ticket owner mismatch")
                }
                if (cloneTicket?.creator)! != workflowInfo.creator {
                    let ticket <- cloneTicket <- nil
                    if ticket != nil {
                        ForteHub.destroyCloneTicket(ticket: <-ticket!)
                    }
                    panic("Clone ticket creator mismatch")
                }
            }

            let workflowPrice = workflowInfo.price ?? 0.0
            if cloneTicket != nil && (cloneTicket?.price)! != workflowPrice {
                if let maybeVault <- cloneTicket?.takePaymentVault() {
                    if let strayPayment <- maybeVault {
                        let buyerReceiver = getAccount((cloneTicket?.buyer)!).capabilities
                            .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                            ?? panic("Buyer Flow token receiver not found for refund")
                        buyerReceiver.deposit(from: <-strayPayment)
                    }
                }
                let ticket <- cloneTicket <- nil
                if ticket != nil {
                    ForteHub.destroyCloneTicket(ticket: <-ticket!)
                }
                panic("Clone ticket price mismatch with registry; ticket refunded.")
            }

            if workflowPrice > 0.0 {
                if !isCreatorClone {
                    let tempVault <- cloneTicket?.takePaymentVault()
                        ?? panic("Clone ticket required")
                    let paymentVault <- tempVault
                        ?? panic("Paid clone tickets must carry payment")

                    if paymentVault.balance != workflowPrice {
                        let buyerReceiver = getAccount((cloneTicket?.buyer)!).capabilities
                            .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                            ?? panic("Buyer Flow token receiver not found for refund")
                        
                        let refund <- paymentVault.withdraw(amount: paymentVault.balance)
                        buyerReceiver.deposit(from: <-refund)
                        
                        destroy paymentVault

                        let ticket <- cloneTicket <- nil
                        if ticket != nil {
                            ForteHub.destroyCloneTicket(ticket: <-ticket!)
                        } else {
                            destroy ticket
                        }
                        panic("Ticket payment does not match workflow price; refunded")
                    } else {
                        let platformFeePercent = ForteHub.getPlatformFeePercent()
                        let platformFeeAmount = workflowPrice * platformFeePercent
                        let creatorAmount = workflowPrice - platformFeeAmount

                        let creatorVault <- paymentVault.withdraw(amount: creatorAmount)
                        let creatorFlowReceiver = getAccount(workflowInfo.creator).capabilities
                            .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                            ?? panic("Creator Flow token receiver not found")
                        creatorFlowReceiver.deposit(from: <-creatorVault)

                        let platformVault <- paymentVault.withdraw(amount: platformFeeAmount)
                        let platformFlowReceiver = getAccount(ForteHub.getFeeCollectorAddress()).capabilities
                            .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                            ?? panic("Platform fee collector not found")
                        platformFlowReceiver.deposit(from: <-platformVault)
                        
                        destroy paymentVault

                        emit WorkflowClonePurchased(
                            sourceWorkflowId: sourceWorkflowId,
                            buyer: self.ownerAddress,
                            creator: workflowInfo.creator,
                            priceFlowTokens: workflowPrice,
                            platformFeeFlowTokens: platformFeeAmount,
                            creatorPaymentFlowTokens: creatorAmount
                        )
                    }
                } else {
                    if let maybeVault <- cloneTicket?.takePaymentVault() {
                        if let strayPayment <- maybeVault {
                            let creatorReceiver = getAccount(self.ownerAddress).capabilities
                                .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                                ?? panic("Creator Flow token receiver not found for refund")
                            creatorReceiver.deposit(from: <-strayPayment)
                        }
                    }
                }
            } else {
                if let maybeVault <- cloneTicket?.takePaymentVault() {
                    if let strayPaymentVault <- maybeVault {
                        let buyerReceiver = getAccount((cloneTicket?.buyer)!).capabilities
                            .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                            ?? panic("Buyer Flow token receiver not found for refund")
                        buyerReceiver.deposit(from: <-strayPaymentVault)
                        let ticket <- cloneTicket <- nil
                        if ticket != nil {
                            ForteHub.destroyCloneTicket(ticket: <-ticket!)
                        } else {
                            destroy ticket
                        }
                        panic("Free workflows should not include payment; refunded.")
                    }
                }
            }

            // STEP 3: Store workflow resource under canonical ID
            if workflow.id != sourceWorkflowId {
                panic("Workflow resource ID must match registry workflow ID")
            }

            let handle <- create WorkflowToken(
                workflowId: sourceWorkflowId,
                creator: workflowInfo.creator,
                workflow: <-workflow
            )

            let replaced <- self.workflows.insert(key: sourceWorkflowId, <-handle)
            let existed = replaced != nil
            destroy replaced
            if existed {
                let ticket <- cloneTicket <- nil
                destroy ticket
                panic("Workflow already exists in manager with this ID")
            }

            emit WorkflowAdded(
                workflowId: sourceWorkflowId,
                workflowName: workflowInfo.name,
                contractName: workflowInfo.contractName,
                category: workflowInfo.category
            )

            // STEP 4: Record the clone in the registry
            ForteHub.recordClone(
                workflowId: sourceWorkflowId,
                cloner: self.ownerAddress
            )

            if let ticket <- cloneTicket {
                ForteHub.destroyCloneTicket(ticket: <-ticket)
            }

            // STEP 5: Emit event with verification details
            emit WorkflowCloned(
                sourceWorkflowId: sourceWorkflowId,
                cloner: self.ownerAddress,
                sourceManagerAddress: workflowInfo.creator
            )

            return sourceWorkflowId
        }

        /// Accept a workflow resource and store it in the manager
        /// Required by WorkflowAcceptance interface
        access(all) fun acceptWorkflow(
            workflowId: UInt64,
            workflow: @{IWorkflow},
            ticket: @CloneTicket?
        ): UInt64 {
            return self.cloneResource(
                sourceWorkflowId: workflowId,
                workflow: <-workflow,
                ticket: <-ticket
            )
        }

        // ===== Removing Workflows =====

        /// Remove a workflow from the manager and return it
        /// If workflow is scheduled, its scheduled tasks are cancelled first
        /// Requires Account access to clean up scheduled handler resources
        access(all) fun removeWorkflow(workflowId: UInt64, account: auth(Storage) &Account?): @WorkflowToken {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
            }

            // First, unschedule the workflow if it has scheduled tasks
            if account != nil {
                let handlerStoragePath = StoragePath(identifier: "ForteHubWorkFlow_".concat(workflowId.toString()).concat("_Handler"))!
                if account!.storage.check<@ForteHubTransactionHandler>(from: handlerStoragePath) {
                    let handler <- account!.storage.load<@ForteHubTransactionHandler>(from: handlerStoragePath)
                    destroy handler
                    emit WorkflowUnscheduled(
                        workflowId: workflowId,
                        taskId: 0  // TaskId unknown at this point
                    )
                }
            }

            let token <- self.workflows.remove(key: workflowId)!
            let workflowName = token.borrowWorkflow().name

            emit WorkflowRemoved(
                workflowId: workflowId,
                workflowName: workflowName
            )

            return <-token
        }

        /// Burn (permanently destroy) a workflow
        /// This removes the workflow, cancels any scheduled tasks, and destroys it
        /// Requires Account access to clean up scheduled handler resources
        access(all) fun burnWorkflow(workflowId: UInt64, account: auth(Storage) &Account) {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
            }

            // First, unschedule the workflow if it has scheduled tasks
            let handlerStoragePath = StoragePath(identifier: "ForteHubWorkFlow_".concat(workflowId.toString()).concat("_Handler"))!
            if account.storage.check<@ForteHubTransactionHandler>(from: handlerStoragePath) {
                let handler <- account.storage.load<@ForteHubTransactionHandler>(from: handlerStoragePath)
                destroy handler
                emit WorkflowUnscheduled(
                    workflowId: workflowId,
                    taskId: 0  // TaskId unknown at this point
                )
            }

            // Then remove and destroy the workflow token
            let token <- self.workflows.remove(key: workflowId)!
            let workflowName = token.borrowWorkflow().name
            ForteHub.destroyWorkflowToken(token: <-token)

            emit WorkflowBurned(
                workflowId: workflowId,
                workflowName: workflowName,
                timestamp: getCurrentBlock().timestamp
            )
        }

        // ===== Registry Integration =====

        /// Helper function to validate workflow before registry registration
        access(all) fun validateWorkflowForRegistration(workflowId: UInt64): Bool {
            return self.workflows.containsKey(workflowId)
        }

        /// Get workflow details needed for registry registration
        /// Returns (contractName, category) for the transaction to use
        access(all) fun getWorkflowRegistrationInfo(workflowId: UInt64): {String: String}? {
            if self.workflows.containsKey(workflowId) {
                let workflow = self.borrowWorkflow(workflowId: workflowId)
                return {
                    "contractName": workflow.name,
                    "category": workflow.category
                }
            }
            return nil
        }

        // ===== Workflow Control =====

        /// Get a reference to a workflow by ID
        access(all) fun borrowWorkflow(workflowId: UInt64): &{IWorkflow} {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
            }
            let tokenRef = &self.workflows[workflowId] as &WorkflowToken?
            return tokenRef!.borrowWorkflow()
        }

        /// Run a workflow by ID (called from scheduled tasks or manual execution)
        /// Execution is triggered by caller (either manually or via FlowTransactionScheduler)
        /// If execution fails, the transaction fails (no error recovery)
        /// Emits WorkflowExecuted with indexer-friendly data for analytics
        access(all) fun run(workflowId: UInt64, isScheduledExecution: Bool) {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
            }

            let workflow = self.borrowWorkflow(workflowId: workflowId)
            let workflowName = workflow.name

            // Execute workflow - if it fails, the transaction fails
            workflow.run()

            // Emit execution event with indexer-friendly data
            emit WorkflowExecuted(
                workflowId: workflowId,
                workflowName: workflowName,
                ownerAddress: self.ownerAddress,
                timestamp: getCurrentBlock().timestamp,
                executionType: isScheduledExecution ? "scheduled" : "manual"
            )
        }

        // ===== Querying =====

        /// Get the number of workflows
        access(all) fun getWorkflowCount(): UInt64 {
            return UInt64(self.workflows.length)
        }

        /// List all workflow IDs
        access(all) fun listWorkflowIds(): [UInt64] {
            return self.workflows.keys
        }

        /// Get metadata for a workflow
        /// Note: Metadata is now stored in ForteHub registry, not in Manager
        /// This returns minimal info from the workflow resource itself
        access(all) fun getWorkflowMetadata(workflowId: UInt64): {String: String}? {
            if self.workflows.containsKey(workflowId) {
                let workflow = self.borrowWorkflow(workflowId: workflowId)
                return {
                    "id": workflowId.toString(),
                    "name": workflow.name,
                    "category": workflow.category
                }
            }
            return nil
        }

        /// Get all workflow IDs with minimal metadata
        /// For full metadata, query ForteHub registry instead
        access(all) fun getAllMetadata(): {UInt64: {String: String}} {
            let result: {UInt64: {String: String}} = {}
            for workflowId in self.workflows.keys {
                if self.workflows.containsKey(workflowId) {
                    let workflow = self.borrowWorkflow(workflowId: workflowId)
                    result[workflowId] = {
                        "id": workflowId.toString(),
                        "name": workflow.name,
                        "category": workflow.category
                    }
                }
            }
            return result
        }

        // ===== MetadataViews Implementation =====

        /// Get all supported metadata view types
        access(all) view fun getViews(): [Type] {
            return [
                Type<MetadataViews.Display>(),
                Type<MetadataViews.ExternalURL>()
            ]
        }

        /// Resolve metadata views for this manager
        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<MetadataViews.Display>():
                    return MetadataViews.Display(
                        name: "ForteHub Workflow Manager",
                        description: "Manages autonomous DeFi workflows for a wallet owner. Tracks execution, scheduling, and pause/resume state.",
                        thumbnail: MetadataViews.HTTPFile(url: "https://raw.githubusercontent.com/flow-usdc/forte-hub/main/assets/fortehub-manager.png")
                    )

                case Type<MetadataViews.ExternalURL>():
                    return MetadataViews.ExternalURL("https://flow.com")

                default:
                    return nil
            }
        }

        // ===== Owner Functions =====

        /// Get owner address (for contract-level functions)
        access(account) fun getOwnerAddress(): Address {
            return self.ownerAddress
        }

        /// Permanently lock further cloning for a workflow owned by this manager's creator
        access(all) fun lockWorkflowClones(workflowId: UInt64) {
            let workflowInfo = ForteHub.getWorkflowInfo(workflowId: workflowId)
                ?? panic("Workflow not found in registry")

            if workflowInfo.creator != self.ownerAddress {
                panic("Only the workflow creator can lock cloning")
            }

            ForteHub.lockClones(
                workflowId: workflowId,
                creator: self.ownerAddress
            )
        }

        /// Receive a workflow resource from another manager (marketplace transfer)
        /// Enables workflow transfers between managers (e.g., marketplace listing → purchase → transfer to buyer)
        /// Ownership determined by storage location (implicit in manager)
        access(all) fun depositWorkflow(token: @WorkflowToken) {
            let workflowId = token.workflowId
            let registryInfo = ForteHub.getWorkflowInfo(workflowId: workflowId)
                ?? panic("Workflow must be registered in ForteHub registry to deposit")

            if registryInfo.workflowId != workflowId {
                panic("Registry ID mismatch on deposit")
            }

            // Ensure user doesn't already own this workflow
            if self.workflows.containsKey(workflowId) {
                panic("You already own this workflow. Remove it first if you want to replace it.")
            }

            // Store token in this manager's dictionary
            let oldWorkflow <- self.workflows.insert(key: workflowId, <-token)
            destroy oldWorkflow

            log("Workflow ".concat(workflowId.toString()).concat(" deposited to manager"))
        }
    }

    // ==================== Registry Functions ====================

    /// Register new workflow
    /// Verifies contract code exists and is deployed by creator
    /// Can only be called from ForteHub contract in the creator's account
    access(account) fun registerWorkflow(
        name: String,
        category: String,
        description: String,
        sourceCodeIPFS: String,
        sourceCodeHash: String,
        isListed: Bool,
        creator: Address,
        contractName: String,
        metadataJSON: String,
        parentWorkflowId: UInt64?,
        capabilities: {String: AnyStruct},
        price: UFix64?,
        imageIPFS: String?,
        configDefaults: {String: AnyStruct}
    ): UInt64 {
        pre {
            getAccount(creator).storage.check<@Manager>(from: ForteHub.FORTEHUB_MANAGER_STORAGE):
                "Creator must have ForteHub Manager resource initialized"
            getAccount(creator).contracts.get(name: contractName) != nil:
                "Contract not deployed by creator"
        }

        // Verify contract exists
        let deployedContract = getAccount(creator).contracts.get(name: contractName)!

        // Check for duplicate IPFS content
        if let existingId = self.getWorkflowByIPFS(ipfsCID: sourceCodeIPFS) {
            let existing = self.workflows[existingId]!
            panic("Cannot register: This exact workflow code already exists! Workflow \"".concat(existing.name).concat("\" (ID: ").concat(existingId.toString()).concat(") created by ").concat(existing.creator.toString()).concat(" has identical source code."))
        }

        // Check for duplicate workflow names for same creator
        if let existingId = self.getWorkflowByCreatorAndName(creator: creator, name: name) {
            panic("Cannot register: You already have a workflow named \"".concat(name).concat("\". Use a different name or append _2 to the name."))
        }

        if parentWorkflowId != nil {
            let parentId = parentWorkflowId!
            if self.workflows[parentId] == nil {
                panic("Parent workflow not found")
            }
        }

        let workflowId = self.nextWorkflowId
        var normalizedMetadata = metadataJSON
        if normalizedMetadata.length == 0 {
            normalizedMetadata = "{}"
        }

        let workflow = WorkflowInfo(
            workflowId: workflowId,
            creator: creator,
            name: name,
            category: category,
            description: description,
            sourceCodeIPFS: sourceCodeIPFS,
            sourceCodeHash: sourceCodeHash,
            isListed: isListed,
            contractName: contractName,
            metadataJSON: normalizedMetadata,
            configDefaults: configDefaults,
            parentWorkflowId: parentWorkflowId,
            capabilities: capabilities,
            price: price,
            imageIPFS: imageIPFS
        )

        self.workflows[workflowId] = workflow
        self.nextWorkflowId = self.nextWorkflowId + 1

        if parentWorkflowId != nil {
            let parentId = parentWorkflowId!
            if var parentWorkflow = self.workflows[parentId] {
                parentWorkflow.setForkCount(parentWorkflow.forkCount + 1)
                self.workflows[parentId] = parentWorkflow
            }
        }

        emit WorkflowRegistered(
            workflowId: workflowId,
            creator: creator,
            name: name,
            category: category,
            ipfsCID: sourceCodeIPFS,
            isListed: isListed,
            contractName: contractName,
            metadataJSON: normalizedMetadata,
            parentWorkflowId: parentWorkflowId
        )

            return workflowId
        }



    /// Record when someone clones (instantiates) this workflow to their account
    /// SECURITY: Only callable by ForteHub contract to prevent bypassing verification
    /// Precondition verifies cloner has properly initialized Manager
    access(account) fun recordClone(workflowId: UInt64, cloner: Address) {
        pre {
            self.workflows[workflowId] != nil:
                "Workflow not found"

            getAccount(cloner).storage.check<@Manager>(from: self.FORTEHUB_MANAGER_STORAGE):
                "Cloner must have ForteHub Manager initialized"

        }

        var workflow = self.workflows[workflowId]!
        workflow.setCloneCount(workflow.cloneCount + 1)
        self.workflows[workflowId] = workflow
        let newCount = workflow.cloneCount

        emit WorkflowCloneRecorded(
            workflowId: workflowId,
            deployer: cloner,
            contractName: self.workflows[workflowId]!.contractName,
            totalClones: newCount
        )
    }

    /// Record when someone forks (creates a derivative of) this workflow
    access(all) fun recordFork(parentWorkflowId: UInt64, newWorkflowId: UInt64, deployer: Address) {
        pre {
            self.workflows[parentWorkflowId] != nil:
                "Parent workflow not found"
            self.workflows[newWorkflowId] != nil:
                "New workflow not found"
        }

        var parentWorkflow = self.workflows[parentWorkflowId]!
        let newWorkflow = self.workflows[newWorkflowId]!

        // Verify the new workflow references the parent
        if newWorkflow.parentWorkflowId != parentWorkflowId {
            panic("New workflow must have parentWorkflowId set to parent workflow ID")
        }

        parentWorkflow.setForkCount(parentWorkflow.forkCount + 1)
        self.workflows[parentWorkflowId] = parentWorkflow
        let newForkCount = parentWorkflow.forkCount

        emit WorkflowForkRecorded(
            parentWorkflowId: parentWorkflowId,
            newWorkflowId: newWorkflowId,
            deployer: deployer,
            totalForks: newForkCount
        )
    }

    /// Change listing status for a workflow (only creator can do this)
    access(all) fun setWorkflowListing(workflowId: UInt64, creator: Address, isListed: Bool) {
        if self.workflows[workflowId] == nil {
            panic("Workflow not found")
        }

        let workflow = self.workflows[workflowId]!

        // Only creator can change listing
        if workflow.creator != creator {
            panic("Only workflow creator can change listing status")
        }

        // Cannot re-list if others have cloned it
        if isListed {
            let cloneCount = self.workflows[workflowId]?.cloneCount ?? 0
            if cloneCount > 0 {
                panic("Cannot re-list workflow that has been deployed by others")
            }
        }

        // Update listing state
        if isListed {
            self.unlistedWorkflows.remove(key: workflowId)
        } else {
            self.unlistedWorkflows[workflowId] = true
        }

        emit WorkflowListingChanged(
            workflowId: workflowId,
            creator: creator,
            isListed: isListed
        )
    }

    /// Update workflow metadata (name, description, parameter schema)
    access(all) fun updateWorkflowMetadata(
        workflowId: UInt64,
        creator: Address,
        name: String,
        description: String,
        newMetadataJSON: String
    ) {
        if self.workflows[workflowId] == nil {
            panic("Workflow not found")
        }

        let workflow = self.workflows[workflowId]!

        // Only creator can update
        if workflow.creator != creator {
            panic("Only workflow creator can update metadata")
        }

        var normalizedMetadata = newMetadataJSON
        if normalizedMetadata.length == 0 {
            normalizedMetadata = "{}"
        }

        // Create updated workflow info
        var updatedWorkflow = WorkflowInfo(
            workflowId: workflow.workflowId,
            creator: workflow.creator,
            name: name,
            category: workflow.category,
            description: description,
            sourceCodeIPFS: workflow.sourceCodeIPFS,
            sourceCodeHash: workflow.sourceCodeHash,
            isListed: workflow.isListed,
            contractName: workflow.contractName,
            metadataJSON: normalizedMetadata,
            configDefaults: workflow.configDefaults,
            parentWorkflowId: workflow.parentWorkflowId,
            capabilities: workflow.capabilities,
            price: workflow.price,
            imageIPFS: workflow.imageIPFS
        )

        updatedWorkflow.setCloneCount(workflow.cloneCount)
        updatedWorkflow.setForkCount(workflow.forkCount)
        updatedWorkflow.setClonesLocked(workflow.clonesLocked)

        self.workflows[workflowId] = updatedWorkflow

        emit WorkflowMetadataUpdated(
            workflowId: workflowId,
            timestamp: getCurrentBlock().timestamp
        )
    }

    /// Update default configuration values used for future clones
    /// Existing clones keep their current config; only future clones reference these defaults
    access(all) fun updateConfigDefaults(
        workflowId: UInt64,
        creator: Address,
        newConfigDefaults: {String: AnyStruct}
    ) {
        if self.workflows[workflowId] == nil {
            panic("Workflow not found")
        }

        let workflow = self.workflows[workflowId]!

        if workflow.creator != creator {
            panic("Only workflow creator can update config defaults")
        }

        var updatedWorkflow = WorkflowInfo(
            workflowId: workflow.workflowId,
            creator: workflow.creator,
            name: workflow.name,
            category: workflow.category,
            description: workflow.description,
            sourceCodeIPFS: workflow.sourceCodeIPFS,
            sourceCodeHash: workflow.sourceCodeHash,
            isListed: workflow.isListed,
            contractName: workflow.contractName,
            metadataJSON: workflow.metadataJSON,
            configDefaults: newConfigDefaults,
            parentWorkflowId: workflow.parentWorkflowId,
            capabilities: workflow.capabilities,
            price: workflow.price,
            imageIPFS: workflow.imageIPFS
        )

        updatedWorkflow.setCloneCount(workflow.cloneCount)
        updatedWorkflow.setForkCount(workflow.forkCount)
        updatedWorkflow.setClonesLocked(workflow.clonesLocked)

        self.workflows[workflowId] = updatedWorkflow

        emit WorkflowConfigDefaultsUpdated(
            workflowId: workflowId,
            creator: creator,
            timestamp: getCurrentBlock().timestamp
        )
    }

    /// Set or update the clone price for a workflow
    /// Only the creator can change the price
    /// Price can be nil/0.0 for free, or any UFix64 amount
    access(all) fun setWorkflowPrice(
        workflowId: UInt64,
        creator: Address,
        newPrice: UFix64?
    ) {
        if self.workflows[workflowId] == nil {
            panic("Workflow not found")
        }

        let workflow = self.workflows[workflowId]!

        // Only creator can update price
        if workflow.creator != creator {
            panic("Only workflow creator can update price")
        }

        // Validate price is non-negative
        if newPrice != nil && newPrice! < 0.0 {
            panic("Workflow price cannot be negative")
        }

        // Create updated workflow info with new price
        var updatedWorkflow = WorkflowInfo(
            workflowId: workflow.workflowId,
            creator: workflow.creator,
            name: workflow.name,
            category: workflow.category,
            description: workflow.description,
            sourceCodeIPFS: workflow.sourceCodeIPFS,
            sourceCodeHash: workflow.sourceCodeHash,
            isListed: workflow.isListed,
            contractName: workflow.contractName,
            metadataJSON: workflow.metadataJSON,
            configDefaults: workflow.configDefaults,
            parentWorkflowId: workflow.parentWorkflowId,
            capabilities: workflow.capabilities,
            price: newPrice,
            imageIPFS: workflow.imageIPFS
        )

        updatedWorkflow.setCloneCount(workflow.cloneCount)
        updatedWorkflow.setForkCount(workflow.forkCount)
        updatedWorkflow.setClonesLocked(workflow.clonesLocked)

        self.workflows[workflowId] = updatedWorkflow

        emit WorkflowPriceUpdated(
            workflowId: workflowId,
            creator: creator,
            newPrice: newPrice,
            timestamp: getCurrentBlock().timestamp
        )
    }

    /// Update the image IPFS CID for a workflow
    /// Only the creator can update the image, and only if it's not locked
    /// Can set to nil to remove the image
    access(all) fun updateImageIPFS(
        workflowId: UInt64,
        creator: Address,
        newImageIPFS: String?
    ) {
        if self.workflows[workflowId] == nil {
            panic("Workflow not found")
        }

        let workflow = self.workflows[workflowId]!

        // Only creator can update image
        if workflow.creator != creator {
            panic("Only workflow creator can update image")
        }

        // Cannot update if image is locked
        if self.lockedImageIPFS[workflowId] == true {
            panic("Workflow image is permanently locked and cannot be updated")
        }

        var updatedWorkflow = WorkflowInfo(
            workflowId: workflowId,
            creator: creator,
            name: workflow.name,
            category: workflow.category,
            description: workflow.description,
            sourceCodeIPFS: workflow.sourceCodeIPFS,
            sourceCodeHash: workflow.sourceCodeHash,
            isListed: workflow.isListed,
            contractName: workflow.contractName,
            metadataJSON: workflow.metadataJSON,
            configDefaults: workflow.configDefaults,
            parentWorkflowId: workflow.parentWorkflowId,
            capabilities: workflow.capabilities,
            price: workflow.price,
            imageIPFS: newImageIPFS
        )

        updatedWorkflow.setCloneCount(workflow.cloneCount)
        updatedWorkflow.setForkCount(workflow.forkCount)
        updatedWorkflow.setClonesLocked(workflow.clonesLocked)

        self.workflows[workflowId] = updatedWorkflow

        emit WorkflowImageIPFSUpdated(
            workflowId: workflowId,
            creator: creator,
            newImageIPFS: newImageIPFS,
            timestamp: getCurrentBlock().timestamp
        )
    }

    /// Permanently lock a workflow's image so it cannot be changed
    /// Only the creator can lock the image
    /// This is irreversible - the image is locked forever
    access(all) fun lockImageIPFS(
        workflowId: UInt64,
        creator: Address
    ) {
        if self.workflows[workflowId] == nil {
            panic("Workflow not found")
        }

        let workflow = self.workflows[workflowId]!

        // Only creator can lock image
        if workflow.creator != creator {
            panic("Only workflow creator can lock image")
        }

        // Mark image as permanently locked
        self.lockedImageIPFS[workflowId] = true

        emit WorkflowImageIPFSLocked(
            workflowId: workflowId,
            creator: creator,
            timestamp: getCurrentBlock().timestamp
        )
    }

    /// Check if a workflow's image is permanently locked
    access(all) fun isImageIPFSLocked(workflowId: UInt64): Bool {
        return self.lockedImageIPFS[workflowId] == true
    }

    /// Permanently lock cloning for a workflow (editions fixed)
    access(all) fun lockClones(
        workflowId: UInt64,
        creator: Address
    ) {
        if self.workflows[workflowId] == nil {
            panic("Workflow not found")
        }

        var workflow = self.workflows[workflowId]!

        if workflow.creator != creator {
            panic("Only workflow creator can lock cloning")
        }

        if workflow.clonesLocked {
            panic("Workflow cloning already locked")
        }

        workflow.setClonesLocked(true)
        self.workflows[workflowId] = workflow

        emit WorkflowCloningLocked(
            workflowId: workflowId,
            creator: creator,
            timestamp: getCurrentBlock().timestamp
        )
    }

    // ===== Fee Management - Owner Only =====

    /// Set fee collector address
    access(account) fun setFeeCollectorAddress(newAddress: Address) {
        pre {
            self.registryOwner == self.account.address : "Only registry owner can update fee collector"
        }
        self.feeCollectorAddress = newAddress
    }

    /// Set platform fee percentage for paid clones
    access(account) fun setPlatformFeePercent(newPercent: UFix64) {
        pre {
            self.registryOwner == self.account.address : "Only registry owner can update platform fee percent"
            newPercent >= 0.0 : "Platform fee percent cannot be negative"
            newPercent <= 1.0 : "Platform fee percent cannot exceed 100% (1.0)"
        }
        self.platformFeePercent = newPercent
    }

    /// Get fee collector address
    access(all) fun getFeeCollectorAddress(): Address {
        return self.feeCollectorAddress
    }

    /// Get platform fee percentage for paid clones
    access(all) fun getPlatformFeePercent(): UFix64 {
        return self.platformFeePercent
    }

    /// Get clone count for a workflow
    access(all) fun getCloneCount(workflowId: UInt64): UInt64 {
        return self.workflows[workflowId]?.cloneCount ?? 0
    }

    /// Get fork count for a workflow
    access(all) fun getForkCount(workflowId: UInt64): UInt64 {
        return self.workflows[workflowId]?.forkCount ?? 0
    }

    /// List all workflows
    access(all) fun listAllWorkflows(): [UInt64] {
        return self.workflows.keys
    }

    /// List only listed/discoverable workflows
    access(all) fun listPublicWorkflows(): [UInt64] {
        let result: [UInt64] = []
        for workflowId in self.workflows.keys {
            if let workflow = self.workflows[workflowId] {
                let isUnlisted = self.unlistedWorkflows[workflowId] ?? false
                if workflow.isListed && !isUnlisted {
                    result.append(workflowId)
                }
            }
        }
        return result
    }

    /// Get workflow info
    access(all) fun getWorkflowInfo(workflowId: UInt64): WorkflowInfo? {
        return self.workflows[workflowId]
    }

    /// Get workflow capabilities
    access(all) fun getWorkflowCapabilities(workflowId: UInt64): {String: AnyStruct}? {
        if let workflow = self.workflows[workflowId] {
            return workflow.capabilities
        }
        return nil
    }

    /// Filter by category
    access(all) fun getWorkflowsByCategory(category: String): [UInt64] {
        let result: [UInt64] = []
        for workflowId in self.workflows.keys {
            if let workflow = self.workflows[workflowId] {
                if workflow.category == category && workflow.isListed {
                    result.append(workflowId)
                }
            }
        }
        return result
    }

    /// List all direct forks/derivatives of a given workflow
    access(all) fun getWorkflowsByParent(parentWorkflowId: UInt64): [UInt64] {
        let result: [UInt64] = []
        for workflowId in self.workflows.keys {
            if let workflow = self.workflows[workflowId] {
                if workflow.parentWorkflowId != nil && workflow.parentWorkflowId! == parentWorkflowId {
                    result.append(workflow.workflowId)
                }
            }
        }
        return result
    }

    /// Filter by creator
    access(all) fun getWorkflowsByCreator(creator: Address): [UInt64] {
        let result: [UInt64] = []
        for workflowId in self.workflows.keys {
            if let workflow = self.workflows[workflowId] {
                if workflow.creator == creator {
                    result.append(workflowId)
                }
            }
        }
        return result
    }

    /// Check if creator already has a workflow with this name
    access(all) fun getWorkflowByCreatorAndName(creator: Address, name: String): UInt64? {
        for workflowId in self.workflows.keys {
            if let workflow = self.workflows[workflowId] {
                if workflow.creator == creator && workflow.name == name {
                    return workflow.workflowId
                }
            }
        }
        return nil
    }

    /// Check if anyone has deployed this exact IPFS content before
    access(all) fun getWorkflowByIPFS(ipfsCID: String): UInt64? {
        for workflowId in self.workflows.keys {
            if let workflow = self.workflows[workflowId] {
                if workflow.sourceCodeIPFS == ipfsCID {
                    return workflow.workflowId
                }
            }
        }
        return nil
    }

    /// Check if a name already exists for this creator
    access(all) fun doesWorkflowNameExist(creator: Address, name: String): Bool {
        return self.getWorkflowByCreatorAndName(creator: creator, name: name) != nil
    }

    /// Check if IPFS content already exists
    access(all) fun checkIPFSExists(ipfsCID: String): {String: AnyStruct}? {
        if let workflowId = self.getWorkflowByIPFS(ipfsCID: ipfsCID) {
            if let workflow = self.workflows[workflowId] {
                return {
                    "workflowId": workflow.workflowId,
                    "creator": workflow.creator,
                    "name": workflow.name
                }
            }
        }
        return nil
    }

    // ==================== Contract Verification ====================

    /// Compute the SHA2-256 hash of a deployed contract (used during registration to store hash)
    access(all) fun getContractCodeHash(
        creatorAddress: Address,
        contractName: String
    ): String {
        let deployedContract = getAccount(creatorAddress)
            .contracts.get(name: contractName)
            ?? panic("Contract not found at address: ".concat(creatorAddress.toString()).concat(" with name: ").concat(contractName))

        let codeHash = String.encodeHex(HashAlgorithm.SHA2_256.hash(deployedContract.code))
        return codeHash
    }

    /// Verify deployed contract code matches expected hash and return contract object
    /// Used during cloning to verify code hasn't changed and get contract for instantiation
    access(all) fun verifyContractCodeMatchesHash(
        creatorAddress: Address,
        contractName: String,
        expectedHash: String
    ): DeployedContract {
        let deployedContract = getAccount(creatorAddress)
            .contracts.get(name: contractName)
            ?? panic("Contract not found at address: ".concat(creatorAddress.toString()).concat(" with name: ").concat(contractName))

        let currentCodeHash = String.encodeHex(HashAlgorithm.SHA2_256.hash(deployedContract.code))

        if currentCodeHash != expectedHash {
            panic("Contract code verification failed: current deployed code (hash: ".concat(currentCodeHash)
                .concat(") does not match registered version (hash: ").concat(expectedHash).concat("). Code may have been modified."))
        }

        return deployedContract
    }

    // ==================== Clone Ticket Helpers ====================

    /// Issue a clone ticket for the requested workflow. Ticket may hold payment when workflow has a price.
    /// This separates payment verification from Manager.cloneResource and prevents double-withdrawals.
    access(all) fun purchaseCloneTicket(
        workflowId: UInt64,
        buyer: Address,
        payment: @FlowToken.Vault?
    ): @CloneTicket {
        let workflowInfo = self.getWorkflowInfo(workflowId: workflowId)
            ?? panic("Workflow not found in registry")

        if workflowInfo.isListed == false && workflowInfo.creator != buyer {
            panic("Workflow is unlisted; tickets are not available")
        }

        let price = workflowInfo.price ?? 0.0
        let timestamp = getCurrentBlock().timestamp

        if price > 0.0 {
            let paymentVault <- payment ?? panic("Payment required: This workflow costs ".concat(price.toString()).concat(" FLOW"))
            if paymentVault.balance != price {
                panic("Payment must equal workflow price. Required: ".concat(price.toString()).concat(" FLOW, Provided: ").concat(paymentVault.balance.toString()).concat(" FLOW"))
            }

            emit CloneTicketIssued(
                workflowId: workflowId,
                buyer: buyer,
                creator: workflowInfo.creator,
                priceFlowTokens: price,
                timestamp: timestamp
            )

            return <-create CloneTicket(
                workflowId: workflowId,
                buyer: buyer,
                creator: workflowInfo.creator,
                price: price,
                timestamp: timestamp,
                paymentVault: <-paymentVault
            )
        } else {
            if let vault <- payment {
                destroy vault
                panic("This workflow is free to clone; do not attach payment.")
            }

            emit CloneTicketIssued(
                workflowId: workflowId,
                buyer: buyer,
                creator: workflowInfo.creator,
                priceFlowTokens: 0.0,
                timestamp: timestamp
            )

            return <-create CloneTicket(
                workflowId: workflowId,
                buyer: buyer,
                creator: workflowInfo.creator,
                price: 0.0,
                timestamp: timestamp,
                paymentVault: nil
            )
        }
    }

    // ==================== Manager Functions ====================

    /// Create a new ForteHub Manager instance
    access(all) fun createManager(ownerAddress: Address): @Manager {
        return <-create Manager(ownerAddress: ownerAddress)
    }

    /// Get the storage path for the manager
    access(all) fun getManagerStoragePath(): StoragePath {
        return self.FORTEHUB_MANAGER_STORAGE
    }

    /// Get the public path for the manager
    access(all) fun getManagerPublicPath(): PublicPath {
        return self.FORTEHUB_MANAGER_PUBLIC
    }

    // ==================== Scheduling Helper Functions ====================

    /// Schedule a workflow with full storage operations (contract-level)
    /// User pays base scheduler fee (0.01 FLOW) directly to FlowTransactionScheduler
    /// No additional platform or creator fees extracted - only ForteHub clone fees apply
    access(all) fun scheduleWorkflow(
        managerRef: &Manager,
        workflowId: UInt64,
        frequencySeconds: UFix64,
        account: auth(Storage, Capabilities) &Account
    ) {
        // Verify workflow exists
        let workflow = managerRef.borrowWorkflow(workflowId: workflowId)
        log("Scheduling workflow: ".concat(workflow.name))

        // ===== STEP 1: Calculate scheduling fee =====
        // Get workflow info for registry lookup
        let workflowInfo = self.getWorkflowInfo(workflowId: workflowId)
            ?? panic("Workflow not found in registry")

        // Scheduler fee goes directly to FlowTransactionScheduler
        let schedulerFee: UFix64 = self.schedulerTransactionFee  // 0.01 FLOW

        log("Workflow: ".concat(workflow.name)
            .concat(" | Scheduler Fee: ").concat(schedulerFee.toString()).concat(" FLOW")
            .concat(" | Fee goes directly to FlowTransactionScheduler"))

        // ===== STEP 2: Get scheduler and create handler =====
        // Borrow scheduler manager directly from account storage with Owner entitlement
        let schedulerRef = account.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("FlowTransactionScheduler Manager not initialized. Please run InitializeSchedulerManager transaction first.")

        // Get manager capability for the handler (from fixed public path)
        let managerCapability = account.capabilities.get<&Manager>(self.FORTEHUB_MANAGER_PUBLIC)!

        // Create the ForteHubTransactionHandler resource
        let handler <- create ForteHubTransactionHandler(
            managerCap: managerCapability,
            ownerAddress: managerRef.getOwnerAddress()
        )

        // Store handler at a deterministic path based on workflow ID
        let handlerStoragePath = StoragePath(identifier: "ForteHubWorkFlow_".concat(workflowId.toString()).concat("_Handler"))!
        account.storage.save(<-handler, to: handlerStoragePath)

        // Create a capability to the handler with Execute entitlement
        // Note: We cannot publish capabilities with entitlements to public paths in Cadence 1.0
        // So we only issue it and pass it directly to the scheduler
        let handlerCapWithAuth = account.capabilities.storage.issue<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>(handlerStoragePath)

        // Prepare initial transaction data
        let transactionData: {String: AnyStruct} = {
            "workflowId": workflowId,
            "frequency": frequencySeconds
        }

        // ===== STEP 3: Withdraw scheduler fee directly from user's wallet =====
        // Withdraw fee directly from user's FLOW wallet
        let userVaultRef = account.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow user FLOW vault. Ensure FLOW wallet is set up.")

        // Check if user has sufficient balance for scheduler fee
        if userVaultRef.balance < schedulerFee {
            emit SchedulingBalanceAlert(
                workflowId: workflowId,
                status: "failed",
                currentBalance: userVaultRef.balance,
                requiredAmount: schedulerFee,
                message: "Insufficient FLOW balance. Need ".concat(schedulerFee.toString()).concat(" but have ").concat(userVaultRef.balance.toString())
            )
            panic("Insufficient FLOW balance for scheduling. Need ".concat(schedulerFee.toString()).concat(" but have ").concat(userVaultRef.balance.toString()))
        }

        // Warn if balance is getting low (less than 0.05 FLOW remaining after scheduling)
        let balanceAfterWithdrawal = userVaultRef.balance - schedulerFee
        if balanceAfterWithdrawal < 0.05 {
            emit SchedulingBalanceAlert(
                workflowId: workflowId,
                status: "warning",
                currentBalance: userVaultRef.balance,
                requiredAmount: schedulerFee,
                message: "Low FLOW balance after scheduling: ".concat(balanceAfterWithdrawal.toString()).concat(" remaining")
            )
        }

        // Withdraw scheduler fee directly from user vault
        let schedulerFees <- (userVaultRef.withdraw(amount: schedulerFee) as! @FlowToken.Vault)

        // Calculate initial execution timestamp
        let initialTimestamp = getCurrentBlock().timestamp + frequencySeconds

        // Schedule the first execution
        let taskId = schedulerRef.schedule(
            handlerCap: handlerCapWithAuth,
            data: transactionData,
            timestamp: initialTimestamp,
            priority: FlowTransactionScheduler.Priority.Medium,
            executionEffort: 1000,
            fees: <-schedulerFees
        )

        // NOTE: Task ID is NOT stored in Manager - it only lives in FlowTransactionScheduler
        // This ensures the scheduler is the single source of truth for scheduling state

        emit WorkflowScheduled(workflowId: workflowId, frequency: frequencySeconds, taskId: taskId)
    }

    /// Unschedule a workflow with storage cleanup
    access(all) fun unscheduleWorkflow(
        managerRef: &Manager,
        workflowId: UInt64,
        account: auth(Storage) &Account
    ) {
        if !managerRef.validateWorkflowForRegistration(workflowId: workflowId) {
            panic("Workflow not found")
        }

        let handlerStoragePath = StoragePath(identifier: "ForteHubWorkFlow_".concat(workflowId.toString()).concat("_Handler"))!
        if account.storage.check<@ForteHubTransactionHandler>(from: handlerStoragePath) {
            let handler <- account.storage.load<@ForteHubTransactionHandler>(from: handlerStoragePath)
            destroy handler
        }
    }

    // ==================== Manager Initialization ====================

    /// Initialize Manager resource if not already present
    access(all) fun initializeManager(account: auth(Storage) &Account) {
        if account.storage.check<@Manager>(from: self.FORTEHUB_MANAGER_STORAGE) {
            log("ForteHub already initialized, skipping creation")
            return
        }

        let manager <- create Manager(ownerAddress: account.address)
        account.storage.save(<-manager, to: self.FORTEHUB_MANAGER_STORAGE)

        log("ForteHub initialized successfully")
    }

    // ==================== MetadataViews Implementation ====================

    access(all) view fun getViews(): [Type] {
        return [
            Type<MetadataViews.Display>(),
            Type<MetadataViews.ExternalURL>()
        ]
    }

    access(all) fun resolveView(_ view: Type): AnyStruct? {
        switch view {
            case Type<MetadataViews.Display>():
                return MetadataViews.Display(
                    name: "ForteHub Registry",
                    description: "Central registry for DeFi workflow strategies on Flow blockchain.",
                    thumbnail: MetadataViews.IPFSFile(cid: "bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq", path: nil)
                )

            case Type<MetadataViews.ExternalURL>():
                return MetadataViews.ExternalURL("")

            default:
                return nil
        }
    }

    /// Update the scheduler transaction fee
    /// Only the registry owner can call this
    access(all) fun setSchedulerFee(_ fee: UFix64) {
        pre {
            self.account.address == self.registryOwner: "Only registry owner can update fee"
        }
        self.schedulerTransactionFee = fee
    }

    // ==================== Initialization ====================

    init() {
        // ===== Storage Paths =====
        self.FORTEHUB_MANAGER_STORAGE = StoragePath(identifier: "forteHubManager")!
        self.FORTEHUB_MANAGER_PUBLIC = PublicPath(identifier: "forteHubManager")!

        // ===== Initialize Registry Storage =====
        self.workflows = {}
        self.unlistedWorkflows = {}
        self.lockedImageIPFS = {}
        self.nextWorkflowId = 1

        // ===== Fee Management =====
        self.platformFeePercent = 0.05  // 5% platform fee for paid clones
        self.schedulerTransactionFee = 0.01  // 0.01 FLOW base fee for FlowTransactionScheduler
        self.feeCollectorAddress = self.account.address
        self.registryOwner = self.account.address
    }
}

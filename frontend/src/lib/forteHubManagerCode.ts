/**
 * ForteHubManager Contract Code
 *
 * SOURCE OF TRUTH: /cadence/contracts/ForteHubManager.cdc
 *
 * This file contains the compiled ForteHubManager contract code for deployment.
 * Keep this in sync with the Cadence version in the cadence/contracts directory.
 *
 * PER-WALLET DEPLOYMENT: ForteHubManager is deployed to each user's account (NOT centralized).
 * Each wallet gets its own instance of ForteHubManager that manages all workflow
 * resources created by that wallet. Supports both manual and scheduled (autonomous)
 * workflows through optional FlowTransactionScheduler integration.
 *
 * KEY CHANGES (Latest Refactor):
 * - Introduced WorkflowConfig struct to consolidate metadata and scheduling state
 * - All scheduling state now uses WorkflowConfig instead of separate dictionaries
 * - Proper Cadence 1.0 view functions in struct
 * - Cleaner, more maintainable code organization
 */

export const FORTEHUB_MANAGER_CONTRACT_CODE = `
/**
 * ForteHubManager.cdc
 *
 * Centralized workflow management contract - deployed ONCE per wallet
 *
 * This contract is deployed to each user's account (NOT to a shared/central address).
 * Each wallet will have its own instance of ForteHubManager.
 * The manager owns and controls all Workflow resources for that wallet owner.
 * Each workflow strategy (rebalancer, arbitrage, etc.) is deployed as a separate
 * contract to the same account, but all workflow instances are stored here.
 *
 * Architecture:
 * - One ForteHubManager per wallet owner
 * - Multiple workflow strategy contracts (deployed separately)
 * - Each workflow strategy contract exports a Workflow resource
 * - ForteHubManager stores all workflows in a dictionary
 * - Provides pause/resume/run methods for all workflows
 * - Supports FlowTransactionScheduler for autonomous workflows (optional)
 *
 * SCHEDULING:
 * - Workflows with executionFrequencySeconds can be scheduled for autonomous execution
 * - ForteHubManager can optionally hold a reference to FlowTransactionScheduler.Manager
 * - When scheduling is enabled, tasks are registered to call run() at specified intervals
 * - Manual workflows (without executionFrequencySeconds) are called directly by user/external systems
 */

import FlowToken from 0x7e60df042a9c0868
import FungibleToken from 0x9a0766d93b6608b7
import FlowTransactionScheduler from 0x8c5303eaa26202d6
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import MetadataViews from 0x631e88ae7f1d7c20

access(all) contract ForteHubManager {

    // ==================== Events ====================

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

    access(all) event WorkflowPaused(
        workflowId: UInt64,
        workflowName: String
    )

    access(all) event WorkflowResumed(
        workflowId: UInt64,
        workflowName: String
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

    // ==================== Storage Paths ====================
    // Fixed paths so they can be reliably referenced in scheduled scripts

    access(all) let ManagerStoragePath: StoragePath
    access(all) let ManagerPublicPath: PublicPath

    // Fixed paths for scheduling (used in FlowTransactionScheduler scripts)
    access(all) let FIXED_MANAGER_STORAGE: StoragePath
    access(all) let FIXED_MANAGER_PUBLIC: PublicPath

    // ==================== Interfaces ====================

    /// Public interface for workflows - each workflow resource must conform
    access(all) resource interface IWorkflow {
        access(all) let id: UInt64
        access(all) let name: String
        access(all) let category: String
        access(all) var isPaused: Bool

        access(all) fun run()
        access(all) fun pause()
        access(all) fun resume()
    }

    /// Get the type of a workflow (implemented in concrete workflow contracts)
    access(all) fun getWorkflowType(workflow: &{IWorkflow}): String {
        return workflow.name
    }

    /// Workflow configuration struct - groups all workflow metadata and scheduling state
    /// Follows Cadence 1.0 best practices for struct composition
    access(all) struct WorkflowConfig {
        access(all) let metadata: {String: String}
        access(all) var isScheduled: Bool
        access(all) var executionFrequency: UFix64
        access(all) var lastExecutionTime: UFix64
        access(all) var scheduledTaskId: UInt64?

        init(
            metadata: {String: String},
            isScheduled: Bool,
            executionFrequency: UFix64,
            lastExecutionTime: UFix64,
            scheduledTaskId: UInt64?
        ) {
            self.metadata = metadata
            self.isScheduled = isScheduled
            self.executionFrequency = executionFrequency
            self.lastExecutionTime = lastExecutionTime
            self.scheduledTaskId = scheduledTaskId
        }

        // View function to safely expose workflow config data
        access(all) view fun getMetadata(): {String: String} {
            return self.metadata
        }

        // View function to check scheduling status
        access(all) view fun getSchedulingInfo(): {String: AnyStruct} {
            return {
                "isScheduled": self.isScheduled,
                "executionFrequency": self.executionFrequency,
                "lastExecutionTime": self.lastExecutionTime,
                "scheduledTaskId": self.scheduledTaskId ?? 0 as UInt64
            }
        }
    }

    /// Public interface for manager - exposed to external callers
    access(all) resource interface IForteHubManager {
        access(all) fun getWorkflowCount(): UInt64
        access(all) fun listWorkflowIds(): [UInt64]
        access(all) fun getWorkflowMetadata(workflowId: UInt64): {String: String}?
    }

    // ==================== WorkflowHandler Resource ====================

    /// WorkflowHandler implements FlowTransactionScheduler.TransactionHandler
    /// for autonomous workflow execution with self-rescheduling
    /// Stored at a known path so it can be borrowed by the scheduler
    access(all) resource WorkflowHandler: FlowTransactionScheduler.TransactionHandler {

        // Store manager capability for accessing manager at execution time
        access(self) let managerCap: Capability<&Manager>
        access(self) let schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>
        access(self) let ownerAddress: Address

        init(
            managerCap: Capability<&Manager>,
            schedulerManagerCap: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>,
            ownerAddress: Address
        ) {
            self.managerCap = managerCap
            self.schedulerManagerCap = schedulerManagerCap
            self.ownerAddress = ownerAddress
        }

        // Required ViewResolver methods (for FlowTransactionScheduler.TransactionHandler interface)
        access(all) view fun getViews(): [Type] {
            return [
                Type<MetadataViews.Display>()
            ]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<MetadataViews.Display>():
                    return MetadataViews.Display(
                        name: "ForteHub Workflow Handler",
                        description: "Transaction handler for autonomous workflow execution via FlowTransactionScheduler",
                        thumbnail: MetadataViews.HTTPFile(url: "https://raw.githubusercontent.com/flow-usdc/forte-hub/main/assets/fortehub-handler.png")
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
            managerRef.run(workflowId: workflowId)

            // Reschedule if scheduling is enabled
            if frequency > 0.0 {
                // Borrow scheduler manager
                let schedulerManager = self.schedulerManagerCap.borrow()
                    ?? panic("Scheduler manager capability not valid")

                let nextTimestamp = getCurrentBlock().timestamp + frequency

                // Prepare same data for next execution
                let nextData: {String: AnyStruct} = {
                    "workflowId": workflowId,
                    "frequency": frequency
                }

                // Issue handler capability for rescheduling
                let handlerPublicPath = PublicPath(identifier: "workflowHandlerPublic".concat(workflowId.toString()))!
                let handlerCap = getAccount(self.ownerAddress).capabilities.get<&{FlowTransactionScheduler.TransactionHandler}>(handlerPublicPath)

                // Get fees from manager
                let fees <- managerRef.withdrawSchedulingFees(workflowId: workflowId)

                // Reschedule with next timestamp
                // Cast handler capability to include Execute entitlement
                let handlerCapWithAuth = handlerCap as! Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>
                let newTaskId = schedulerManager.schedule(
                    handlerCap: handlerCapWithAuth,
                    data: nextData,
                    timestamp: nextTimestamp,
                    priority: FlowTransactionScheduler.Priority.Medium,
                    executionEffort: 1000,
                    fees: <-fees
                )

                // Update task ID in manager
                managerRef.updateScheduledTaskId(workflowId: workflowId, taskId: newTaskId)
            }
        }
    }

    // ==================== Manager Resource ====================

    access(all) resource Manager: IForteHubManager {
        /// Owner account address - stored because resources don't have self.account
        access(self) let ownerAddress: Address

        /// Dictionary mapping workflow ID -> Workflow resource
        /// Each workflow must conform to IWorkflow interface
        access(self) var workflows: @{UInt64: {IWorkflow}}

        /// Consolidated workflow configuration using WorkflowConfig struct
        /// Combines metadata and scheduling state into a single organized structure
        access(self) var workflowConfigs: {UInt64: WorkflowConfig}

        access(self) var nextWorkflowId: UInt64

        /// Reference to FlowTransactionSchedulerUtils.Manager for autonomous execution
        access(self) var schedulerManager: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>?

        /// Flow token vault for paying scheduler fees
        access(self) var flowTokenVault: @FlowToken.Vault

        init(ownerAddress: Address, schedulerManager: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>?) {
            self.ownerAddress = ownerAddress
            self.workflows <- {}
            self.workflowConfigs = {}
            self.nextWorkflowId = 1
            self.schedulerManager = schedulerManager
            // Initialize empty Flow token vault - will be funded when scheduling workflows
            self.flowTokenVault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
        }

        // ===== Adding Workflows =====

        /// Add a workflow to the manager
        /// Returns the assigned workflow ID
        access(all) fun addWorkflow(
            workflow: @{IWorkflow},
            metadata: {String: String}
        ): UInt64 {
            let workflowId = self.nextWorkflowId
            let workflowName = metadata["name"] ?? "Unknown"
            let category = metadata["category"] ?? "unknown"
            let contractName = metadata["contractName"] ?? "Unknown"

            // Store workflow (using insert - returns old workflow if exists)
            let oldWorkflow <- self.workflows.insert(key: workflowId, <-workflow)
            // Explicitly destroy any replaced workflow
            destroy oldWorkflow

            // Store configuration with metadata and default scheduling state
            let config = WorkflowConfig(
                metadata: metadata,
                isScheduled: false,
                executionFrequency: 0.0,
                lastExecutionTime: 0.0,
                scheduledTaskId: nil
            )
            self.workflowConfigs[workflowId] = config

            // Increment counter
            self.nextWorkflowId = self.nextWorkflowId + 1

            emit WorkflowAdded(
                workflowId: workflowId,
                workflowName: workflowName,
                contractName: contractName,
                category: category
            )

            return workflowId
        }

        // ===== Removing Workflows =====

        /// Remove a workflow from the manager and return it
        access(all) fun removeWorkflow(workflowId: UInt64): @{IWorkflow} {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
            }

            let workflow <- self.workflows.remove(key: workflowId)!
            let config = self.workflowConfigs.remove(key: workflowId) ?? panic("Config not found")
            let workflowName = config.metadata["name"] ?? "Unknown"

            emit WorkflowRemoved(
                workflowId: workflowId,
                workflowName: workflowName
            )

            return <-workflow
        }

        /// Burn (permanently destroy) a workflow
        /// This removes the workflow and destroys it, tracking the destruction event
        access(all) fun burnWorkflow(workflowId: UInt64) {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
            }

            let workflow <- self.workflows.remove(key: workflowId)!
            let config = self.workflowConfigs.remove(key: workflowId) ?? panic("Config not found")
            let workflowName = config.metadata["name"] ?? "Unknown"

            // Destroy the workflow permanently
            destroy workflow

            emit WorkflowBurned(
                workflowId: workflowId,
                workflowName: workflowName,
                timestamp: getCurrentBlock().timestamp
            )
        }

        // ===== Workflow Control =====

        /// Get a reference to a workflow by ID
        access(all) fun borrowWorkflow(workflowId: UInt64): &{IWorkflow} {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
            }
            return (&self.workflows[workflowId] as &{IWorkflow}?)!
        }

        /// Run a workflow by ID (called from scheduled tasks or manual execution)
        /// Respects scheduling: checks if enough time has passed for scheduled workflows
        /// If execution fails, the transaction fails (no error recovery)
        /// Emits WorkflowExecuted with indexer-friendly data for analytics
        access(all) fun run(workflowId: UInt64) {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
            }

            let workflow = self.borrowWorkflow(workflowId: workflowId)
            if workflow.isPaused {
                return
            }

            // Check if it's time to run (for scheduled workflows)
            let config = self.workflowConfigs[workflowId]!
            let isScheduledExecution = config.isScheduled
            if config.isScheduled {
                if config.executionFrequency > 0.0 && getCurrentBlock().timestamp < config.lastExecutionTime + config.executionFrequency {
                    return  // Not yet, too soon
                }
            }

            let workflowName = config.metadata["name"] ?? "Unknown"

            // Execute workflow - if it fails, the transaction fails
            workflow.run()

            // Update last execution time if scheduled
            if config.isScheduled {
                self.workflowConfigs[workflowId] = WorkflowConfig(
                    metadata: config.metadata,
                    isScheduled: config.isScheduled,
                    executionFrequency: config.executionFrequency,
                    lastExecutionTime: getCurrentBlock().timestamp,
                    scheduledTaskId: config.scheduledTaskId
                )
            }

            // Emit execution event with indexer-friendly data
            let executionType = isScheduledExecution ? "scheduled" : "manual"
            emit WorkflowExecuted(
                workflowId: workflowId,
                workflowName: workflowName,
                ownerAddress: self.ownerAddress,
                timestamp: getCurrentBlock().timestamp,
                executionType: executionType
            )
        }

        /// Pause a workflow by ID
        /// Note: If workflow is scheduled, transaction must call unscheduleWorkflowWithStorage separately
        access(all) fun pause(workflowId: UInt64) {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
                self.workflowConfigs.containsKey(workflowId): "Workflow config not found"
            }

            let workflow = self.borrowWorkflow(workflowId: workflowId)
            workflow.pause()

            let config = self.workflowConfigs[workflowId]!

            emit WorkflowPaused(
                workflowId: workflowId,
                workflowName: config.metadata["name"] ?? "Unknown"
            )
        }

        /// Resume a workflow by ID
        /// Note: If workflow is scheduled, transaction must call scheduleWorkflowWithStorage separately
        access(all) fun resume(workflowId: UInt64) {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
                self.workflowConfigs.containsKey(workflowId): "Workflow config not found"
            }

            let workflow = self.borrowWorkflow(workflowId: workflowId)
            workflow.resume()

            let config = self.workflowConfigs[workflowId]!

            emit WorkflowResumed(
                workflowId: workflowId,
                workflowName: config.metadata["name"] ?? "Unknown"
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

        /// Get metadata for a workflow from its config
        access(all) fun getWorkflowMetadata(workflowId: UInt64): {String: String}? {
            if let config = self.workflowConfigs[workflowId] {
                return config.metadata
            }
            return nil
        }

        /// Get all metadata from workflow configs
        access(all) fun getAllMetadata(): {UInt64: {String: String}} {
            let result: {UInt64: {String: String}} = {}
            for workflowId in self.workflowConfigs.keys {
                if let config = self.workflowConfigs[workflowId] {
                    result[workflowId] = config.metadata
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

        // ===== Scheduling Control =====

        /// Enable autonomous scheduling for a workflow (metadata only)
        /// Contract-level scheduleWorkflow function must be called separately by transaction
        access(account) fun enableScheduling(workflowId: UInt64, frequencySeconds: UFix64) {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
                self.workflowConfigs.containsKey(workflowId): "Workflow config not found"
                frequencySeconds > 0.0: "Frequency must be greater than 0"
            }

            let config = self.workflowConfigs[workflowId]!
            self.workflowConfigs[workflowId] = WorkflowConfig(
                metadata: config.metadata,
                isScheduled: true,
                executionFrequency: frequencySeconds,
                lastExecutionTime: getCurrentBlock().timestamp,
                scheduledTaskId: config.scheduledTaskId
            )
        }

        /// Disable autonomous scheduling for a workflow (metadata only)
        /// Contract-level unscheduleWorkflow function must be called separately by transaction
        access(account) fun disableScheduling(workflowId: UInt64) {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
                self.workflowConfigs.containsKey(workflowId): "Workflow config not found"
            }

            let config = self.workflowConfigs[workflowId]!
            self.workflowConfigs[workflowId] = WorkflowConfig(
                metadata: config.metadata,
                isScheduled: false,
                executionFrequency: config.executionFrequency,
                lastExecutionTime: config.lastExecutionTime,
                scheduledTaskId: config.scheduledTaskId
            )
        }

        /// Change execution frequency for a scheduled workflow (metadata only)
        /// Contract-level scheduleWorkflow must be called to reschedule the task
        access(account) fun setExecutionFrequency(workflowId: UInt64, frequencySeconds: UFix64) {
            pre {
                self.workflows.containsKey(workflowId): "Workflow not found"
                self.workflowConfigs.containsKey(workflowId): "Workflow config not found"
                frequencySeconds > 0.0: "Frequency must be greater than 0"
            }

            let config = self.workflowConfigs[workflowId]!
            self.workflowConfigs[workflowId] = WorkflowConfig(
                metadata: config.metadata,
                isScheduled: config.isScheduled,
                executionFrequency: frequencySeconds,
                lastExecutionTime: config.lastExecutionTime,
                scheduledTaskId: config.scheduledTaskId
            )
        }

        /// Internal helper for updating task ID during rescheduling
        access(account) fun updateScheduledTaskId(workflowId: UInt64, taskId: UInt64) {
            pre {
                self.workflowConfigs.containsKey(workflowId): "Workflow config not found"
            }

            let config = self.workflowConfigs[workflowId]!
            self.workflowConfigs[workflowId] = WorkflowConfig(
                metadata: config.metadata,
                isScheduled: config.isScheduled,
                executionFrequency: config.executionFrequency,
                lastExecutionTime: config.lastExecutionTime,
                scheduledTaskId: taskId
            )
        }

        /// Get execution frequency for a workflow
        access(all) fun getExecutionFrequency(workflowId: UInt64): UFix64? {
            if let config = self.workflowConfigs[workflowId] {
                return config.executionFrequency
            }
            return nil
        }

        /// Check if a workflow is scheduled
        access(all) fun isWorkflowScheduled(workflowId: UInt64): Bool {
            if let config = self.workflowConfigs[workflowId] {
                return config.isScheduled
            }
            return false
        }

        /// Get the scheduler manager capability (for contract-level functions)
        access(account) fun getSchedulerManagerCap(): Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>? {
            return self.schedulerManager
        }

        /// Get owner address (for contract-level functions)
        access(account) fun getOwnerAddress(): Address {
            return self.ownerAddress
        }

        /// Get scheduled task ID for a workflow (for contract-level functions)
        access(account) fun getScheduledTaskId(workflowId: UInt64): UInt64? {
            if let config = self.workflowConfigs[workflowId] {
                return config.scheduledTaskId
            }
            return nil
        }

        /// Remove scheduled task ID (called during unscheduling)
        access(account) fun removeScheduledTaskId(workflowId: UInt64): UInt64? {
            pre {
                self.workflowConfigs.containsKey(workflowId): "Workflow config not found"
            }

            let config = self.workflowConfigs[workflowId]!
            let taskId = config.scheduledTaskId
            self.workflowConfigs[workflowId] = WorkflowConfig(
                metadata: config.metadata,
                isScheduled: config.isScheduled,
                executionFrequency: config.executionFrequency,
                lastExecutionTime: config.lastExecutionTime,
                scheduledTaskId: nil
            )
            return taskId
        }

        /// Set the scheduler manager capability (can only be set once)
        /// Required for autonomous workflow scheduling with FlowTransactionScheduler
        access(account) fun setSchedulerManager(
            schedulerManager: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>
        ) {
            if self.schedulerManager == nil {
                self.schedulerManager = schedulerManager
            }
        }

        /// Check if scheduler is available
        access(all) fun isSchedulerAvailable(): Bool {
            return self.schedulerManager != nil
        }

        // ===== Fee Management =====

        /// Withdraw Flow tokens from manager vault for scheduling fees
        /// Called by handler when rescheduling
        access(account) fun withdrawSchedulingFees(workflowId: UInt64): @FlowToken.Vault {
            // For now, withdraw a fixed fee amount (can be made configurable)
            // TODO: Query scheduler for actual fee amount based on priority and effort
            let feeAmount = 0.001  // 0.001 FLOW per execution

            let fees <- self.flowTokenVault.withdraw(amount: feeAmount)
            return <-(fees as! @FlowToken.Vault)
        }

        /// Deposit Flow tokens into the manager vault for scheduling fees
        /// Must be called to fund autonomous workflow execution
        access(account) fun depositSchedulingFees(tokens: @FlowToken.Vault) {
            self.flowTokenVault.deposit(from: <-tokens)
        }

        /// Get current balance of Flow tokens in the scheduling fee vault
        access(all) fun getSchedulingFeeBalance(): UFix64 {
            return self.flowTokenVault.balance
        }
    }

    // ==================== Contract Functions ====================

    /// Create a new ForteHubManager instance with optional scheduler manager capability
    /// Supports both manual workflows and autonomous scheduled workflows.
    /// If schedulerManager is provided, workflows can be scheduled for autonomous execution.
    /// If not provided, only manual workflow execution is available.
    access(all) fun createManager(
        ownerAddress: Address,
        schedulerManager: Capability<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>?
    ): @Manager {
        return <-create Manager(ownerAddress: ownerAddress, schedulerManager: schedulerManager)
    }

    /// Get the storage path for the manager
    access(all) fun getManagerStoragePath(): StoragePath {
        return self.ManagerStoragePath
    }

    /// Get the public path for the manager
    access(all) fun getManagerPublicPath(): PublicPath {
        return self.ManagerPublicPath
    }

    // ==================== Scheduling Helper Functions ====================

    /// Schedule a workflow with full storage operations (contract-level)
    /// Called from transaction after enableScheduling
    access(all) fun scheduleWorkflowWithStorage(
        managerRef: &Manager,
        workflowId: UInt64,
        frequencySeconds: UFix64,
        account: auth(Storage, Capabilities) &Account
    ) {
        let schedulerCap = managerRef.getSchedulerManagerCap()
            ?? panic("Scheduler manager not available")

        let schedulerRef = schedulerCap.borrow()
            ?? panic("Cannot borrow scheduler manager capability")

        // Get manager capability for the handler (from fixed public path)
        let managerPublicPath = PublicPath(identifier: "forteHubManager")!
        let managerCapability = account.capabilities.get<&Manager>(managerPublicPath)!

        // Create the WorkflowHandler resource with capabilities
        let handler <- create WorkflowHandler(
            managerCap: managerCapability,
            schedulerManagerCap: schedulerCap,
            ownerAddress: managerRef.getOwnerAddress()
        )

        // Store handler at a deterministic path based on workflow ID
        let handlerStoragePath = StoragePath(identifier: "workflowHandler".concat(workflowId.toString()))!
        account.storage.save(<-handler, to: handlerStoragePath)

        // Create and publish a capability to the handler
        let handlerPublicPath = PublicPath(identifier: "workflowHandlerPublic".concat(workflowId.toString()))!
        let handlerCap = account.capabilities.storage.issue<&{FlowTransactionScheduler.TransactionHandler}>(handlerStoragePath)
        account.capabilities.publish(handlerCap, at: handlerPublicPath)

        // Prepare initial transaction data
        let transactionData: {String: AnyStruct} = {
            "workflowId": workflowId,
            "frequency": frequencySeconds
        }

        // Ensure we have fees available
        let currentBalance = managerRef.getSchedulingFeeBalance()
        if currentBalance < 0.001 {
            panic("Insufficient Flow tokens for scheduling. Please deposit fees first.")
        }

        // Withdraw fees for the initial scheduling
        let fees <- managerRef.withdrawSchedulingFees(workflowId: workflowId)

        // Calculate initial execution timestamp
        let initialTimestamp = getCurrentBlock().timestamp + frequencySeconds

        // Schedule the first execution
        // Cast handler capability to include Execute entitlement
        let handlerCapWithAuth = handlerCap as! Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>
        let taskId = schedulerRef.schedule(
            handlerCap: handlerCapWithAuth,
            data: transactionData,
            timestamp: initialTimestamp,
            priority: FlowTransactionScheduler.Priority.Medium,
            executionEffort: 1000,
            fees: <-fees
        )

        // Store the task ID in the manager
        managerRef.updateScheduledTaskId(workflowId: workflowId, taskId: taskId)

        emit WorkflowScheduled(workflowId: workflowId, frequency: frequencySeconds, taskId: taskId)
    }

    /// Unschedule a workflow with storage cleanup (contract-level)
    /// Called from transaction during disableScheduling
    access(all) fun unscheduleWorkflowWithStorage(
        managerRef: &Manager,
        workflowId: UInt64,
        account: auth(Storage) &Account
    ) {
        let taskId = managerRef.getScheduledTaskId(workflowId: workflowId)
        if taskId == nil {
            return
        }

        let schedulerCap = managerRef.getSchedulerManagerCap()
            ?? panic("Scheduler manager not available")

        let schedulerRef = schedulerCap.borrow()
            ?? panic("Cannot borrow scheduler manager capability")

        // Cancel the scheduled task
        let taskToCancel <- schedulerRef.cancel(id: taskId!)
        destroy taskToCancel

        // Remove the handler resource from storage
        let handlerStoragePath = StoragePath(identifier: "workflowHandler".concat(workflowId.toString()))!
        let handler <- account.storage.load<@WorkflowHandler>(from: handlerStoragePath)
        destroy handler

        // Update manager metadata - remove task ID
        let removedTaskId = managerRef.removeScheduledTaskId(workflowId: workflowId)
            ?? panic("Task ID not found in manager")

        emit WorkflowUnscheduled(workflowId: workflowId, taskId: removedTaskId)
    }

    // ==================== Initialization ====================

    init() {
        // Create deterministic storage paths to avoid collisions per account
        let prefix = "ForteHubManager_".concat(self.account.address.toString())
        self.ManagerStoragePath = StoragePath(identifier: prefix.concat("_Storage"))!
        self.ManagerPublicPath = PublicPath(identifier: prefix.concat("_Public"))!

        // Fixed paths for FlowTransactionScheduler scripts (same for all accounts)
        self.FIXED_MANAGER_STORAGE = StoragePath(identifier: "forteHubManager")!
        self.FIXED_MANAGER_PUBLIC = PublicPath(identifier: "forteHubManager")!

        // ===== Auto-initialize Manager resource =====
        // Manager is created and saved to fixed storage path on contract deployment
        // This ensures the Manager is ready for use immediately in a one-atomic-transaction deployment
        // SECURITY: Only the account deploying this contract can run init(), ensuring wallet ownership

        // Attempt to get scheduler manager capability with Owner entitlement
        // This allows autonomous workflow execution if FlowTransactionScheduler is available
        let schedulerManagerCap = self.account.capabilities.get<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            /public/flowTransactionSchedulerManager
        )

        // Create Manager instance
        let manager <- create Manager(ownerAddress: self.account.address, schedulerManager: schedulerManagerCap)

        // Save to fixed path used by scheduler scripts and frontend queries
        self.account.storage.save(<-manager, to: self.FIXED_MANAGER_STORAGE)

        // Create and publish public capability (read-only access via IForteHubManager interface)
        // SECURITY: Public capability only exposes IForteHubManager interface (query-only, no mutations)
        // Mutations require account-level access via direct storage borrow
        let managerPublicPath = self.FIXED_MANAGER_PUBLIC
        let managerCapability = self.account.capabilities.storage.issue<&{IForteHubManager}>(self.FIXED_MANAGER_STORAGE)
        self.account.capabilities.publish(managerCapability, at: managerPublicPath)
    }
}
`;

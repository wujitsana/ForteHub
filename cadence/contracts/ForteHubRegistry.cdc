/**
 * ForteHubRegistry.cdc
 *
 * Simplified registry for DeFi workflow strategies
 * Stores workflow metadata on-chain with IPFS references for source code
 * Wallet-owned workflow pattern - users deploy workflows to their own accounts
 */

import MetadataViews from 0x631e88ae7f1d7c20

access(all) contract ForteHubRegistry {

    // ==================== Events ====================

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

    /// Workflow metadata and IPFS reference
    access(all) struct WorkflowInfo {
        access(all) let workflowId: UInt64
        access(all) let creator: Address
        access(all) let name: String
        access(all) let category: String
        access(all) let description: String
        access(all) let sourceCodeIPFS: String
        access(all) let isListed: Bool
        access(all) let deploymentType: String
        access(all) let createdAt: UFix64
        access(all) let contractName: String
        access(all) let metadataJSON: String
        access(all) let parentWorkflowId: UInt64?
        access(all) let capabilities: {String: AnyStruct}

        init(
            workflowId: UInt64,
            creator: Address,
            name: String,
            category: String,
            description: String,
            sourceCodeIPFS: String,
            isListed: Bool,
            deploymentType: String,
            contractName: String,
            metadataJSON: String,
            parentWorkflowId: UInt64?,
            capabilities: {String: AnyStruct}
        ) {
            self.workflowId = workflowId
            self.creator = creator
            self.name = name
            self.category = category
            self.description = description
            self.sourceCodeIPFS = sourceCodeIPFS
            self.isListed = isListed
            self.deploymentType = deploymentType
            self.createdAt = getCurrentBlock().timestamp
            self.contractName = contractName
            self.metadataJSON = metadataJSON
            self.parentWorkflowId = parentWorkflowId
            self.capabilities = capabilities
        }
    }

    // ==================== Storage ====================

    access(self) var workflows: {UInt64: WorkflowInfo}
    access(self) var cloneCounts: {UInt64: UInt64}
    access(self) var forkCounts: {UInt64: UInt64}
    access(self) var unlistedWorkflows: {UInt64: Bool}
    access(self) var nextWorkflowId: UInt64

    // ==================== Public Functions ====================

    /// Register new workflow
    access(all) fun registerWorkflow(
        name: String,
        category: String,
        description: String,
        sourceCodeIPFS: String,
        isListed: Bool,
        deploymentType: String,
        creator: Address,
        contractName: String,
        metadataJSON: String,
        parentWorkflowId: UInt64?,
        capabilities: {String: AnyStruct}
    ): UInt64 {
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
            isListed: isListed,
            deploymentType: deploymentType,
            contractName: contractName,
            metadataJSON: normalizedMetadata,
            parentWorkflowId: parentWorkflowId,
            capabilities: capabilities
        )

        self.workflows[workflowId] = workflow
        self.cloneCounts[workflowId] = 0  // Start at 0 clones (only original deployment exists)
        self.forkCounts[workflowId] = 0    // Track direct forks for analytics
        self.nextWorkflowId = self.nextWorkflowId + 1

        if parentWorkflowId != nil {
            let parentId = parentWorkflowId!
            let currentForks = self.forkCounts[parentId] ?? 0
            self.forkCounts[parentId] = currentForks + 1
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

    /// Record when someone clones (deploys) this workflow to their account
    access(all) fun recordClone(workflowId: UInt64, deployer: Address, contractName: String) {
        pre {
            getAccount(deployer).contracts.get(name: contractName) != nil:
                "Contract not deployed by caller"
        }

        if self.workflows[workflowId] == nil {
            panic("Workflow not found")
        }

        let currentCount = self.cloneCounts[workflowId] ?? 0
        let newCount = currentCount + 1
        self.cloneCounts[workflowId] = newCount

        emit WorkflowCloneRecorded(
            workflowId: workflowId,
            deployer: deployer,
            contractName: contractName,
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

        let parentWorkflow = self.workflows[parentWorkflowId]!
        let newWorkflow = self.workflows[newWorkflowId]!

        // Verify the new workflow references the parent
        if newWorkflow.parentWorkflowId != parentWorkflowId {
            panic("New workflow must have parentWorkflowId set to parent workflow ID")
        }

        let currentForks = self.forkCounts[parentWorkflowId] ?? 0
        let newForkCount = currentForks + 1
        self.forkCounts[parentWorkflowId] = newForkCount

        emit WorkflowForkRecorded(
            parentWorkflowId: parentWorkflowId,
            newWorkflowId: newWorkflowId,
            deployer: deployer,
            totalForks: newForkCount
        )
    }

    /// Change listing status for a workflow (only creator can do this)
    /// Can unlist even if clones exist, but cannot re-list if clones exist
    access(all) fun setWorkflowListing(workflowId: UInt64, creator: Address, isListed: Bool) {
        // Check workflow exists
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
            let cloneCount = self.cloneCounts[workflowId] ?? 0
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

    /// Get clone count for a workflow (excludes the original deployment)
    access(all) fun getCloneCount(workflowId: UInt64): UInt64 {
        return self.cloneCounts[workflowId] ?? 0
    }

    /// Get fork count for a workflow (direct children)
    access(all) fun getForkCount(workflowId: UInt64): UInt64 {
        return self.forkCounts[workflowId] ?? 0
    }

    /// List all workflows (including unlisted - for admin/debug)
    access(all) fun listAllWorkflows(): [UInt64] {
        return self.workflows.keys
    }

    /// List only listed/discoverable workflows (for registry browsing)
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

    /// Get metadata views for a specific workflow (for external metadata resolution)
    access(all) fun getWorkflowMetadataViews(workflowId: UInt64): {String: AnyStruct}? {
        if let workflow = self.workflows[workflowId] {
            return {
                "id": workflow.workflowId,
                "name": workflow.name,
                "category": workflow.category,
                "description": workflow.description,
                "creator": workflow.creator,
                "contractName": workflow.contractName,
                "ipfsCID": workflow.sourceCodeIPFS,
                "isListed": workflow.isListed,
                "createdAt": workflow.createdAt,
                "deploymentType": workflow.deploymentType,
                "metadataJSON": workflow.metadataJSON,
                "parentWorkflowId": workflow.parentWorkflowId,
                "cloneCount": self.getCloneCount(workflowId: workflowId),
                "forkCount": self.getForkCount(workflowId: workflowId)
            }
        }
        return nil
    }

    /// Get workflow capabilities (for future v2 composition support)
    /// Returns input/output types, required tokens, and other capability metadata
    access(all) fun getWorkflowCapabilities(workflowId: UInt64): {String: AnyStruct}? {
        if let workflow = self.workflows[workflowId] {
            return workflow.capabilities
        }
        return nil
    }

    /// Filter by category (only listed workflows)
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

    /// Filter by creator (all workflows by creator, including unlisted)
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
                // TODO: Replace with actual ForteHub UI URL when deployed
                return MetadataViews.ExternalURL(
                    ""
                )

            default:
                return nil
        }
    }

    // ==================== Initialization ====================

    init() {
        self.workflows = {}
        self.cloneCounts = {}
        self.forkCounts = {}
        self.unlistedWorkflows = {}
        self.nextWorkflowId = 1
    }
}

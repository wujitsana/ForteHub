/// TestWorkflow.cdc
///
/// Minimal test workflow for manager deployment testing
/// Tests the factory function pattern and resource instantiation

import ForteHub from 0xc2b9e41bc947f855

access(all) contract TestWorkflow {

    /// Minimal workflow resource conforming to IWorkflow interface
    access(all) resource Workflow: ForteHub.IWorkflow {
        access(all) let id: UInt64
        access(all) let name: String
        access(all) let category: String
        access(all) var isPaused: Bool

        init(
            id: UInt64,
            name: String,
            category: String
        ) {
            self.id = id
            self.name = name
            self.category = category
            self.isPaused = false
        }

        access(all) fun run() {
            pre {
                !self.isPaused : "Workflow is paused"
            }
            log("TestWorkflow executing: ".concat(self.name))
        }

        access(all) fun pause() {
            self.isPaused = true
            log("TestWorkflow paused: ".concat(self.name))
        }

        access(all) fun resume() {
            self.isPaused = false
            log("TestWorkflow resumed: ".concat(self.name))
        }
    }

    /// Factory function to create workflow instances and deposit them directly into the caller's manager
    access(all) fun createWorkflow(
        workflowId: UInt64,
        config: {String: AnyStruct},
        manager: &{ForteHub.WorkflowAcceptance},
        ticket: @ForteHub.CloneTicket?
    ) {
        let name = (config["name"] as? String) ?? "Test Workflow"
        let category = (config["category"] as? String) ?? "testing"

        let workflow <- create Workflow(
            id: workflowId,
            name: name,
            category: category
        )

        manager.acceptWorkflow(
            workflowId: workflowId,
            workflow: <-workflow,
            ticket: <-ticket
        )
    }
}

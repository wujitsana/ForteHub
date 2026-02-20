/// DCAAuto.cdc
///
/// Dollar-Cost Averaging (DCA) Workflow
/// Automatically transfers FLOW regularly to accumulate position
/// Configurable: amount per interval, recipient/target account

import FlowToken from 0x7e60df042a9c0868
import FungibleToken from 0x9a0766d93b6608b7
import ForteHub from 0xc2b9e41bc947f855

access(all) contract DCAAuto {

    /// DCA workflow resource for periodic FLOW accumulation
    access(all) resource Workflow: ForteHub.IWorkflow {
        access(all) let id: UInt64
        access(all) let name: String
        access(all) let category: String
        access(all) var isPaused: Bool

        /// Configuration fields
        access(account) var dcaAmount: UFix64
        access(account) var targetAccount: Address
        access(account) var lastExecutionTime: UFix64

        init(
            id: UInt64,
            name: String,
            category: String,
            dcaAmount: UFix64,
            targetAccount: Address
        ) {
            self.id = id
            self.name = name
            self.category = category
            self.isPaused = false
            self.dcaAmount = dcaAmount
            self.targetAccount = targetAccount
            self.lastExecutionTime = 0.0
        }

        /// Execute the DCA - transfer FLOW to target account
        access(all) fun run() {
            pre {
                !self.isPaused : "Workflow is paused"
                self.dcaAmount > 0.0 : "DCA amount must be greater than 0"
            }

            // Get the signer's FLOW vault
            let vaultRef = DCAAuto.account.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
                from: /storage/flowTokenVault
            ) ?? panic("Could not borrow FLOW vault reference")

            // Withdraw the DCA amount
            let vault <- vaultRef.withdraw(amount: self.dcaAmount)
            log("DCA: Withdrawn ".concat(self.dcaAmount.toString()).concat(" FLOW"))

            // Get target account
            let targetAccount = getAccount(self.targetAccount)

            // Get target's FLOW receiver capability
            let targetVaultCap = targetAccount.capabilities.get<&{FungibleToken.Receiver}>(
                /public/flowTokenReceiver
            )

            if targetVaultCap == nil {
                panic("Target account does not have FLOW receiver capability")
            }

            // Borrow the receiver reference
            let targetVault = targetVaultCap!.borrow()
                ?? panic("Could not borrow target vault reference")

            // Deposit to target
            targetVault.deposit(from: <-vault)

            self.lastExecutionTime = getCurrentBlock().timestamp
            log("DCA: Transferred ".concat(self.dcaAmount.toString()).concat(" FLOW to ").concat(self.targetAccount.toString()))
        }

        /// Pause the workflow
        access(all) fun pause() {
            self.isPaused = true
            log("DCA workflow paused")
        }

        /// Resume the workflow
        access(all) fun resume() {
            self.isPaused = false
            log("DCA workflow resumed")
        }

        /// Update DCA amount
        access(account) fun setDCAAmount(_ amount: UFix64) {
            pre {
                amount > 0.0 : "DCA amount must be greater than 0"
            }
            self.dcaAmount = amount
            log("DCA amount set to ".concat(amount.toString()))
        }

        /// Update target account
        access(account) fun setTargetAccount(_ newTarget: Address) {
            self.targetAccount = newTarget
            log("DCA target set to ".concat(newTarget.toString()))
        }

        /// Get current configuration
        access(all) fun getConfig(): {String: String} {
            return {
                "dcaAmount": self.dcaAmount.toString(),
                "targetAccount": self.targetAccount.toString(),
                "lastExecutionTime": self.lastExecutionTime.toString()
            }
        }
    }

    /// Factory function to create workflow instances and deposit them into a manager
    access(all) fun createWorkflow(
        workflowId: UInt64,
        config: {String: AnyStruct},
        manager: &{ForteHub.WorkflowAcceptance},
        ticket: @ForteHub.CloneTicket?
    ) {
        let name = (config["name"] as? String) ?? "Dollar-Cost Averaging (DCA)"
        let category = (config["category"] as? String) ?? "dca"
        let dcaAmount = (config["dcaAmount"] as? UFix64) ?? 0.1
        let targetAccount = (config["targetAccount"] as? Address) ?? self.account.address

        let workflow <- create Workflow(
            id: workflowId,
            name: name,
            category: category,
            dcaAmount: dcaAmount,
            targetAccount: targetAccount
        )

        manager.acceptWorkflow(
            workflowId: workflowId,
            workflow: <-workflow,
            ticket: <-ticket
        )
    }
}

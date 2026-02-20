/// FlowTransferScheduled.cdc
///
/// Simple scheduled FLOW transfer workflow
/// Sends FLOW to a recipient on a configurable schedule
/// Default: 0.01 FLOW every 30 minutes to 0x113073c44a6e40be
/// Configurable: amount, recipient

import FlowToken from 0x7e60df042a9c0868
import FungibleToken from 0x9a0766d93b6608b7
import ForteHub from 0xbd4c3996265ed830

access(all) contract FlowTransferScheduled {

    /// Workflow resource for scheduled FLOW transfers
    access(all) resource Workflow: ForteHub.IWorkflow {
        access(all) let id: UInt64
        access(all) let name: String
        access(all) let category: String
        access(all) var isPaused: Bool

        /// Configuration fields
        access(account) var transferAmount: UFix64
        access(account) var recipient: Address
        access(account) var lastTransferTime: UFix64

        init(
            id: UInt64,
            name: String,
            category: String,
            transferAmount: UFix64,
            recipient: Address
        ) {
            self.id = id
            self.name = name
            self.category = category
            self.isPaused = false
            self.transferAmount = transferAmount
            self.recipient = recipient
            self.lastTransferTime = 0.0
        }

        /// Execute the workflow - transfer FLOW to recipient
        access(all) fun run() {
            pre {
                !self.isPaused : "Workflow is paused"
                self.transferAmount > 0.0 : "Transfer amount must be greater than 0"
            }

            // Get the signer's FLOW vault
            let vaultRef = FlowTransferScheduled.account.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
                from: /storage/flowTokenVault
            ) ?? panic("Could not borrow FLOW vault reference")

            // Withdraw the amount
            let vault <- vaultRef.withdraw(amount: self.transferAmount)
            log("Withdrawn ".concat(self.transferAmount.toString()).concat(" FLOW"))

            // Get recipient account
            let recipientAccount = getAccount(self.recipient)

            // Get recipient's FLOW vault capability
            let recipientVaultCap = recipientAccount.capabilities.get<&{FungibleToken.Receiver}>(
                /public/flowTokenReceiver
            )

            if recipientVaultCap == nil {
                panic("Recipient does not have FLOW vault capability")
            }

            // Borrow the receiver reference
            let recipientVault = recipientVaultCap!.borrow()
                ?? panic("Could not borrow recipient vault reference")

            // Deposit to recipient
            recipientVault.deposit(from: <-vault)

            self.lastTransferTime = getCurrentBlock().timestamp
            log("Transferred ".concat(self.transferAmount.toString()).concat(" FLOW to ").concat(self.recipient.toString()))
        }

        /// Pause the workflow
        access(all) fun pause() {
            self.isPaused = true
            log("FlowTransferScheduled paused")
        }

        /// Resume the workflow
        access(all) fun resume() {
            self.isPaused = false
            log("FlowTransferScheduled resumed")
        }

        /// Update transfer amount
        access(account) fun setTransferAmount(_ amount: UFix64) {
            pre {
                amount > 0.0 : "Amount must be greater than 0"
            }
            self.transferAmount = amount
            log("Transfer amount set to ".concat(amount.toString()))
        }

        /// Update recipient address
        access(account) fun setRecipient(_ newRecipient: Address) {
            self.recipient = newRecipient
            log("Recipient set to ".concat(newRecipient.toString()))
        }

        /// Get current configuration
        access(all) fun getConfig(): {String: String} {
            return {
                "transferAmount": self.transferAmount.toString(),
                "recipient": self.recipient.toString(),
                "lastTransferTime": self.lastTransferTime.toString()
            }
        }
    }

    /// Factory function to create workflow instances
    access(all) fun createWorkflow(
        workflowId: UInt64,
        config: {String: AnyStruct},
        manager: &{ForteHub.WorkflowAcceptance},
        ticket: @ForteHub.CloneTicket?
    ) {
        let name = (config["name"] as? String) ?? "Flow Transfer Scheduled"
        let category = (config["category"] as? String) ?? "transfer"
        let transferAmount = (config["transferAmount"] as? UFix64) ?? 0.01
        let recipient = (config["recipient"] as? Address) ?? self.account.address

        let workflow <- create Workflow(
            id: workflowId,
            name: name,
            category: category,
            transferAmount: transferAmount,
            recipient: recipient
        )

        manager.acceptWorkflow(
            workflowId: workflowId,
            workflow: <-workflow,
            ticket: <-ticket
        )
    }

    /// Helper function for setting recipient with auth
    access(all) fun setRecipientOnWorkflow(
        workflow: &Workflow,
        newRecipient: Address
    ) {
        workflow.setRecipient(newRecipient)
    }

    /// Helper function for setting amount with auth
    access(all) fun setAmountOnWorkflow(
        workflow: &Workflow,
        newAmount: UFix64
    ) {
        workflow.setTransferAmount(newAmount)
    }
}

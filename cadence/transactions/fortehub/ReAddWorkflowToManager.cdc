/// ReAddWorkflowToManager.cdc
///
/// Re-add an existing workflow contract instance to ForteHub
/// Used after contract updates that may have reset the manager

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import ForteHub from 0xbd4c3996265ed830
import FlowTransferScheduled from 0xd695aea7bfa88279

transaction(
    transferAmount: UFix64,
    recipient: Address
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {

        // Get manager reference
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub not initialized")

        let managerAcceptance: &{ForteHub.WorkflowAcceptance} = managerRef
        let config: {String: AnyStruct} = {
            "name": "Flow Transfer Scheduled",
            "category": "transfer",
            "transferAmount": transferAmount,
            "recipient": recipient
        }

        FlowTransferScheduled.createWorkflow(
            workflowId: 2,
            config: config,
            manager: managerAcceptance,
            ticket: <-nil
        )
        log("Workflow re-added to manager")

        // Ensure FLOW vault exists and is funded with scheduling fees
        let flowStoragePath = /storage/flowTokenVault
        if !signer.storage.check<@{FungibleToken.Vault}>(from: flowStoragePath) {
            let vault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
            signer.storage.save(<-vault, to: flowStoragePath)
            log("Created FLOW vault")
        }

        // Publish FLOW vault capability
        let flowCap = signer.capabilities.storage.issue<&{FungibleToken.Vault}>(flowStoragePath)
        signer.capabilities.unpublish(/public/flowTokenVault)
        signer.capabilities.publish(flowCap, at: /public/flowTokenVault)
        log("FLOW vault capability published")
    }
}

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import ForteHub from 0xbd4c3996265ed830
import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6
import DeFiActionsUtils from 0x2ab6f469ee0dfbb6
import YourWorkflowContract from 0x0000000000000000   // TODO: replace with actual contract + creator address

/// Clone Workflow With Optional Scheduling
/// Matches the frontend-generated transaction but exposes manual parameters so
/// power users can run it directly via Flow CLI.
transaction(
  workflowId: UInt64,
  vaultSetupInfo: {String: String},
  vaultTypes: {String: String},
  configOverrides: {String: AnyStruct},
  shouldSchedule: Bool,
  scheduleFrequency: UFix64?
) {
  prepare(signer: auth(AddContract, Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {
    // Ensure ForteHub Manager exists
    if !signer.storage.check<@ForteHub.Manager>(from: ForteHub.FORTEHUB_MANAGER_STORAGE) {
      let manager <- ForteHub.createManager(ownerAddress: signer.address)
      signer.storage.save(<-manager, to: ForteHub.FORTEHUB_MANAGER_STORAGE)
    }

    // Set up required token vaults
    for tokenName in vaultSetupInfo.keys {
      let vaultPath = vaultSetupInfo[tokenName]!
      let storagePath = StoragePath(identifier: vaultPath)
        ?? panic("Invalid storage path: ".concat(vaultPath))

      let vaultExists = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)
      if !vaultExists {
        if tokenName == "FLOW" {
          let vault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
          signer.storage.save(<-vault, to: storagePath)
          log("Created FLOW vault at ".concat(vaultPath))
        } else {
          let vaultTypeStr = vaultTypes[tokenName]
            ?? panic("Missing vault type identifier for ".concat(tokenName))
          let vaultType = CompositeType(vaultTypeStr)
            ?? panic("Invalid vault type identifier: ".concat(vaultTypeStr))
          let vault <- DeFiActionsUtils.getEmptyVault(vaultType)
          signer.storage.save(<-vault, to: storagePath)
          log("Created ".concat(tokenName).concat(" vault at ").concat(vaultPath))
        }
      }

      let existsNow = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)
      if existsNow {
        let _ = signer.capabilities.storage.issue<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(storagePath)
        log("Capability issued for ".concat(tokenName).concat(" at ").concat(vaultPath))
      }
    }

    // Initialize scheduler manager only when needed
    if shouldSchedule && !signer.storage.check<@{FlowTransactionSchedulerUtils.Manager}>(
        from: FlowTransactionSchedulerUtils.managerStoragePath
    ) {
      let schedulerManager <- FlowTransactionSchedulerUtils.createManager()
      signer.storage.save(<-schedulerManager, to: FlowTransactionSchedulerUtils.managerStoragePath)

      let managerCap = signer.capabilities.storage.issue<&{FlowTransactionSchedulerUtils.Manager}>(
          FlowTransactionSchedulerUtils.managerStoragePath
      )
      signer.capabilities.publish(managerCap, at: FlowTransactionSchedulerUtils.managerPublicPath)
      log("FlowTransactionScheduler Manager initialized")
    }

    let workflowInfo = ForteHub.getWorkflowInfo(workflowId: workflowId)
      ?? panic("Workflow not found in registry")
    if workflowInfo.clonesLocked {
      panic("Creator locked cloning for this workflow")
    }
    if workflowInfo.isListed == false && workflowInfo.creator != signer.address {
      panic("Workflow is unlisted and cannot be cloned by this account")
    }

    // Merge registry defaults with caller overrides
    var config: {String: AnyStruct} = {}
    for key in workflowInfo.configDefaults.keys {
      config[key] = workflowInfo.configDefaults[key]!
    }
    for key in configOverrides.keys {
      config[key] = configOverrides[key]!
    }
    if config["name"] == nil {
      config["name"] = workflowInfo.name
    }
    if config["category"] == nil {
      config["category"] = workflowInfo.category
    }

    let managerRef = signer.storage.borrow<&ForteHub.Manager>(
        from: ForteHub.FORTEHUB_MANAGER_STORAGE
    ) ?? panic("ForteHub not initialized")
    let managerAcceptance: &{ForteHub.WorkflowAcceptance} = managerRef

    // Handle clone fee via ticket purchase (creators can skip tickets)
    let workflowPrice = workflowInfo.price ?? 0.0
    let isCreatorClone = workflowInfo.creator == signer.address
    var paymentVault: @FlowToken.Vault? <- nil
    if workflowPrice > 0.0 && !isCreatorClone {
      let flowVault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
        from: /storage/flowTokenVault
      ) ?? panic("FLOW vault not found. Please set up your FLOW wallet first.")
      let withdrawn <- flowVault.withdraw(amount: workflowPrice)
      paymentVault <-! withdrawn as! @FlowToken.Vault
    }

    var ticket: @ForteHub.CloneTicket? <- nil
    if !isCreatorClone {
      ticket <- ForteHub.purchaseCloneTicket(
        workflowId: workflowId,
        buyer: signer.address,
        payment: <-paymentVault
      )
    } else {
      destroy paymentVault
    }

    // Instantiate workflow from creator contract directly into manager
    YourWorkflowContract.createWorkflow(
      workflowId: workflowId,
      config: config,
      manager: managerAcceptance,
      ticket: <-ticket
    )
    log("Workflow cloned successfully. ID: ".concat(workflowId.toString()))

    if shouldSchedule {
      let frequency = scheduleFrequency ?? panic("scheduleFrequency required when shouldSchedule == true")
      ForteHub.scheduleWorkflow(
          managerRef: managerRef,
          workflowId: workflowId,
          frequencySeconds: frequency,
          account: signer
      )
      log("Workflow scheduled to run every ".concat(frequency.toString()).concat(" seconds"))
    }
  }
}

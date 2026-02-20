/**
 * Clone Transaction Generator
 *
 * Generates a per-workflow clone transaction that:
 * 1. Imports the creator's workflow contract
 * 2. Sets up required token vaults for the signer
 * 3. Calls creator contract's createWorkflow(workflowId, config, managerAcceptance, ticket)
 *    so the workflow is deposited directly into the caller's manager via manager.acceptWorkflow()
 * 4. Optionally enables scheduling in the same transaction
 */

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');

export function generateCloneTransaction(contractName: string, creatorAddress: string): string {
  return `
        import FungibleToken from 0x9a0766d93b6608b7
        import FlowToken from 0x7e60df042a9c0868
        import ForteHub from ${FORTEHUB_REGISTRY}
    import DeFiActionsUtils from 0x2ab6f469ee0dfbb6
    import ${contractName} from ${creatorAddress}

    transaction(
      workflowId: UInt64,
      vaultSetupInfo: {String: String},
      vaultTypes: {String: String},
      configOverrides: {String: String},
      enableScheduling: Bool,
      schedulingFrequency: UFix64
    ) {
      prepare(signer: auth(AddContract, Storage, BorrowValue, IssueStorageCapabilityController, SaveValue, Capabilities) &Account) {
        // Get workflow info to determine price
        let workflowInfo = ForteHub.getWorkflowInfo(workflowId: workflowId)
          ?? panic("Workflow not found in registry")

        // Prepare payment vault with only necessary amount (if workflow has a price and signer isn't the creator)
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

        // Set up required vaults
        for tokenName in vaultSetupInfo.keys {
          let vaultPath = vaultSetupInfo[tokenName]!
          let vaultTypeStr = vaultTypes[tokenName] ?? ""
          let storagePath = StoragePath(identifier: vaultPath)
            ?? panic("Invalid storage path: ".concat(vaultPath))

          let vaultExists = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)

          if !vaultExists {
            if tokenName == "FLOW" {
              let vault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
              signer.storage.save(<-vault, to: storagePath)
              log("Created FLOW vault at ".concat(vaultPath))
            } else {
              let vaultType = CompositeType(vaultTypeStr) ?? panic("Invalid vault type: ".concat(vaultTypeStr))
              let vault <- DeFiActionsUtils.getEmptyVault(vaultType)
              signer.storage.save(<-vault, to: storagePath)
              log("Created ".concat(tokenName).concat(" vault at ").concat(vaultPath))
            }
          } else {
            log("Vault already exists for ".concat(tokenName).concat(" at ").concat(vaultPath))
          }

          let vaultExistsNow = signer.storage.check<@{FungibleToken.Vault}>(from: storagePath)
          if vaultExistsNow {
            // Issue a standard Receiver capability for the public path
            let cap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(storagePath)
            let publicPath = PublicPath(identifier: tokenName.concat("Vault"))
              ?? panic("Invalid public path for ".concat(tokenName))
            signer.capabilities.unpublish(publicPath)
            signer.capabilities.publish(cap, at: publicPath)
            log("Issued capability for ".concat(tokenName).concat(" at ").concat(vaultPath))
          }
        }

        // Initialize ForteHub Manager if not exists
        let managerStoragePath = ForteHub.FORTEHUB_MANAGER_STORAGE
        if !signer.storage.check<@ForteHub.Manager>(from: managerStoragePath) {
          // If something else is there (collision or old version), remove it
          if signer.storage.type(at: managerStoragePath) != nil {
             let old <- signer.storage.load<@AnyResource>(from: managerStoragePath)
             destroy old
          }
          
          let manager <- ForteHub.createManager(ownerAddress: signer.address)
          signer.storage.save(<-manager, to: managerStoragePath)
        }

        // Ensure public capability is linked
        let managerPublicPath = ForteHub.FORTEHUB_MANAGER_PUBLIC
        if !signer.capabilities.get<&ForteHub.Manager>(managerPublicPath).check() {
          let cap = signer.capabilities.storage.issue<&ForteHub.Manager>(managerStoragePath)
          signer.capabilities.publish(cap, at: managerPublicPath)
        }

        // Get reference to ForteHub Manager (+ restricted acceptance interface)
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
          from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub Manager not initialized")
        let managerAcceptance: &{ForteHub.WorkflowAcceptance} = managerRef

        // Merge config defaults with overrides
        var config: {String: AnyStruct} = {}
        // Note: configDefaults is a dictionary on WorkflowInfo struct
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

        // Purchase clone ticket (escrows payment inside ticket if needed) unless signer is creator
        var ticket: @ForteHub.CloneTicket? <- nil
        if !isCreatorClone {
          // purchaseCloneTicket is on the ForteHub contract directly
          ticket <-! ForteHub.purchaseCloneTicket(
            workflowId: workflowId,
            buyer: signer.address,
            payment: <-paymentVault
          )
        } else {
          destroy paymentVault
        }

        // Instantiate workflow from creator contract directly into our manager
        ${contractName}.createWorkflow(
          workflowId: workflowId,
          config: config,
          manager: managerAcceptance,
          ticket: <-ticket
        )

        log("Workflow cloned successfully. Workflow ID: ".concat(workflowId.toString()))
        if let price = workflowInfo.price {
          log("Clone price: ".concat(price.toString()).concat(" FLOW"))
        } else {
          log("Clone price: FREE")
        }

        // Optional: Enable scheduling if requested
        if enableScheduling && schedulingFrequency > 0.0 {
          ForteHub.scheduleWorkflow(
            managerRef: managerRef,
            workflowId: workflowId,
            frequencySeconds: schedulingFrequency,
            account: signer
          )
          log("Workflow scheduling enabled with frequency: ".concat(schedulingFrequency.toString()).concat(" seconds"))
        }
      }
    }
  `;
}

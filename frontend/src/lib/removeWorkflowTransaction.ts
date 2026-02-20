// Transaction for removing a workflow instance from user's Manager

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');

export const removeWorkflowTransaction = `
  import ForteHub from ${FORTEHUB_REGISTRY}

  // Transaction to remove a workflow instance from the user's Manager
  // This does NOT delete the workflow registration from ForteHub - others can still clone it
  // This only removes YOUR copy (instance) of the workflow

  transaction(workflowId: UInt64) {
    prepare(signer: auth(Storage) &Account) {
      // 1. Get Manager
      let manager = signer.storage.borrow<&ForteHub.Manager>(
        from: ForteHub.FORTEHUB_MANAGER_STORAGE
      ) ?? panic("ForteHub Manager not initialized. Please initialize your Manager first.")

      // 2. Check workflow exists in manager
      let workflowRef = manager.borrowWorkflow(workflowId: workflowId)
      let workflowName = workflowRef.name

      // 3. Remove workflow from manager
      manager.removeWorkflow(workflowId: workflowId)

      log("Workflow instance removed from your account: ".concat(workflowName))
      log("Workflow ID: ".concat(workflowId.toString()))
      log("Note: The workflow registration still exists - others can still clone it")
    }
  }
`;

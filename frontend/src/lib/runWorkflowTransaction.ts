
const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');

export const runWorkflowTransaction = `
    import ForteHub from ${FORTEHUB_REGISTRY}

    transaction(workflowId: UInt64) {
      prepare(signer: auth(Storage) &Account) {
        // Borrow the manager
        let manager = signer.storage.borrow<&ForteHub.Manager>(from: ForteHub.FORTEHUB_MANAGER_STORAGE)
          ?? panic("Manager not found")

        // Borrow the workflow reference (all workflows implement IWorkflow with run())
        let workflow = manager.borrowWorkflow(workflowId: workflowId)

        // Execute the workflow (IWorkflow interface requires run() method)
        workflow.run()
        
        log("Workflow executed successfully: ".concat(workflow.name))
      }
    }
`;

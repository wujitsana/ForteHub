/// DeployDCAContract.cdc
///
/// Updates or deploys the DCAAuto contract code to the signer's account.
/// This is Step 1 of the DCA deployment process.

transaction(contractCode: String) {
    prepare(signer: auth(AddContract, UpdateContract) &Account) {
        if signer.contracts.get(name: "DCAAuto") != nil {
            signer.contracts.update(name: "DCAAuto", code: contractCode.utf8)
            log("DCAAuto contract updated")
        } else {
            signer.contracts.add(name: "DCAAuto", code: contractCode.utf8)
            log("DCAAuto contract deployed")
        }
    }
}

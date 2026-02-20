transaction(contractCode: String) {
    prepare(signer: auth(UpdateContract) &Account) {
        signer.contracts.update(name: "ForteHub", code: contractCode.utf8)
    }

    execute {
        log("ForteHub contract updated successfully")
    }
}

import ForteHub from 0xc2b9e41bc947f855

transaction(name: String, codeHex: String) {
    prepare(signer: auth(AddContract) &Account) {
        signer.contracts.add(name: name, code: codeHex.decodeHex())
        log("Deployed contract: ".concat(name))
    }
}

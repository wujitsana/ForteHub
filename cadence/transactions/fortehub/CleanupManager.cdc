import ForteHub from 0xc2b9e41bc947f855

transaction {
    prepare(signer: auth(Storage) &Account) {
        let path = ForteHub.FORTEHUB_MANAGER_STORAGE
        if signer.storage.check<@ForteHub.Manager>(from: path) {
            let manager <- signer.storage.load<@ForteHub.Manager>(from: path)
            destroy manager
            log("Destroyed existing ForteHub Manager")
        } else {
            log("No ForteHub Manager found to destroy")
        }
    }
}

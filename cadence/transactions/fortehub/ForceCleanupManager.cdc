transaction {
    prepare(signer: auth(Storage) &Account) {
        let path = /storage/forteHubManager
        if signer.storage.check<@AnyResource>(from: path) {
            let res <- signer.storage.load<@AnyResource>(from: path)
            destroy res
            log("Destroyed resource at /storage/forteHubManager")
        } else {
            log("No resource found at /storage/forteHubManager")
        }
    }
}

import ForteHub from 0xc2b9e41bc947f855

transaction(newFee: UFix64) {
    prepare(signer: &Account) {
        ForteHub.setSchedulerFee(newFee)
        log("Scheduler fee updated to ".concat(newFee.toString()))
    }
}

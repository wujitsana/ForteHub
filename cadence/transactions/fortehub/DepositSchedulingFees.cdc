/// DepositSchedulingFees.cdc
///
/// Deposit FLOW tokens to pay for workflow scheduling fees

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import ForteHub from 0xbd4c3996265ed830

transaction(amount: UFix64) {
    prepare(signer: auth(Storage) &Account) {
        // Borrow FLOW token vault from signer's storage with Withdraw entitlement
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FLOW vault from signer")

        // Withdraw the amount to deposit
        let tokensToDeposit <- vaultRef.withdraw(amount: amount)

        // Borrow the manager
        let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
        ) ?? panic("ForteHub not initialized")

        // Deposit tokens into manager's fee vault
        managerRef.depositSchedulingFees(tokens: <-(tokensToDeposit as! @FlowToken.Vault))

        log("Deposited ".concat(amount.toString()).concat(" FLOW tokens for scheduling fees"))
    }
}

# ForteHub Testing Documentation

This document outlines the testing strategy for the ForteHub platform, including automated scripts for smart contracts and manual verification steps for the frontend.

## 1. Automated Smart Contract Tests

We use a shell script harness to verify the core lifecycle of the `ForteHub` and `ForteHubMarket` smart contracts.

### Test Script
*   **Path**: `scripts/run_full_flow.sh`
*   **Network**: Testnet (default) or Emulator
*   **Prerequisites**: `flow-cli`, `python3` (for argument encoding)

### Covered Scenarios (Happy Path)
The script executes the following sequence to verify the "Happy Path":

1.  **Initialization**:
    *   Initializes `ForteHub.Manager` for Creator, Seller, and Buyer accounts.
    *   Initializes `ForteHubMarket.ListingCollection` for Seller and Buyer.
2.  **Workflow Creation**:
    *   Deploys a `TestWorkflow` contract (simulating a user-created workflow).
    *   Registers the workflow in the `ForteHub` registry.
    *   **Verification**: Checks if the workflow is correctly accepted by the Creator's Manager.
3.  **Cloning**:
    *   Seller purchases a clone ticket (price 0.0 for test).
    *   Seller clones the `TestWorkflow` into their account.
    *   **Verification**: Checks if the `WorkflowToken` is minted and deposited.
4.  **Marketplace Listing**:
    *   Seller lists the cloned workflow token on `ForteHubMarket`.
    *   **Verification**: Checks if the token is moved to the listing collection.
5.  **Marketplace Purchase**:
    *   Buyer purchases the listing using FLOW.
    *   **Verification**: Checks if the token is transferred to the Buyer and funds are transferred to the Seller.
6.  **Governance**:
    *   Creator locks cloning for the workflow.
    *   **Verification**: Ensures the `clonesLocked` flag is set.

### How to Run
```bash
# Ensure you have the correct keys in flow.json for fortehub-v3, fortehub-v2, and fortehub
./scripts/run_full_flow.sh
```

---

## 2. Untested Scenarios (Manual Verification Required)

The following edge cases and management functions are **not** covered by the automated script and should be verified manually if modified.

### Smart Contracts
*   **Management**:
    *   `updateWorkflowMetadata`: Changing name/description after registration.
    *   `updateConfigDefaults`: Changing default configuration values.
    *   `setWorkflowPrice`: Changing the clone price.
    *   `updateImageIPFS`: Updating the workflow thumbnail.
*   **Marketplace**:
    *   `withdrawListing`: Canceling a listing without a purchase.
    *   `changePrice`: Updating the price of an active listing.
*   **Edge Cases**:
    *   Cloning a locked workflow (should fail).
    *   Purchasing with insufficient funds (should fail).
    *   Cloning a paid workflow without a payment vault (should fail).

### Frontend UI
The Next.js frontend does not have automated integration tests. Manual verification is required for:
1.  **Wallet Connection**: Connecting with Blocto/Lilico on Testnet.
2.  **Discover Page**: Viewing the list of registered workflows.
3.  **Profile Page**: Viewing owned workflows and listings.
4.  **Purchase Flow**: Clicking "Buy" in the UI and signing the transaction.
5.  **Network Indicator**: Verifying the "Testnet" badge appears in the header.

## 3. Recent Fixes & Improvements
*   **Cadence 1.0 Compatibility**: All contracts and transactions updated to use `access(all)` and correct resource handling.
*   **Deployment**: `TestWorkflow` is now deployed via a Cadence transaction (hex-encoded) to match mainnet requirements.
*   **Configuration**: Frontend now uses a centralized `src/config/tokens.ts` for easier network management.

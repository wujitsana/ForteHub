#!/usr/bin/env bash
#
# CLI harness that exercises the full ForteHub lifecycle:
# 1. Initialize managers for creator/seller/buyer accounts
# 2. Deploy/register a workflow contract (user must set WORKFLOW_* vars)
# 3. Clone workflow into seller account
# 4. Enable scheduling (optional) and run once
# 5. List workflow token on ForteHubMarket
# 6. Purchase listing from buyer account
# 7. Lock clones from creator account
#
# Usage:
#   export FLOW_CMD=flow
#   export CREATOR_SIGNER=fortehub-v3
#   export SELLER_SIGNER=fortehub-v2
#   export BUYER_SIGNER=fortehub
#   export WORKFLOW_IMPORT_NAME=TestWorkflow
#   export WORKFLOW_CONTRACT_ADDRESS=0xd695aea7bfa88279
#   export WORKFLOW_DEPLOY_TX="cadence/transactions/fortehub/TestWorkflowDeploy.cdc"
#   export WORKFLOW_DEPLOY_ARGS="--arg Address:0xd695aea7bfa88279"
#   export WORKFLOW_ID=1
#   export LISTING_PRICE=10.0
#   ./scripts/run_full_flow.sh
#
# Notes:
# - Ensure the workflow contract (WORKFLOW_IMPORT_NAME) is deployed to WORKFLOW_CONTRACT_ADDRESS
# - Update WORKFLOW_DEPLOY_TX / WORKFLOW_DEPLOY_ARGS if you use a different deploy transaction
# - LISTING_ID defaults to 1; bump it if you already have listings in ForteHubMarket state

set -euo pipefail

FLOW_CMD=${FLOW_CMD:-flow --network testnet}
CREATOR_SIGNER=${CREATOR_SIGNER:-fortehub-v3}
SELLER_SIGNER=${SELLER_SIGNER:-fortehub-v2}
SELLER_ADDRESS=${SELLER_ADDRESS:-0xd695aea7bfa88279}
BUYER_SIGNER=${BUYER_SIGNER:-fortehub}
WORKFLOW_IMPORT_NAME=${WORKFLOW_IMPORT_NAME:-TestWorkflow}
WORKFLOW_CONTRACT_ADDRESS=${WORKFLOW_CONTRACT_ADDRESS:-0xc2b9e41bc947f855}
WORKFLOW_DEPLOY_TX=${WORKFLOW_DEPLOY_TX:-cadence/transactions/fortehub/TestWorkflowDeploy.cdc}
WORKFLOW_DEPLOY_ARGS=${WORKFLOW_DEPLOY_ARGS:-}
WORKFLOW_ID=${WORKFLOW_ID:-1}
LISTING_PRICE=${LISTING_PRICE:-10.0}
LISTING_ID=${LISTING_ID:-1}

TMP_CLONE_TX=$(mktemp)
cleanup() {
  rm -f "$TMP_CLONE_TX"
}
trap cleanup EXIT

generate_clone_tx() {
  sed \
    -e "s/YourWorkflowContract/${WORKFLOW_IMPORT_NAME}/g" \
    -e "s/0x0000000000000000/${WORKFLOW_CONTRACT_ADDRESS}/g" \
    cadence/transactions/fortehub/CloneWorkflow.cdc >"$TMP_CLONE_TX"
}

log_step() {
  echo
  echo "=== $1 ==="
}

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing file: $1" >&2
    exit 1
  fi
}

require_file "$WORKFLOW_DEPLOY_TX"

log_step "1. Initialize ForteHub managers"
$FLOW_CMD transactions send cadence/transactions/fortehub/InitializeManager.cdc --signer "$CREATOR_SIGNER"
$FLOW_CMD transactions send cadence/transactions/fortehub/InitializeManager.cdc --signer "$SELLER_SIGNER"
$FLOW_CMD transactions send cadence/transactions/fortehub/InitializeManager.cdc --signer "$BUYER_SIGNER"

log_step "2. Deploy/register workflow contract (${WORKFLOW_IMPORT_NAME})"
# Read contract code and convert to Hex string
# Using xxd (part of vim-common or standalone) or python
if command -v xxd &>/dev/null; then
    CODE_HEX=$(xxd -p "cadence/contracts/${WORKFLOW_IMPORT_NAME}.cdc" | tr -d '\n')
elif command -v python3 &>/dev/null; then
    CODE_HEX=$(python3 -c "import binascii; print(binascii.hexlify(open('cadence/contracts/${WORKFLOW_IMPORT_NAME}.cdc', 'rb').read()).decode('utf-8'))")
else
    echo "Error: xxd or python3 required for hex encoding"
    exit 1
fi

# Deploy contract using args-json to avoid flag issues
ARGS_JSON=$(python3 -c "import json; print(json.dumps([{'type': 'String', 'value': '${WORKFLOW_IMPORT_NAME}'}, {'type': 'String', 'value': '${CODE_HEX}'}]))")

$FLOW_CMD transactions send cadence/transactions/fortehub/DeployWorkflowContract.cdc \
  --signer "$CREATOR_SIGNER" \
  --args-json "$ARGS_JSON"

# Setup workflow (initialize and register)
ARGS_JSON=$(python3 -c "import json; print(json.dumps([{'type': 'Address', 'value': '${WORKFLOW_CONTRACT_ADDRESS}'}]))")
$FLOW_CMD transactions send cadence/transactions/fortehub/SetupTestWorkflow.cdc \
  --signer "$CREATOR_SIGNER" \
  --args-json "$ARGS_JSON"

log_step "3. Initialize listing collections"
$FLOW_CMD transactions send cadence/transactions/fortehub/InitializeListingCollection.cdc --signer "$SELLER_SIGNER"
$FLOW_CMD transactions send cadence/transactions/fortehub/InitializeListingCollection.cdc --signer "$BUYER_SIGNER"

log_step "4. Clone workflow into seller account"
generate_clone_tx
ARGS_JSON=$(python3 -c "import json; print(json.dumps([{'type': 'UInt64', 'value': '${WORKFLOW_ID}'}, {'type': 'Dictionary', 'value': []}, {'type': 'Dictionary', 'value': []}, {'type': 'Dictionary', 'value': []}]))")
$FLOW_CMD transactions send "$TMP_CLONE_TX" \
  --signer "$SELLER_SIGNER" \
  --args-json "$ARGS_JSON"

log_step "5. Optionally enable scheduling (uncomment if needed)"
echo "# ARGS_JSON=\$(python3 -c \"import json; print(json.dumps([{'type': 'UInt64', 'value': '${WORKFLOW_ID}'}, {'type': 'UFix64', 'value': '86400.0'}]))\")"
echo "# $FLOW_CMD transactions send cadence/transactions/fortehub/EnableWorkflowScheduling.cdc --signer $SELLER_SIGNER --args-json \"\$ARGS_JSON\""

log_step "6. List workflow token for sale"
ARGS_JSON=$(python3 -c "import json; print(json.dumps([{'type': 'UInt64', 'value': '${WORKFLOW_ID}'}, {'type': 'UFix64', 'value': '${LISTING_PRICE}'}]))")
$FLOW_CMD transactions send cadence/transactions/fortehub/ListWorkflowForSale.cdc \
  --signer "$SELLER_SIGNER" \
  --args-json "$ARGS_JSON"

log_step "7. Purchase listing from buyer"
ARGS_JSON=$(python3 -c "import json; print(json.dumps([{'type': 'Address', 'value': '${SELLER_ADDRESS}'}, {'type': 'UInt64', 'value': '${LISTING_ID}'}, {'type': 'UFix64', 'value': '${LISTING_PRICE}'}]))")
$FLOW_CMD transactions send cadence/transactions/fortehub/PurchaseMarketplaceListing.cdc \
  --signer "$BUYER_SIGNER" \
  --args-json "$ARGS_JSON"

log_step "8. Lock cloning for the workflow (creator)"
ARGS_JSON=$(python3 -c "import json; print(json.dumps([{'type': 'UInt64', 'value': '${WORKFLOW_ID}'}]))")
$FLOW_CMD transactions send cadence/transactions/fortehub/LockWorkflowClones.cdc \
  --signer "$CREATOR_SIGNER" \
  --args-json "$ARGS_JSON"

log_step "CLI harness complete. Review transaction logs above for success."

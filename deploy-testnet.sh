#!/bin/bash

# Deploy ForteHubRegistry to Flow testnet
# This script:
# 1. Creates a new testnet account
# 2. Saves the private key
# 3. Deploys ForteHubRegistry contract

set -e

echo "🚀 ForteHub Registry Deployment to Testnet"
echo "============================================"
echo ""

# Generate new account
echo "📝 Generating new testnet account..."
ACCOUNT_INFO=$(flow accounts create --network testnet)

echo "Account created:"
echo "$ACCOUNT_INFO"
echo ""

# Extract address from output
ACCOUNT_ADDRESS=$(echo "$ACCOUNT_INFO" | grep "Address:" | awk '{print $2}')
echo "New account address: $ACCOUNT_ADDRESS"
echo ""

# Save the private key
echo "🔐 Saving private key..."
echo "$ACCOUNT_INFO" > testnet-account-info.txt
echo "Private key saved to: testnet-account-info.txt"
echo ""

# Update flow.json with new address
echo "⚙️  Updating flow.json with new account address..."
# This would require jq or similar tool. For now, we'll show instructions

cat << EOF

📋 Next steps:

1. Update flow.json:
   - Replace the testnet-account address with: $ACCOUNT_ADDRESS
   - Create/update testnet-account.pkey file with the private key from testnet-account-info.txt

2. Fund the account with FLOW tokens (min ~0.1 FLOW for deployment)
   - Use Flow testnet faucet: https://testnet-faucet.onflow.org/

3. Deploy the contract:
   flow project deploy --network testnet

4. Save the deployment address as NEXT_PUBLIC_FORTEHUB_REGISTRY in your .env.local file

Current output saved in: testnet-account-info.txt
EOF

echo ""
echo "✅ Account generation complete!"

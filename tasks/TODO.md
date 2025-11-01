# Development Tasks

## Current Sprint

### Smart Contract Development
- [ ] Implement DeFiToken fungible token contract
- [ ] Implement DeFiSwap AMM contract with liquidity pool
- [ ] Add swap function with slippage protection
- [ ] Add liquidity provision functions
- [ ] Implement price calculation logic (constant product formula)
- [ ] Write unit tests for token contract
- [ ] Write unit tests for swap contract
- [ ] Deploy contracts to emulator and verify

### Transaction & Script Development
- [ ] Create transaction: swap tokens
- [ ] Create transaction: add liquidity
- [ ] Create transaction: remove liquidity
- [ ] Create transaction: initialize token vault
- [ ] Create script: get token balance
- [ ] Create script: get pool reserves
- [ ] Create script: calculate swap output
- [ ] Create script: get LP token balance

### Frontend Development
- [ ] Initialize Next.js/React project
- [ ] Set up FCL configuration
- [ ] Implement wallet authentication
- [ ] Create Swap UI component
- [ ] Create Liquidity UI component
- [ ] Create Token Balance display
- [ ] Integrate price oracle (MCP server)
- [ ] Add transaction status notifications
- [ ] Implement error handling
- [ ] Add loading states

### Testing & Deployment
- [ ] Test all transactions on emulator
- [ ] Verify event emissions
- [ ] Test frontend integration with emulator
- [ ] Perform end-to-end testing
- [ ] Deploy to testnet
- [ ] Update contract addresses in frontend config

## Backlog

### Enhancement Ideas
- Implement multi-hop swaps
- Add farming/staking functionality
- Create price chart visualization
- Add transaction history page
- Implement governance token
- Add analytics dashboard

### Documentation
- Document contract architecture
- Write API documentation for scripts/transactions
- Create user guide for frontend
- Add deployment guide

## Completed

_Tasks will be moved here as they are completed_

## Notes

- Use MCP server `flow-defi-mcp` for token price queries
- Test on emulator before testnet deployment
- Follow incremental, checkpoint-based development
- Reference `.claude/CLAUDE.md` files for standards

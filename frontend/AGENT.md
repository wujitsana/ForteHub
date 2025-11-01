# Frontend Development Guidelines

## Configuration Management

### Flow SDK Setup (New @onflow/sdk)
```javascript
// src/config/flow-config.js
import { config } from "@onflow/sdk"

// Configure Flow SDK for emulator
config({
  "flow.network": "emulator",
  "accessNode.api": "http://localhost:8888",
  "discovery.wallet": "http://localhost:8701/fcl/authn",
  "app.detail.title": "Flow DeFi App",
  "app.detail.icon": "https://your-icon-url.com/icon.png"
})

// Contract addresses
const CONTRACTS = {
  DeFiToken: "0xf8d6e0586b0a20c7",
  DeFiSwap: "0xf8d6e0586b0a20c7"
}
```

### Environment-Based Configuration
- Store contract addresses in environment variables
- Use `.env.local` for local development (emulator)
- Use `.env.testnet` for testnet deployment
- Never commit private keys or sensitive data
- Switch network config based on `process.env.NEXT_PUBLIC_NETWORK`

## Flow SDK Integration Best Practices

### Authentication & Authorization
```javascript
import { currentUser, authenticate, unauthenticate } from "@onflow/sdk"

// Authenticate user
const login = async () => {
  await authenticate()
  const user = await currentUser()
  return user
}

// Subscribe to auth state changes
currentUser.subscribe((user) => {
  if (user.loggedIn) {
    console.log("User authenticated:", user.addr)
  }
})

// Logout
const logout = async () => {
  await unauthenticate()
}
```

### Transaction Execution
```javascript
import { send, transaction, args, arg, payer, proposer, authorizations, limit, authz } from "@onflow/sdk"

// Execute transaction with proper error handling
const executeSwap = async (tokenAAmount, tokenBAmount) => {
  try {
    const txId = await send([
      transaction(SWAP_TRANSACTION),
      args([
        arg(tokenAAmount.toFixed(8), t.UFix64),
        arg(tokenBAmount.toFixed(8), t.UFix64)
      ]),
      payer(authz),
      proposer(authz),
      authorizations([authz]),
      limit(1000)
    ]).then(decode)

    const tx = await send([getTransaction(txId)]).then(decode)
    return tx
  } catch (error) {
    console.error("Swap failed:", error)
    throw error
  }
}
```

### Script Queries (Read-Only)
```javascript
import { send, script, args, arg } from "@onflow/sdk"

// Query blockchain state
const getPoolReserves = async () => {
  const reserves = await send([
    script(GET_POOL_RESERVES_SCRIPT),
    args([])
  ]).then(decode)

  return reserves
}

// Query with arguments
const getTokenBalance = async (address) => {
  const balance = await send([
    script(GET_BALANCE_SCRIPT),
    args([arg(address, t.Address)])
  ]).then(decode)

  return balance
}
```

## Frontend Interaction Patterns

### DeFi-Specific Components
- **Token Balance Display**: Query user vault balances via scripts
- **Swap Interface**: Input amounts, calculate output, handle slippage
- **Liquidity Management**: Add/remove liquidity with pool share calculations
- **Price Display**: Fetch prices from MCP server or on-chain oracles
- **Transaction History**: Listen to Flow events and display user activity

### State Management
- Use React Context or Redux for global state (user, balances, pools)
- Cache blockchain data with SWR or React Query
- Implement optimistic UI updates for better UX
- Handle transaction pending/success/failure states
- Store user preferences (slippage tolerance, deadlines) locally

### Real-Time Updates
```javascript
import { send, getEvents } from "@onflow/sdk"

// Subscribe to Flow events
const subscribeToSwapEvents = async (fromBlock, toBlock) => {
  const events = await send([
    getEvents("A.DeFiSwap.TokenSwapped", fromBlock, toBlock)
  ]).then(decode)

  events.forEach(event => {
    console.log("Swap event:", event)
  })

  return events
}
```

## Error Handling Strategies

### Transaction Errors
- Display user-friendly error messages for common failures
- Handle insufficient balance errors
- Show slippage exceeded warnings
- Implement retry logic for network failures
- Log errors for debugging (but don't expose sensitive data)

### Network Errors
- Detect network disconnections
- Show loading states during blockchain queries
- Implement timeout handling for slow responses
- Provide fallback UI when data is unavailable

### Validation
- Validate input amounts before sending transactions
- Check user authentication state before actions
- Verify token approvals and vault existence
- Enforce minimum/maximum transaction limits

## UI/UX Best Practices

### DeFi Interface Guidelines
- Show real-time exchange rates and price impact
- Display estimated transaction fees (gas)
- Implement slippage tolerance settings (default 0.5%)
- Show transaction deadlines (default 20 minutes)
- Display clear confirmation dialogs before transactions

### Loading & Feedback
- Show loading spinners during transaction processing
- Display transaction status (pending → sealed → executed)
- Show success/error toasts after transaction completion
- Provide transaction links to Flow block explorer
- Update UI immediately after successful transactions

### Accessibility
- Use semantic HTML elements
- Provide ARIA labels for interactive elements
- Ensure keyboard navigation works
- Test with screen readers
- Use sufficient color contrast

## Code Organization

### Directory Structure
```
frontend/src/
├── components/          # React components
│   ├── Swap/
│   ├── Liquidity/
│   └── TokenBalance/
├── config/             # Flow SDK configuration
├── hooks/              # Custom React hooks (useAuth, useSwap)
├── cadence/            # Cadence code (transactions, scripts)
│   ├── transactions/
│   └── scripts/
├── utils/              # Helper functions (formatters, calculations)
└── contexts/           # React contexts (AuthContext, Web3Context)
```

### Code Style
- Use TypeScript for type safety
- Follow React best practices (hooks, functional components)
- Use ESLint and Prettier for code formatting
- Write modular, reusable components
- Separate business logic from presentation

## Testing

### Unit Tests
- Test utility functions (price calculations, formatters)
- Test React components with React Testing Library
- Mock @onflow/sdk calls in tests
- Test error handling paths

### Integration Tests
- Test end-to-end user flows
- Verify transaction execution against emulator
- Test wallet connection and authentication
- Validate form submissions and validations

## DeFi-Specific Considerations

### Price Calculations
- Use BigNumber libraries for precise decimal math
- Handle UFix64 conversions correctly (8 decimal places)
- Calculate price impact before swaps
- Implement slippage protection

### Security
- Never store private keys in frontend
- Validate all user inputs
- Sanitize data before displaying
- Use HTTPS in production
- Implement rate limiting for API calls

### Performance
- Lazy load components and routes
- Debounce input handlers
- Cache blockchain queries
- Use memoization for expensive calculations
- Optimize re-renders with React.memo

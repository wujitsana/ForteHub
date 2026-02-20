# Cadence Development Guidelines

## Syntax Requirements
- Cadence 1.0

### Resource Handling
- Use `@` prefix for resource types (e.g., `@NFT`, `@Vault`, `@LiquidityPool`)
- Use `&` for references (e.g., `&{FungibleToken.Vault}`)
- Always move resources with `<-` operator, never copy
- Destroy resources explicitly with `destroy` keyword
- Use `create` keyword to instantiate new resources

### Access Control
- Prefer `access(all)` for public interfaces
- Use `access(account)` for account-scoped access
- Use `access(contract)` for contract-internal functions
- Implement capability-based security patterns
- Use `auth` keyword for authorized references

### Type System
- Use optional types (`Type?`) for nullable values
- Implement interfaces with `: InterfaceName` syntax
- Leverage Cadence's strong type system for safety
- Use `AnyStruct` and `AnyResource` sparingly

## Testing Protocol

### Unit Testing
- Write tests in `cadence/tests/` directory using `flow test`
- Test all resource creation and destruction paths
- Verify access control and authorization logic
- Test edge cases and failure scenarios
- Mock external contract dependencies

### Integration Testing
- Test transactions and scripts against local emulator
- Verify contract interactions and cross-contract calls
- Test event emissions and data integrity
- Validate DeFi operations (swaps, liquidity) end-to-end

## Standard Patterns for DeFi

### Fungible Token (FT) Pattern
```cadence
access(all) contract DeFiToken {
    access(all) resource Vault {
        access(all) var balance: UFix64

        init(balance: UFix64) {
            self.balance = balance
        }
    }

    access(all) fun createEmptyVault(): @Vault
}
```

### Liquidity Pool & AMM Pattern
- Implement constant product formula: `x * y = k`
- Use `@LiquidityPool` resource for pool state
- Calculate LP token shares based on pool ratio
- Emit events for deposits, withdrawals, and swaps
- Implement slippage protection with `minAmountOut`

### Token Swap Pattern
- Validate token types before swap execution
- Calculate exchange rates using pool reserves
- Update pool state atomically
- Emit `TokenSwapped` events with full details
- Check deadline timestamps for transaction validity

### Price Oracle Integration
- Query real-time prices via MCP server (flow-defi-mcp)
- Implement on-chain price feed contracts when needed
- Use time-weighted average prices (TWAP) for manipulation resistance
- Handle stale or missing price data gracefully

## Interface Implementation Rules

### Standard Interfaces
- Import FungibleToken, NonFungibleToken from Flow standards
- Implement all required interface methods
- Follow MetadataViews standards for token metadata
- Use ViewResolver for NFT display information

### DeFi-Specific Interfaces
- Define clear swap, deposit, and withdraw interfaces
- Separate user-facing and admin functions
- Use events to communicate all state changes
- Document all public functions with inline comments

## Error Handling

- Use `pre` conditions to validate inputs
- Use `post` conditions to verify state changes
- Use `panic()` with descriptive messages for invariant violations
- Provide clear error messages for user-facing errors
- Validate all arithmetic operations to prevent overflow/underflow

## Code Organization

- One contract per file in `cadence/contracts/`
- Group related transactions in subdirectories (e.g., `transactions/swap/`)
- Name scripts descriptively (e.g., `get_pool_reserves.cdc`)
- Keep transaction logic minimal—implement business logic in contracts
- Separate admin operations from user operations

## DeFi Security Considerations

- Protect against reentrancy attacks (Cadence prevents this by design)
- Implement slippage protection for all swaps
- Validate minimum output amounts
- Check for integer overflow in price calculations
- Use deadlines to prevent stale transactions
- Implement pausable functionality for emergency stops

## Scheduled Transactions

### Required Params (Scheduled Transactions)

- `timestamp: UFix64` (0 for immediate execution)
- `priority: UInt8` (0=High, 1=Medium, 2=Low)
- `executionEffort: UInt64` (minimum 10)
- `handlerStoragePath: StoragePath`
- `transactionData: AnyStruct?` (max 100 bytes)

### Transaction Skeleton (Scheduled Transactions)

- Prepare:
  - Convert priority number to `FlowTransactionScheduler.Priority` enum.
  - Validate timestamp (future or 0 for immediate).
  - Estimate fees with `FlowTransactionScheduler.estimate()`.
  - Withdraw fees from user's FlowToken vault.
- Issue handler capability: `Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>`.
- Execute:
  - Call `FlowTransactionScheduler.schedule()` with all parameters.
  - Optionally save `ScheduledTransaction` receipt for future reference/cancellation.
- Post:
  - Verify transaction scheduled successfully (check events or receipt ID).

### Prompt-to-Params Examples

- "Schedule transaction to execute in 1 hour with high priority" →

  - `timestamp = getCurrentBlock().timestamp + 3600.0`
  - `priority = 0` (High)
  - `executionEffort = 1000` (moderate effort)
  - `handlerStoragePath` from user specification
  - `transactionData = nil` unless user provides specific data.

- "Schedule recurring payments every day for a week" →
  - Multiple transaction transactions with `timestamp` incremented by 86400.0 (1 day)
  - `priority = 1` (Medium) for cost efficiency
  - `transactionData` containing payment details.

### Code Style

- Use named arguments.
- Prefer early returns and minimal nesting inside connector implementations (transactions use assertions instead).

### Sanity Checklist

- Imports present and string-based.
- Capability issuance and borrows succeed or `panic` with context.
- For scheduled transactions: fee estimation before scheduling, timestamp validation, handler capability verification.
- For recurring transactions: consider fee accumulation and batch scheduling efficiency.

### Development Guidelines

- Use string imports: `import "FlowTransactionScheduler"`, `import "FlowToken"`, `import "FungibleToken"`
- Emulator only; start with: `flow emulator`
- Estimate before schedule: `FlowTransactionScheduler.estimate(...)`
- Issue handler capability with correct entitlement: `auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}`
- Save `ScheduledTransaction` if you will need to cancel later; call `FlowTransactionScheduler.cancel(transaction: receipt)` to cancel

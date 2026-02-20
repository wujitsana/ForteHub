/**
 * Workflow Generation Prompt - Cadence Workflow Resource Generator
 *
 * Generates ONLY the Workflow resource using DeFiActions connectors.
 *
 * OFFICIAL REFERENCES (use these to resolve errors):
 * - Cadence Rules: https://github.com/onflow/cadence-rules
 * - DeFi Actions: /cadence/defi-actions/ folder in repo
 * - DeFi Actions GitHub: https://github.com/onflow/flow-actions-scaffold/tree/main/.cursor/rules/defi-actions
 * - Cadence Docs: https://cadence-lang.org/docs/
 */

import {
  detectTokensInDescription,
  generateTokenInfoForPrompt,
  getAllImportsForTokens,
  TOKEN_REGISTRY
} from './tokenRegistry';

export interface WorkflowPromptParams {
    strategy: string;
    description?: string; // Full user description of what they want
}

export function buildWorkflowPrompt(params: WorkflowPromptParams): string {
  const { strategy, description } = params;

  // Get network from environment
  const network = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_NETWORK || 'testnet')
    : 'testnet';

  // Detect tokens from user input (strategy field contains full workflow description)
  const userInput = strategy || description || '';
  const detectedTokens = detectTokensInDescription(userInput);
  const tokenInfoSection = generateTokenInfoForPrompt(detectedTokens, network);
  const requiredImports = getAllImportsForTokens(detectedTokens, network);

  return `Generate a Cadence contract with ONLY a Workflow resource inside.
- MUST: \`access(all) contract Name { resource Workflow { ... } }\`
- DO NOT: ForteHub, transactions, scripts

Strategy: ${strategy}
${description ? `Requirements: ${description}` : ''}

## WORKFLOW DEFINITION

A Workflow is a reusable DeFi strategy that:
- Encapsulates one strategy (yield, rebalancing, arbitrage, DCA, etc.)
- Deploys to user wallets and runs manually or on schedule
- Has a run() function with strategy logic
- Manages vaults and connectors
- User retains full custody

## CRITICAL - READ FIRST: CADENCE 1.0 SYNTAX RULES

**NO CUSTOM destroy() METHODS** - Cadence 1.0 auto-destroys resources.
- WRONG: \`fun destroy() { ... }\` (forbidden!)
- RIGHT: Let resources destroy automatically or create \`access(all) fun cleanup() { }\`

**ALL VARIABLES MUST BE INITIALIZED** - Every \`let\`/\`var\` needs = or <-:
- WRONG: \`let amount: UFix64\` (will not compile!)
- RIGHT: \`let amount: UFix64 = 0.0\`
- RIGHT: \`let vault <- source.withdraw()\`

**NO DEFAULT INIT ARGUMENTS** - Remove defaults from \`init()\` signatures:
- WRONG: \`init(target: UFix64 = 0.50) { ... }\`
- RIGHT: \`init(target: UFix64) { self.target = target }\`

**NO IF/ELSE AS EXPRESSIONS** - Use ternary operator for assignment:
- WRONG: \`let value: UFix64 = if x { a } else { b }\`
- RIGHT: \`let value: UFix64 = x ? a : b\`
- Use if/else only for control flow, not variable assignment

## NETWORK & TESTNET REQUIREMENTS

This workflow will be deployed to Flow Testnet (not emulator).

Available tokens are detected from your strategy description. Only use tokens listed in the "AVAILABLE TOKENS FOR THIS STRATEGY" section below. For complete token list, see: https://developers.flow.com/ecosystem/defi-liquidity/defi-contracts-testnet

## FUNCTION TEMPLATES - VARIABLE INITIALIZATION PATTERNS

Pattern 1 - Simple Values:
\`\`\`cadence
let amount: UFix64 = 0.0
var counter: UInt64 = 0
let available: UFix64 = source.minimumAvailable()
\`\`\`

Pattern 2 - Resources (use <-):
\`\`\`cadence
let vault <- source.withdrawAvailable(maxAmount: 100.0)
let newVault <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())
\`\`\`

Pattern 3 - Conditional (use ternary):
\`\`\`cadence
let finalAmount: UFix64 = available >= needed ? available : needed
let adjustedPercent: UFix64 = targetPercent > 1.0 ? 1.0 : targetPercent
\`\`\`

Pattern 4 - Optional Binding:
\`\`\`cadence
if let price = self.priceOracle.price(ofToken: Type<@FlowToken.Vault>()) {
  let adjusted: UFix64 = price * 1.1
}
\`\`\`

Pattern 5 - In run():
\`\`\`cadence
access(all) fun run() {
  let available: UFix64 = self.flowSource.minimumAvailable()
  let capacity: UFix64 = self.flowSink.minimumCapacity()
  if available > 0.0 {
    let vault <- self.flowSource.withdrawAvailable(maxAmount: capacity)
    self.flowSink.depositCapacity(from: &vault as auth(FungibleToken.Withdraw) &{FungibleToken.Vault})
    destroy vault
  }
}
\`\`\`

Pattern 6 - In init():
\`\`\`cadence
init(id: UInt64, flowSource: FungibleTokenConnectors.VaultSource, targetPercent: UFix64) {
  self.id = id
  self.flowSource = flowSource
  self.targetPercent = targetPercent
}
\`\`\`

## Naming Convention

CRITICAL: NO scheduling in workflow name.

**Workflow Names - TOKENS + STRATEGY ONLY**:
- NO: "Daily", "Weekly", "Hourly", "Every", "Recurring", "Automated", "60/40", "100 FLOW", "10%"
- YES: "FLOW Yield Optimizer", "FLOW USDC Rebalancer", "USDC DCA"
- Display: spaces for readability; Contract: PascalCase no spaces
- Put schedule/defaults in \`description\` and \`configFields\`, not name

## CODE GENERATION PROCESS

1. List variables with their initializers BEFORE writing code
2. Every \`let\`/\`var\` gets: \`let name: Type = value\` or \`let name <- resource\`
3. Before submitting: search for every \`let\`/\`var\` and verify = or <- exists
4. Common misses: conditionals (use ternary), prices (initialize), vault amounts (use minimumAvailable())

## Architecture & Factory Function Pattern

**Workflow Lifecycle:**
1. **Contract**: Your generated contract exports a Workflow resource
2. **Factory**: Contract has createWorkflow(workflowId: UInt64, config: {String: AnyStruct}, manager: &{ForteHub.WorkflowAcceptance}, ticket: @ForteHub.CloneTicket?) and MUST call manager.acceptWorkflow(workflowId: workflowId, workflow: <-workflow, ticket: <-ticket) to deposit it (nothing is returned). Ticket can be nil when the creator clones their own workflow.
3. **Deployment**: Stage 1 (DEPLOY_WORKFLOW_TRANSACTION) deploys the contract, sets up vaults, registers metadata, and optionally schedules. Stage 2 is a per-workflow factory transaction that imports your contract and calls createWorkflow(...) (with ticket: <-nil for creators) so the resource is stored in the Manager exactly like any future clone.
4. **Execution**: ForteHub calls resource.run() (manual or scheduled via scheduling control)
5. **Configuration**: User can update strategy parameters and enable/disable scheduling

**Why Factory Function?**
- Workflow resources cannot exist without being instantiated
- Deployment Stage 2 and every clone transaction need to create the instance and store it in ForteHub
- Standardized signature lets ForteHub supply config defaults + user overrides on-chain
- Required for both manual execution and scheduled workflows

**Resource Pattern Benefits:**
- State isolation (each workflow is independent)
- Lifecycle management (workflow can be deleted/destroyed)
- Configuration (strategy parameters like target percentages)
- Future composition (workflows can coordinate via stored resources)

**Important:**
- Workflow is a resource containing BUSINESS LOGIC ONLY
- ForteHub (separate contract) handles scheduling, storage, lifecycle
- All dependencies (connectors) are INJECTED via init() - DO NOT create them
- Workflow has NO awareness of when/if it runs - Manager handles this
- Workflow.run() is pure strategy execution, no timing logic
- `config` dictionary keys are Strings and values are AnyStruct. Cast each value to the concrete type you need (e.g. `let amount = (config["dcaAmount"] as? UFix64) ?? 1.0`). Never assume the key exists—fallback to safe defaults.

## OFFICIAL REFERENCES - READ THESE IF CODE FAILS TO COMPILE

**DO NOT GUESS**. When you get a compilation error, immediately check:
1. https://github.com/onflow/cadence-rules (OFFICIAL - start here)
2. https://github.com/onflow/flow-actions-scaffold (Official DeFi examples)
3. https://cadence-lang.org/docs/ (Language reference)

**MOST COMMON ERRORS - 90% of failures are one of these:**

| Error Message | Solution |
|---|---|
| "statements on the same line" with if/else | Use ternary: \`condition ? a : b\` not \`if { } else { }\` |
| "expected colon in dictionary" with if/else | Same: use ternary \`x ? y : z\` |
| "intersection type with invalid non-interface type" | Remove curly braces! Use \`Type<@FlowToken.Vault>()\` not \`Type<@{FlowToken.Vault}>()\` |
| "ambiguous intersection type" with {} | Curly braces ONLY for interfaces. For concrete types, no braces |
| "cannot assign to constant member" with field reassignment | Use \`var\` not \`let\` for fields that change: \`access(all) var field: Type\` |
| "mismatched types" with vault reference | Use proper casting: \`&vault as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}\` |
| "expected interface in intersection type" | Use \`@{InterfaceName}\` with curly braces (but only for interfaces!) |
| "cannot use X as type" | Check cadence-rules for interface restrictions |
| "missing access modifier" | All contract fields need \`access(all)\` or \`access(account)\` |
| "cannot apply unary -" | UFix64 is unsigned, use \`if/else\` statement (not ternary) for logic |
| "cannot assign to \`fieldName\`: field has \`all\` access" | Use \`access(self) var\` on the field, and use a setter function on the struct to modify it. |

## REQUIRED IMPORTS (use EXACTLY these, copy-paste)

\`\`\`cadence
${requiredImports}
\`\`\`

**CRITICAL**:
- Use EXACTLY these imports - do NOT add others or guess addresses
- Do NOT add FlowTransactionScheduler (ForteHub handles scheduling)
- Add optional imports only if needed:
  - DeFiActions (REQUIRED for rebalancing): \`import DeFiActions from 0x2ab6f469ee0dfbb6\`
  - Oracle: \`import BandOracleConnectors from 0x1a9f5d18d096cd7a\`
  - Swaps: \`import IncrementFiSwapConnectors from 0x49bae091e5ea16b5\`
  - Math: \`import DeFiActionsMathUtils from 0x2ab6f469ee0dfbb6\`

**REBALANCING STRATEGIES - READ THIS FIRST**:
If user description contains "rebalance" + target percentages (e.g., "60% FLOW, 40% USDC"):
1. MUST import DeFiActions (\`import DeFiActions from 0x2ab6f469ee0dfbb6\`)
2. MUST use AutoBalancer resource (part of DeFiActions)
3. MUST inject AutoBalancer via init() parameter
4. MUST call self.autoBalancer.rebalance(targetPercent: ...)
5. Do NOT use manual VaultSource/VaultSink withdraw/deposit loops
6. AutoBalancer handles oracle internally - do NOT import BandOracleConnectors

**CRITICAL TESTNET ADDRESSES - DO NOT DEVIATE**:
- FLOW: 0x7e60df042a9c0868
- USDCFlow: 0x64adf39cbc354fcb (NOT 0xdfc20aee650fcbdf - that is WRONG!)
- USDF: 0xb7ace0a920d2c37d
- FungibleTokenConnectors: 0x5a7b9cee9aaf4e4e
- **DeFiActions: 0x2ab6f469ee0dfbb6
- BandOracleConnectors: 0x1a9f5d18d096cd7a
- IncrementFiSwapConnectors: 0x49bae091e5ea16b5

${tokenInfoSection}

## CONTRACT STRUCTURE

**CRITICAL - Contract Must Have Full Declaration**:
The entire code MUST start with a contract declaration and end with closing brace.
The frontend MUST be able to find: \`access(all) contract ContractName {\`

Example template:
\`\`\`cadence
import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import USDCFlow from 0x64adf39cbc354fcb
import FungibleTokenConnectors from 0x5a7b9cee9aaf4e4e

access(all) contract FLOWUSDCRebalancer {
  // Struct for configuration
  access(all) struct WorkflowConfig { ... }

  // Main resource
  access(all) resource Workflow {
    // fields
    // init()
    // methods
  }
}
\`\`\`

**CRITICAL - Field Declaration Syntax**:
- Contract/Resource level fields: TYPE ONLY, NO = ASSIGNMENT
- WRONG: \`access(all) let fieldName: Type = value\` (SYNTAX ERROR!)
- RIGHT: \`access(all) let fieldName: Type\` (type annotation only)
- Then initialize in init(): \`self.fieldName = value\`

\`\`\`cadence
access(all) contract YourWorkflowName {
  access(all) resource Workflow {
    // REQUIRED FIELDS FOR ForteHub.IWorkflow INTERFACE - NO = assignment on field declaration!
    access(all) let id: UInt64
    access(all) let name: String
    access(all) let category: String

    // OPTIONAL: Strategy-specific config (percentages, thresholds)
    access(all) var flowTargetPercent: UFix64

    // init() function - initialization happens HERE
    init(
      id: UInt64,
      name: String,
      category: String,
      flowTargetPercent: UFix64
    ) {
      self.id = id
      self.name = name
      self.category = category
      self.flowTargetPercent = flowTargetPercent
    }

    // REQUIRED METHODS FOR ForteHub.IWorkflow INTERFACE
    access(all) fun run() {
      // Rebalancing logic: withdraw/deposit from user vaults based on flowTargetPercent
      // Use account.storage.borrow() to access vaults, then transfer tokens
    }

    // Strategy setters with access(account) control
    access(account) fun setFlowTargetPercent(val: UFix64) {
      pre { val > 0.0 && val < 1.0: "Target must be 0-100%" }
      self.flowTargetPercent = val
    }
  }

  // ============ CRITICAL REQUIREMENT ============
  // MUST IMPLEMENT: Factory function to create workflow instances
  // This function is called during deployment/cloning to instantiate the workflow from this contract
  // SIGNATURE MUST MATCH EXACTLY - takes (workflowId, config, manager acceptance ref, clone ticket)
  // CALLER: Clone transaction passes its ForteHub manager reference + clone ticket so this function
  // can immediately deposit the workflow via manager.acceptWorkflow(). DO NOT return the resource.
  access(all) fun createWorkflow(
    workflowId: UInt64,
    config: {String: AnyStruct},
    manager: &{ForteHub.WorkflowAcceptance},
    ticket: @ForteHub.CloneTicket?
  ) {
    let name = (config["name"] as? String) ?? "Rebalancer"
    let category = (config["category"] as? String) ?? "rebalancing"
    let flowTargetPercent = (config["flowTargetPercent"] as? UFix64) ?? 0.6

    let workflow <- create Workflow(
      id: workflowId,
      name: name,
      category: category,
      flowTargetPercent: flowTargetPercent
    )

    manager.acceptWorkflow(
      workflowId: workflowId,
      workflow: <-workflow,
      ticket: <-ticket
    )
  }
  // ===============================================
}
\`\`\`

## CONNECTOR RULES

**For Rebalancing** (most common):
- Import: \`import FungibleTokenConnectors from 0x5a7b9cee9aaf4e4e\` (testnet)
- \`FungibleTokenConnectors.VaultSource\`: \`withdrawAvailable(maxAmount: UFix64): @{FungibleToken.Vault}\`
- \`FungibleTokenConnectors.VaultSink\`: \`deposit(from: @{FungibleToken.Vault})\`

**Optional: Price Checks (if strategy needs oracle)**:
- Import: \`import BandOracleConnectors from 0x1a9f5d18d096cd7a\` (testnet only)
- Method: \`priceOracle.price(ofToken: Type): UFix64?\` - get token price

**Optional: Token Swaps (if converting FLOW↔USDC)**:
- Import: \`import IncrementFiSwapConnectors from 0x49bae091e5ea16b5\` (testnet only)
- Methods: \`quoteIn\`, \`quoteOut\`, \`swap\`, \`swapBack\`

Reference:
- Local: [\`/cadence/defi-actions/connectors.md\`]
- Official: [https://github.com/onflow/flow-actions-scaffold/tree/main/.cursor/rules/defi-actions/connectors.md](https://github.com/onflow/flow-actions-scaffold/tree/main/.cursor/rules/defi-actions/connectors.md)

## VARIABLE & FIELD RULES

**Field Declarations - CRITICAL LET vs VAR**:
- Use \`let\` for immutable fields (set once in init(), never change):
  - Example: \`access(all) let id: UInt64\` (set once, never changes)
- Use \`var\` for mutable fields (can be changed via setter functions or during run()):
  - Example: \`access(all) var flowTargetPercent: UFix64\` (updated by strategy setter)
- WRONG: \`access(all) let flowTargetPercent: UFix64\` then try to reassign in run() → COMPILE ERROR!
- RIGHT: \`access(all) var flowTargetPercent: UFix64\` (use var for anything that changes)

**Field declaration syntax**: Type annotation ONLY, NO = assignment:
- WRONG: \`access(all) var balance: UFix64 = 0.0\`
- RIGHT: \`access(all) var balance: UFix64\` then \`self.balance = 0.0\` in init()

**Local Variables**: MUST be initialized immediately when declared, ALWAYS use \`=\` for values/structs, \`<-\` for resources:
- WRONG: \`let amount: UFix64\` (missing initialization - WILL NOT COMPILE!)
- WRONG: \`var price: UFix64\` (no initializer!)
- RIGHT: \`let amount: UFix64 = 0.0\` (initialize all values)
- RIGHT: \`var price: UFix64 = 1.0\` (initialize all vars)
- RIGHT: \`let vault <- source.withdrawAvailable(...)\` (resources use <-)
- CRITICAL RULE: Every \`let\` and \`var\` statement MUST have = or <- immediately

## PRE/POST/ASSERT SYNTAX

**Structure**: \`pre { }\` at function start, then function body code, then \`post { }\` at end before closing brace.

**CRITICAL - Post blocks are ONLY for run() function (rare)**. Most functions DON'T have post blocks. Only init() might.

\`\`\`cadence
// Example with post (rare):
init(flowPercent: UFix64, usdcPercent: UFix64) {
  pre {
    flowPercent > 0.0: "Flow % must be positive"
    usdcPercent > 0.0: "USDC % must be positive"
  }

  self.flowPercent = flowPercent
  self.usdcPercent = usdcPercent

  post {
    self.flowPercent == flowPercent: "Flow % not saved"
    self.usdcPercent == usdcPercent: "USDC % not saved"
  }
}

// Most functions: NO pre/post, just assert inside
access(all) fun run() {
  // Check balances and execute strategy logic
  assert(result > 0.0, message: "Result must be positive")
}
\`\`\`

Key rules:
- pre { } ONLY at function start, before ANY code
- post { } ONLY at function end, AFTER ALL code, before closing }
- One condition per line: \`condition: "message"\`
- NO && or code inside pre/post blocks
- Most functions should have NO pre/post blocks at all

## 🚨 CRITICAL: SWAPPER PARAMETER ORDER 🚨

**IncrementFiSwapConnectors.Swapper.swap() signature**:
\`\`\`cadence
fun swap(quote: {DeFiActions.Quote}?, inVault: @{FungibleToken.Vault}): @{FungibleToken.Vault}
\`\`\`

**EXACT CORRECT CALL (parameter order MATTERS)**:
\`\`\`cadence
let outputVault <- self.swapper.swap(quote: nil, inVault: <-inputVault)
\`\`\`

**WRONG** (WILL NOT COMPILE):
- \`self.swapper.swap(inVault: <-vault, quote: nil)\` ❌ WRONG ORDER
- \`self.swapper.swap(<-vault, nil)\` ❌ POSITIONAL ARGS WRONG ORDER
- \`self.swapper.swap(inVault: &vault, quote: nil)\` ❌ WRONG: use \`<-\` not \`&\`

**RULE: \`quote\` parameter ALWAYS comes FIRST, then \`inVault\`**

## DeFi OPERATIONS PATTERN

**Transfer (no swap)**:
1. Check: \`let available = source.minimumAvailable(); let capacity = sink.minimumCapacity()\`
2. Withdraw: \`let tokens <- source.withdrawAvailable(maxAmount: capacity)\`
3. Deposit with proper casting: \`sink.depositCapacity(from: &tokens as auth(FungibleToken.Withdraw) &{FungibleToken.Vault})\`
   - CRITICAL: Reference (\`&\`) + cast + interface type (\`{...}\`)
4. Assert & destroy: \`assert(tokens.balance == 0.0, message: "Residual"); destroy tokens\`

**With swap**:
1. Withdraw: \`let inVault <- source.withdrawAvailable(...)\`
2. **Swap (PARAMETER ORDER CRITICAL)**: \`let outVault <- swapper.swap(quote: nil, inVault: <-inVault)\`
   - NOTE: \`quote\` parameter FIRST, \`inVault\` parameter SECOND
3. Deposit with proper casting: \`sink.depositCapacity(from: &outVault as auth(FungibleToken.Withdraw) &{FungibleToken.Vault})\`
4. Assert & destroy: \`assert(outVault.balance == 0.0, message: "Residual"); destroy outVault\`

CRITICAL VAULT CASTING RULES:
- Always use reference: \`&vault\` (not \`<-vault\` for references!)
- Always include auth: \`auth(FungibleToken.Withdraw)\`
- Always use interface type: \`&{FungibleToken.Vault}\` (curly braces for interface!)
- Full pattern: \`&vault as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}\`
- After moving vault with \`<-\`, cannot use it again!

## ORACLE USAGE

**If using AutoBalancer**: NO oracle import needed - AutoBalancer handles oracle internally (injected at deployment)

**If using manual logic** with price conditions (reaches X, drops below Y):
- Import: \`import BandOracleConnectors from 0x1a9f5d18d096cd7a\`
- Field: \`access(all) let priceOracle: BandOracleConnectors.PriceOracle\`
- Init param: \`priceOracle: BandOracleConnectors.PriceOracle\`
- Usage: \`if let price = self.priceOracle.price(ofToken: Type<@FlowToken.Vault>()) { ... }\`

**If NO price logic**: NO import, NO field, NO oracle code

## DEFIACTIONS INTEGRATION

**DeFiActions**: Flow SDK library with VaultSource (withdraw), VaultSink (deposit), AutoBalancer (drift rebalancing), Swapper (token exchange), PriceOracle (price queries), DeFiActionsUtils (vault creation).

**Use**: Always for resource management (VaultSource/VaultSink), AutoBalancer for drift rebalancing, PriceOracle for price checks, Swapper for swaps. Vault setup auto-handled by deployment.

**Vault Creation (auto-handled at deployment)**:
1. Detects tokens from imports; creates vaults using DeFiActionsUtils.getEmptyVault()
2. Stores at standard paths: \`\/storage\/flowTokenVault\`, \`\/storage\/usdcflowVault\`
3. Issues withdraw capabilities automatically

Do NOT create vaults in workflow code - handled by deployment transaction.

## CONNECTOR INJECTION PATTERN

**CRITICAL**: Connectors INJECTED via init() - ensures capabilities issued at deploy, stored securely.

**Pattern - Injected Connectors**:
\`\`\`cadence
access(all) resource Workflow {
  access(all) let flowSource: FungibleTokenConnectors.VaultSource
  access(all) let flowSink: FungibleTokenConnectors.VaultSink
  access(all) let usdcSource: FungibleTokenConnectors.VaultSource
  access(all) let usdcSink: FungibleTokenConnectors.VaultSink

  init(
    flowSource: FungibleTokenConnectors.VaultSource,
    flowSink: FungibleTokenConnectors.VaultSink,
    usdcSource: FungibleTokenConnectors.VaultSource,
    usdcSink: FungibleTokenConnectors.VaultSink
  ) {
    self.flowSource = flowSource
    self.flowSink = flowSink
    self.usdcSource = usdcSource
    self.usdcSink = usdcSink
  }

  access(all) fun run() {
    // Injected connectors already have capabilities
    let available = self.flowSource.minimumAvailable()
    if available > 0.0 {
      let vault <- self.flowSource.withdrawAvailable(maxAmount: available)
      self.usdcSink.deposit(from: <-vault)
    }
  }
}
\`\`\`

**Why injection?** Capabilities issued at deploy, pre-authorized, more secure, ForteHub handles passing

## AUTOBALANCER USAGE - REQUIRED FOR REBALANCING

**CRITICAL RULE**: If user mentions "rebalance" + percentages (e.g., "60% FLOW / 40% USDC"), MUST use AutoBalancer pattern. Do NOT use manual VaultSource/VaultSink for rebalancing.

**AutoBalancer**: Resource maintaining vault balance with configurable drift thresholds using injected oracle. AutoBalancer handles oracle internally - you INJECT it via init(), do NOT import BandOracleConnectors separately.

**When AutoBalancer is REQUIRED**:
- User says "rebalance" with target percentages
- User mentions drift thresholds or automatic rebalancing
- User wants portfolio allocation (X% token A, Y% token B)

**Important**: AutoBalancer rebalances EXISTING holdings (VaultSource/VaultSink). If strategy requires CONVERTING tokens (FLOW→USDC swap), add IncrementFiSwapConnectors. For simple rebalancing of existing allocations, no swaps needed.

**Pattern - AutoBalancer for Rebalancing**:
\`\`\`cadence
import DeFiActions from 0x2ab6f469ee0dfbb6

access(all) resource Workflow {
  access(all) let autoBalancer: @DeFiActions.AutoBalancer
  access(all) var flowTargetPercent: UFix64

  init(
    autoBalancer: @DeFiActions.AutoBalancer,
    flowTargetPercent: UFix64
  ) {
    self.autoBalancer <- autoBalancer
    self.flowTargetPercent = flowTargetPercent
  }

  access(all) fun run() {
    // AutoBalancer manages oracle and rebalancing internally
    self.autoBalancer.rebalance(force: true)
  }

  access(account) fun setFlowTargetPercent(newTarget: UFix64) {
    pre { newTarget > 0.0 && newTarget < 1.0: "Target % must be 0-100%" }
    self.flowTargetPercent = newTarget
  }
}
\`\`\`

**Note**:
- \`@DeFiActions.AutoBalancer\` - resource type needs \`@\` annotation
- \`<- autoBalancer\` - resource assignment uses \`<-\` not \`=\`
- \`.rebalance(force: true)\` - AutoBalancer method signature (not targetPercent)
- Oracle is INJECTED at deployment, NOT imported in workflow

## DEFIACTIONSMATHUTILS FOR CALCULATIONS

**Use for**: Safe arithmetic (percentages, scaling, slippage, fees, conversions)
**Skip for**: Simple math (add/subtract), comparisons, direct percentage (\`amount * 0.60\`)

**Pattern - Using DeFiActionsMathUtils**:
\`\`\`cadence
import DeFiActionsMathUtils from 0x2ab6f469ee0dfbb6

access(all) resource Workflow {
  access(all) fun run() {
    let simplePercent: UFix64 = totalAmount * 0.60
    let fee: UFix64 = DeFiActionsMathUtils.calculatePercent(amount: swapAmount, percent: 0.5)
    let adjustedAmount: UFix64 = swapAmount - fee
    let ratio: UFix64 = DeFiActionsMathUtils.divide(a: partialBalance, b: totalBalance)
  }
}
\`\`\`

**Import only if needed**: Complex math only. Simple rebalancing (multiply by percents) uses native UFix64.

## CONFIGURABLE FIELDS & STRATEGY PARAMETERS - WHERE DO THEY LIVE?

**Architecture**: Config fields are INSTANCE-level data stored in the Workflow resource itself:
- **In Workflow Resource**: Each deployed workflow instance has its own config field values (frozen at clone time)
- **In Registry Template**: Registry stores the SCHEMA (field definitions, defaults, min/max)
- **Instance Isolation**: When cloners copy a workflow, they get a snapshot of current defaults from Registry
- **Future Updates**: If creator updates defaults in Registry, future cloners get new values; existing clones keep their snapshot
- **Setter Functions**: Users can change instance config via \`access(account) fun setParameterName()\` methods

**Pattern**:
\`\`\`cadence
resource Workflow {
  access(all) var flowTargetPercent: UFix64  // Instance config (can change)

  init(flowTargetPercent: UFix64) {
    self.flowTargetPercent = flowTargetPercent  // Initialize with value passed at clone time
  }

  access(account) fun setFlowTargetPercent(val: UFix64) {
    self.flowTargetPercent = val  // User can update this
  }
}
\`\`\`

**What Goes in configFields**:
Based on user requirements, include ONLY fields that users should be able to change after deployment:
- Thresholds (e.g., trigger points: "5% drift", "minimum 10 FLOW")
- Allocations or percentages (e.g., rebalance targets: "60% FLOW")
- Timing parameters (e.g., wait times: "1 hour cooldown")
- Limits (e.g., maximum amounts: "maximum 100 FLOW per transaction")
- Token amounts or rates (e.g., "100 FLOW per purchase")

**Default Values MUST be Explicit**:
- Every configurable field MUST have a \`"default"\` value in the JSON
- Default value should match what you describe in the strategy/description
- Example: If description says "rebalance at 60% FLOW", configField should have \`"default": "0.60"\`
- Example: If description says "100 FLOW weekly", configField should have \`"default": "100.0"\`
- These defaults are shown to users and are what the contract initializes with

**Optional: Use a Config Struct for Configurable Values**:
If the strategy has 2+ configurable parameters, use a config struct (Cadence 1.0 Compliant):

\`\`\`cadence
struct WorkflowConfig {
  // Fields are PRIVATE (access(self)) - can only be modified via setter methods
  access(self) var configParameter1: UFix64
  access(self) var configParameter2: UFix64

  // init() goes in the struct - NO DEFAULT ARGUMENTS
  init(param1: UFix64, param2: UFix64) {
    self.configParameter1 = param1
    self.configParameter2 = param2
  }

  // Public Getters (read-only, can be called from Workflow.run())
  access(all) view fun getConfigParameter1(): UFix64 { return self.configParameter1 }
  access(all) view fun getConfigParameter2(): UFix64 { return self.configParameter2 }

  // SETTERS INSIDE STRUCT (for modifying its own access(self) fields)
  access(all) fun setConfigParameter1(val: UFix64) {
    pre { val > 0.0: "Parameter must be positive" }
    self.configParameter1 = val
  }

  access(all) fun setConfigParameter2(val: UFix64) {
    pre { val > 0.0: "Parameter must be positive" }
    self.configParameter2 = val
  }
}

resource Workflow {
  access(all) let config: WorkflowConfig

  init(config: WorkflowConfig) {
    self.config = config
  }

  access(all) fun run() {
    let param1 = self.config.getConfigParameter1()
    // ... use config values
  }

  // WRAPPER SETTERS ON AGENT RESOURCE (optional - for access(account) control)
  // These provide access control layer around struct's setters
  access(account) fun setConfigParameter1(val: UFix64) {
    pre { val > 0.0: "Parameter must be positive" }
    self.config.setConfigParameter1(val: val)
  }
}
\`\`\`

**Struct/Resource Pattern Summary**:
- **Struct contains**: fields (\`access(self) var\`), init(), getters (\`access(all) view\`), setters (\`access(all) fun\`)
- **Resource contains**: config field (\`let\`), init(), run(), and optional wrapper setters (\`access(account) fun\`)
- **Setters in struct** modify the struct's own fields
- **Wrapper setters in resource** (optional) call the struct's setters with access control
- WRONG: \`self.config.parameter = val\` (violates access(self)!)
- RIGHT: \`self.config.setParameter(val: val)\` (call the struct's setter method)

## TOKEN & CONNECTOR INFORMATION

**CRITICAL - Use ONLY the tokens provided above**:
- The tokens listed in "AVAILABLE TOKENS FOR THIS STRATEGY" are the ONLY tokens you should use
- Use the exact import path provided
- Use the exact vault type provided
- DO NOT invent or guess token addresses
- DO NOT use FungibleToken.Vault as a substitute for specific token types
- DO NOT hardcode hex addresses

**For Vault Creation**:
- FLOW: \`FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())\`
- USDC: \`USDC.createEmptyVault(vaultType: Type<@USDC.Vault>())\` (if USDC is available)
- Other tokens: Use \`TokenName.createEmptyVault(vaultType: Type<@TokenName.Vault>())\`

**If a token is not in the available list**:
- DO NOT use it, even if mentioned in the strategy description
- Use only the tokens listed above

## TYPE SYSTEM & SYNTAX RULES

- **Curly braces {} are ONLY for interfaces, NEVER for concrete types**:
  - WRONG: \`Type<@{FlowToken.Vault}>()\` (FlowToken.Vault is concrete, not interface!)
  - RIGHT: \`Type<@FlowToken.Vault>()\` (no braces for concrete types)
  - RIGHT: \`Type<@{FungibleToken.Vault}>()\` (FungibleToken.Vault IS an interface, use braces)
  - RULE: Curly braces {} ONLY when Type is an interface (has "interface" in docs)

- **Vault references need proper auth and casting**:
  - WRONG: \`depositCapacity(from: <-vault)\`
  - RIGHT: \`depositCapacity(from: &vault as auth(FungibleToken.Withdraw) &{FungibleToken.Vault})\`
  - Pattern: \`&vault as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}\`

- **UFix64 Subtraction**: Check before subtracting: \`a >= b ? a - b : 0.0\` (cannot be negative)
- **Type Conversion**: Explicit conversion needed: \`UFix64(u64) / ufix\` not \`u64 / ufix\`
- **Optional Binding**: Use \`if let\` (NOT \`guard let\` - Swift syntax, not Cadence)
- **Ternary Operator - CRITICAL**: Use \`condition ? valueIfTrue : valueIfFalse\` for assignments
  - WRONG: \`let x: UFix64 = if condition { a } else { b }\` (if/else blocks cannot be expressions)
  - RIGHT: \`let x: UFix64 = condition ? a : b\` (use ternary operator)
  - For complex logic: use if statement with separate assignments

## CRITICAL ANTI-PATTERNS

- **SWAPPER PARAMETER ORDER** - MOST COMMON ERROR:
  - WRONG: \`swapper.swap(inVault: <-vault, quote: nil)\` ❌ WILL NOT COMPILE - wrong parameter order!
  - RIGHT: \`swapper.swap(quote: nil, inVault: <-vault)\` ✅ quote FIRST, inVault SECOND
  - The \`quote\` parameter MUST come before \`inVault\` - order matters!
- **REBALANCING**: If user says "rebalance X% A, Y% B", MUST use AutoBalancer (import DeFiActions). WRONG: manual VaultSource/VaultSink loops. RIGHT: self.autoBalancer.rebalance(targetPercent: ...)
- NO custom \`destroy()\` methods - Cadence 1.0 will not compile!
  - WRONG: \`fun destroy() { ... }\`
  - RIGHT: Resources destroy automatically, or use \`access(all) fun cleanup() { }\`
- NO inventing import addresses - Use EXACTLY the "REQUIRED IMPORTS" section
  - WRONG: \`import USDC from 0xf1ab99c82dee3526\`
  - RIGHT: Only use imports provided or add BandOracleConnectors/IncrementFiSwapConnectors if needed
- NO uninitialized variables - Every \`let\`/\`var\` MUST have = or <-
  - WRONG: \`let amount: UFix64\` (will not compile!)
  - WRONG: \`let usdcPrice: UFix64\` (error happened before - prevent it!)
  - RIGHT: \`let amount: UFix64 = 0.0\` or \`let vault <- source.withdraw()\`
- NO = in field declarations (WRONG: \`let field: Type = value\`; RIGHT: init in \`init()\`)
- NO \`executionFrequencySeconds\`, \`lastExecutionTime\`, or FlowTransactionScheduler imports (Manager handles)
- NO \`.abs()\` on UFix64 → use \`a > b ? a - b : b - a\`
- NO \`0..<\` range loops → use \`while i < count { ... i = i + 1 }\`
- NO \`.indexOf()\` on strings → use \`.contains()\` or \`.split()\`
- NO uninitialized variables (all \`let\`/\`var\` must have = or <-)
- NO invented connector methods (ONLY: \`minimumAvailable()\`, \`withdrawAvailable()\`, \`minimumCapacity()\`, \`depositCapacity()\`, \`price()\`)
- NO invented Swapper methods (ONLY: \`quoteIn()\`, \`quoteOut()\`, \`swap()\`, \`swapBack()\`)
- NO force-unwrap caps → use \`if let borrowed = cap.borrow() { ... }\`
- NO mixing \`<\` and \`&\` as \`<&\` (wrong: \`from: <&vault\`; right: \`from: &vault\`)
- NO hardcoded token types with hex addresses in Type expressions (pass as params instead)
- NO using vault after moving it with \`<-\` (once moved, resource is consumed)
- NO pre/post conditions without error messages or with mixed formats
- NO assert with colon syntax (wrong: \`assert(x):\`; right: \`assert(x, message: "...")\`)
- NO post blocks in wrong place (wrong: code first, then post; right: pre, code, post)
  - WRONG: \`init() { self.x = 0; post { ... } }\`
  - RIGHT: \`init() { pre { ... } self.x = 0; post { ... } }\`
- NO incomplete strategy parameters (wrong: missing critical tokens when strategy mentions them)
  - WRONG: init(flowSource, flowSink) for "FLOW/USDC rebalancer" (missing USDC sources/sinks!)
  - RIGHT: init(flowSource, flowSink, usdcSource, usdcSink) - ALL required tokens included
  - BEST: Use config struct with ALL configurable parameters
- NO missing tokens/variables mentioned in strategy (wrong: strategy says "handle FLOW and USDC" but only FLOW is configured)
  - WRONG: Missing vault connectors for tokens mentioned in the strategy
  - RIGHT: Include connectors for every token mentioned in the description
  - BEST: Use config struct forced to declare all needed parameters upfront
- NO using \`let\` for fields that need to be reassigned or updated
  - WRONG: \`access(all) let flowTargetPercent: UFix64\` then reassign in setter/run()
  - RIGHT: \`access(all) var flowTargetPercent: UFix64\` (use var for anything that changes)
- NO top-level \`let\` declarations outside contract (all code must be inside contract or resource)
  - WRONG: \`let USDCVaultType = Type<@FungibleToken.Vault>()\` at contract level
  - RIGHT: Declare inside resource: \`access(all) let usdcVaultType: Type\` then init in init()
- NO stripping the contract wrapper (the entire code MUST be wrapped in \`access(all) contract YourName { ... }\`)
  - WRONG: Returning just the resource code without the contract declaration
  - WRONG: Returning imports + resource but missing \`access(all) contract YourName { }\` wrapper
  - RIGHT: ALWAYS wrap resource in a contract: \`access(all) contract FLOWUSDCRebalancer { resource Workflow { ... } }\`
- NO init() in wrong places
  - WRONG: Struct with no init(), init() only in resource
  - RIGHT: Struct has init() to initialize its fields, resource has init() to initialize itself
  - Pattern: \`struct WorkflowConfig { init(...) { ... } }\` then \`resource Workflow { init(config: WorkflowConfig) { ... } }\`
- NO curly braces on concrete types (only use curly braces for INTERFACES)
  - WRONG: \`Type<@{FlowToken.Vault}>()\` (FlowToken.Vault is concrete!)
  - RIGHT: \`Type<@FlowToken.Vault>()\` (no braces)
  - RIGHT: \`Type<@{FungibleToken.Vault}>()\` (FungibleToken.Vault IS an interface)
  - RULE: Check if it's an interface in docs. If yes, use {}. If no, don't.
- NO missing access modifiers on contract-level declarations (all need access(all), access(account), etc.)
  - WRONG: \`let fieldName: Type\` (no access modifier)
  - RIGHT: \`access(all) let fieldName: Type\`
- NO unary negation on unsigned types (UFix64 cannot be negative)
  - WRONG: \`let value = (-flowAmount)\` when flowAmount is UFix64
  - RIGHT: Use conditional: \`if flowAmount > 0.0 { ... }\`
- NO relying on type inference for complex expressions
  - WRONG: \`let result = a < b ? a : b\` (implicit type)
  - RIGHT: \`let result: UFix64 = a < b ? a : b\` (explicit type annotation)
- NO using if/else blocks as expressions on assignment RHS (Cadence doesn't support this)
  - WRONG: \`let value: UFix64 = if condition { a } else { b }\`
  - RIGHT: \`let value: UFix64 = condition ? a : b\` (use ternary operator)
  - For complex logic: use if statement with separate assignments

## GAS EFFICIENCY

- Avoid expensive: string parsing (.split()), log() with concatenation
- Minimize loop operations: use accumulative logic (sum changes, apply once) not step-by-step
- Remove log() statements from production code

## SECURITY & QUALITY

- Principle of least privilege: only authorize what you need
- Defensive checks: always use \`if let\` for optionals, never force-unwrap \`!\`
- Comments: briefly explain strategy logic and complex calculations
- Idempotent: design so run() is safe to call multiple times

## SCHEDULING METADATA (JSON response ONLY, NOT in Workflow code)

Set JSON fields:
- \`isSchedulable\`: true/false (based on keywords: "daily", "weekly", "monthly", "hourly", "recurring", "autonomous")
- \`defaultFrequency\`: (in seconds, ONLY if isSchedulable=true) e.g. "86400.0" for daily
- \`configFields\`: (OPTIONAL) array of strategy parameters with default values EMBEDDED in each field

## OPTIONAL: WORKFLOW COMPOSITION (v2 - Future Enhancement)

**For now, workflows are independent. This section is optional and for future v2 orchestrator support.**

If your workflow could be combined with others (e.g., output from one feeds input to another):
- Define \`inputCapabilities\`: what your workflow expects to receive
  - Example: \`{ "tokenType": "FlowToken.Vault", "minAmount": "10.0" }\`
- Define \`outputCapabilities\`: what your workflow produces
  - Example: \`{ "tokenType": "FlowToken.Vault", "produces": "rebalanced_balance" }\`
- Define \`requiredTokens\`: tokens this workflow needs
  - Example: \`["FLOW", "USDC"]\`

**IMPORTANT**: This is metadata describing what your workflow needs/provides - NOT code to add.

Currently: just pass empty capabilities dict to registry. In v2, this metadata will enable:
- Workflow chaining (output of one workflow → input of another)
- Automated discovery of compatible workflows
- UI-driven workflow composition without code generation

For MVP: focus on the strategy logic. Composition infrastructure is ready when you need it.

## FEASIBILITY ASSESSMENT - CRITICAL

**BEFORE you generate code, ASSESS whether the workflow is feasible:**

A workflow is **INFEASIBLE** if:
1. **Required tokens are NOT available on Flow Testnet**
   - Example: User requests "Polygon USDC rebalancer" but USDC only exists on Ethereum
   - Example: User requests "Bitcoin swap" but BTC is not available on Flow
   - Solution: Check if ALL tokens mentioned are in AVAILABLE TOKENS FOR THIS STRATEGY section
   - If tokens don't exist: Return infeasibility response with explanation

2. **The strategy logic CANNOT be implemented with available connectors**
   - Example: "Lend on Aave" but only have VaultSource/VaultSink available (no lending protocols)
   - Example: "Earn 20% APY" but Flow protocols don't offer that yield
   - Solution: Only use available connectors: VaultSource, VaultSink, Swapper, AutoBalancer, PriceOracle
   - If logic cannot be implemented: Return infeasibility response with explanation

3. **The strategy is fundamentally impossible**
   - Example: "Print money" or "guaranteed 50% returns"
   - Example: "Trade on a closed exchange"
   - Solution: Return infeasibility response explaining why

4. **Ambiguous or missing critical parameters**
   - Example: "Rebalance FLOW and USDC" - missing target percentages entirely
   - Example: "Swap tokens" - missing which tokens to swap between
   - Solution: Return infeasibility response asking for clarification

**If workflow is FEASIBLE**: Generate full code and return SUCCESS response (format below)

**If workflow is INFEASIBLE**: Return INFEASIBILITY response (explain why, suggest alternatives)

## RESPONSE FORMAT (VALID JSON ONLY)

\`\`\`json
{
  "workflowName": "Descriptive Workflow Name",
  "category": "Your chosen category (e.g., rebalancing, yield-farming, dca, arbitrage, custom)",
  "description": "What the workflow does with tokens involved and default/example parameters. Example: 'Rebalances between FLOW and USDC, targeting 60% FLOW / 40% USDC allocation, with 5% threshold before rebalancing'",
  "isSchedulable": true,
  "defaultFrequency": "86400.0",
  "configFields": [
    {
      "name": "fieldName",
      "fieldType": "UFix64",
      "label": "Human readable label",
      "description": "What this parameter does",
      "default": "1.0",
      "min": "0.0",
      "max": "100.0"
    }
  ],
  "contractCode": "import FungibleToken from 0xee82856bf20e2aa6\\n... full Cadence code here ..."
}
\`\`\`

**Key Points**:
- \`workflowName\`: Display name with spaces - Tokens + strategy ONLY (e.g., "FLOW USDC Rebalancer", NOT "Daily 60/40 Rebalancer")
- Contract declaration in code: Match \`workflowName\` but remove spaces, use PascalCase (e.g., \`access(all) contract FLOWUSDCRebalancer { ... }\`)
- \`description\`: Include defaults and what's updateable (e.g., "Default: 60% FLOW (updateable), 5% threshold (updateable)")
- \`configFields\`: Each updateable parameter with default value (e.g., \`{"name": "flowPercent", "default": "0.60"}\`)
- \`isSchedulable\`: true/false
- \`defaultFrequency\`: only if isSchedulable=true (in seconds)

### INFEASIBILITY RESPONSE (if workflow is not possible)

If the workflow is **not feasible**, return this format instead:

\`\`\`json
{
  "feasible": false,
  "reason": "Why the workflow cannot be implemented",
  "details": "Specific explanation of the issue",
  "suggestion": "Alternative approach or clarification needed",
  "suggestedDescription": "A modified version of the user's request that IS feasible and uses only available tokens/connectors. This should be a complete, executable strategy description that the user can use to regenerate."
}
\`\`\`

Example:
\`\`\`json
{
  "feasible": false,
  "reason": "Required token not available on Flow Testnet",
  "details": "USDT is available on Flow mainnet, but the strategy requires it on testnet where it's not deployed yet",
  "suggestion": "Use fuUSDT (wrapped USDT) instead, or rebalance between FLOW and USDCFlow which are both available.",
  "suggestedDescription": "Rebalance between FLOW and USDCFlow, targeting 60% FLOW and 40% USDCFlow, with a 5% drift threshold before triggering rebalancing. Can be scheduled daily."
}
\`\`\`

**CRITICAL**: Always provide \`suggestedDescription\` in infeasibility responses. This allows the user to click a button and regenerate using your suggestion, turning an infeasible request into a feasible workflow.

## CRITICAL FINAL INSTRUCTION FOR \`contractCode\`

The value of the \`contractCode\` key MUST be a complete, valid Cadence contract as a string:
- MUST start with: \`import FungibleToken from ...\`
- MUST end with: closing brace of contract \`}\`
- MUST include full contract declaration: \`access(all) contract ContractName { resource Workflow { ... } }\`
- DO NOT strip opening/closing braces
- Example: \`"import FungibleToken...\\n\\naccess(all) contract FLOWUSDCRebalancer { ... resource Workflow { ... } }"\`

## PRE-SUBMISSION CHECK: VARIABLE INITIALIZATION

Search every \`let\`/\`var\` line and verify = or <- exists:
- \`let amount: UFix64\` → BROKEN, fix: \`let amount: UFix64 = 0.0\`
- \`let vault: @{FungibleToken.Vault}\` → BROKEN, fix: \`let vault <- source.withdraw()\`

ERROR YOU GET: \`error: missing transfer operator ... variable declarations must specify how to transfer the value; use \`=\` for copy (struct), \`<-\` for move (resource)\`

This error happened with \`let usdcPrice: UFix64\` before - prevent it by verifying all variables are initialized.

## FINAL CHECKLIST

**Naming**:
- Workflow name: tokens + strategy only (no schedule/percentages/amounts)
- Description: include defaults marked as (updateable)
- configFields: list all updateable parameters

**Variables & Fields**:
- ALL local variables initialized (= or <-) - every let/var MUST have initializer
- NO = in field declarations (initialize only in init())
- NO direct assignment to access(self) fields (use setter methods)
- NO default arguments in init() signatures
- Immutable fields: use \`let\` (id, name, category)
- Mutable fields: use \`var\` (percentages, thresholds, configuration values)
- Use config struct for configurable values
- All mentioned tokens included (imports match description)

**Contract Structure**:
- Include contract declaration: \`access(all) contract ContractName { ... }\`
- Contract MUST contain Workflow resource
- Struct definitions go INSIDE contract, BEFORE resource
- Struct has init(), resource has init()

**Types & Syntax**:
- Curly braces {} ONLY for interfaces, NOT concrete types
- Vault Type: \`Type<@FlowToken.Vault>()\` (no braces) vs \`Type<@{FungibleToken.Vault}>()\` (with braces)
- Vault references: \`&vault as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}\`
- UFix64 subtraction: check \`a >= b\` first
- Ternary for conditionals: \`x ? a : b\` NOT \`if { } else { }\`
- NO \`0..<\` loops (use while)
- NO \`.indexOf()\` (use .contains())

**Resources & DeFi**:
- NO custom destroy() methods
- Only destroy local owned resources
- **CRITICAL: NEVER destroy fields** (\`destroy self.fieldName\` FORBIDDEN - will not compile!)
  - WRONG: \`destroy self.vault\`
  - WRONG: \`destroy self.token\`
  - RIGHT: \`let vault <- self.vault; destroy vault\`
  - RIGHT: Let resources destroy automatically when function ends
- Check availability & capacity before operations
- Assert balance == 0.0 before destroy (local only)
- Use only: minimumAvailable, withdrawAvailable, minimumCapacity, depositCapacity
- **Swapper.swap() parameter order CRITICAL**: \`swap(quote: nil, inVault: <-vault)\` NOT \`swap(inVault: <-vault, quote: nil)\`
- Swapper only: quoteIn, quoteOut, swap, swapBack

**Scheduler & Manager**:
- NO scheduler fields or imports (ForteHub handles it)
- All fields initialized in init()

**Conditions & Oracles**:
- Pre/post order: pre { } → code → post { }
- One condition per line with message
- Oracle (if used): BandOracleConnectors imported, field exists

**Quality**:
- Use \`if let\` (not \`guard let\`) for optionals
- No force-unwrap \`!\`
- No \`log()\` in production
- isSchedulable: true if daily/weekly/hourly/recurring/autonomous keywords
- Valid JSON

RETURN ONLY the JSON object. No markdown, no explanations.`;
}

export function getExamplePrompt(exampleType: string): string {
  switch (exampleType) {
    case 'yield':
      return buildWorkflowPrompt({
        strategy: 'FLOW Yield Optimizer',
        description: 'Moves FLOW to best-yielding pool. Default: 100 FLOW (updateable).',
      });
    case 'dca':
      return buildWorkflowPrompt({
        strategy: 'FLOW USDC DCA',
        description: 'Dollar-cost averages FLOW with USDC. Default: 100 FLOW per txn (updateable).',
      });
    case 'rebalancing':
      return buildWorkflowPrompt({
        strategy: 'FLOW-USDC Rebalancer',
        description: 'Rebalances to target allocation. Default: 60% FLOW / 40% USDC (updateable), 5% drift threshold (updateable).',
      });
    case 'arbitrage':
      return buildWorkflowPrompt({
        strategy: 'FLOW-USDC Arbitrage',
        description: 'Executes arbitrage on FLOW-USDC. Default: 1% profit threshold (updateable).',
      });
    default:
      return buildWorkflowPrompt({
        strategy: 'Custom DeFi Workflow',
        description: 'Create a custom workflow. Specify tokens and strategy (e.g., "FLOW-USDC rebalancer targeting 60-40").',
      });
  }
}

export const PROMPT_TIPS = [
  'Name: tokens + strategy (no schedule/percentages/amounts)',
  'Description: defaults marked (updateable)',
  'List parameters users can adjust',
];

export const COMMON_PITFALLS = [
  'NEVER include schedule in name: "Daily Rebalancer", "Weekly DCA", "Hourly Arbitrage"',
  'Good names: "FLOW USDC Rebalancer", "FLOW USDC DCA", "FLOW Arbitrage"',
  'Put schedule in description or isSchedulable/defaultFrequency',
];

/**
 * Get the import statements needed for a strategy
 * Detects tokens from the description and generates appropriate imports
 */
export function getImportsForStrategy(description: string, network: string = 'testnet'): string {
  const detectedTokens = detectTokensInDescription(description);
  return getAllImportsForTokens(detectedTokens, network);
}

/**
 * Get detected tokens for a strategy description
 * Useful for validating that all required tokens are available
 */
export function getDetectedTokens(description: string) {
  return detectTokensInDescription(description);
}

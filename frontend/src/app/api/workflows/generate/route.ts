import { NextResponse, NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { validateWorkflowCode } from "@/lib/validateWorkflow";
import {
  detectTokensInDescription,
  generateTokenInfoForPrompt,
  getAllImportsForTokens,
  generateCoreContractReference,
} from "@/lib/tokenRegistry";
const MAX_CONTEXT_CHARS = 120_000;
const MAX_GENERATION_ATTEMPTS = 1;
let systemPromptLogged = false;
const MAX_FILE_SIZE = 60 * 1024;
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".cdc",
  ".md",
]);

const CONNECTOR_IMPORTS: Record<string, string[]> = {
  testnet: [
    "import DeFiActions from 0x2ab6f469ee0dfbb6",
    "import FungibleTokenConnectors from 0x5a7b9cee9aaf4e4e",
    "import IncrementFiSwapConnectors from 0x49bae091e5ea16b5",
  ],
  mainnet: [
    "import DeFiActions from 0x92195d814edf9cb0",
    "import FungibleTokenConnectors from 0x1d9a619393e9fb53",
    "import IncrementFiSwapConnectors from 0xefa9bd7d1b17f1ed",
  ],
};

type ScheduleHint = {
  mode: "auto" | "manual";
  keyword?: string;
};

const SYSTEM_PROMPT = `You are Cadence AI, building ForteHub workflows. Respond with EXACT JSON using the schema below. Do not include any extra commentary.

Before writing code:
- Review the "Detected Tokens", "Cadence Reference", and "DeFi Actions Reference" sections provided in the most recent user message.
- Use the official connectors and patterns described there - never invent custom interfaces or placeholders.
- If you cannot produce a Cadence 1.0 workflow that safely uses DeFiActions connectors, respond with feasible=false and provide a suggested strategy instead of emitting incomplete code.

After writing code:
- Double-check your contract conforms to those references (imports, connector usage, init/run patterns) and remove any placeholder comments.

SUCCESS RESPONSE:
{
  "workflowName": "Descriptive Workflow Name",
  "category": "rebalancing | yield | dca | liquidity | risk-management | automation | custom",
  "description": "Explain the strategy, assets involved, defaults, and user-adjustable parameters.",
  "isSchedulable": true,
  "defaultFrequency": "86400.0",
  "configFields": [
    {
      "name": "fieldName",
      "fieldType": "UFix64",
      "label": "Human readable label",
      "description": "What this parameter controls",
      "default": "1.0",
      "min": "0.0",
      "max": "100.0"
    }
  ],
  "metadata": {
    "assets": [
      { "symbol": "FLOW", "address": "0x...", "notes": { "liquidity": "High" } }
    ],
    "configFields": [
      {
        "name": "fieldName",
        "fieldType": "UFix64",
        "label": "Human readable label",
        "description": "Details for documentation",
        "min": "0.0",
        "max": "100.0",
        "rules": ["Must be positive"]
      }
    ],
    "defaultParameters": {
      "fieldName": "1.0"
    },
    "notes": {
      "feasibilityStatus": "feasible | risky | not_feasible",
      "feasibilityReasoning": "Support the status with Cadence/Flow specifics.",
      "suggestions": "Recommended improvements, monitoring, or guardrails."
    },
    "isSchedulable": true,
    "defaultFrequency": "86400.0"
  },
  "contractCode": "Full Cadence 1.0 contract...",
  "summary": "Paragraph summarizing contract behavior",
  "warnings": ["List warnings or leave empty"],
  "feasible": true
}

INFEASIBLE RESPONSE (when the strategy cannot be executed safely):
{
  "feasible": false,
  "reason": "Short explanation of why the original request is infeasible.",
  "details": "Additional context or missing requirements.",
  "suggestion": "Guidance for the user (e.g., request different tokens or connectors).",
  "suggestedDescription": "Complete, feasible strategy description the user can retry with.",
  "strategy": "Duplicate of suggestedDescription so the client can auto-fill the field.",
  "warnings": ["Optional list of issues or follow-up items"]
}

RULES:
- Always respect ForteHub naming: no schedule words inside workflowName; contract name must be PascalCase version without spaces.
- Draw Cadence syntax from the provided context files only. Imports, connectors, and patterns must match the existing codebase.
- Populate configFields/defaultParameters only for parameters surfaced in the contract code.
- metadata.notes.feasibilityStatus must align with the top-level "feasible" flag (e.g., "not_feasible" when feasible=false).
- When feasible=false, DO NOT include contractCode. Provide suggestedDescription/strategy that is implementable with available connectors and tokens so the user can regenerate immediately.
- When feasible=true, contractCode must be a complete Cadence 1.0 contract string (imports, contract declaration, resource, events, etc.).
- Imports must use addresses from the provided references. Never invent placeholder addresses such as 0x01 or 0x02.
- Write imports in the form 'import ModuleName from 0xAddress' (never bare string imports).
- Always include the top-level "feasible" boolean (true for successful workflows, false when returning an infeasible response).
- Wrap all Cadence logic inside a single access(all) contract definition; do not return standalone transaction scripts.
- Do NOT subclass or conform the contract declaration to other types (e.g. no "access(all) contract X: DeFiActions.Workflow"). Declare a standalone contract and provide resources/functions inside it.
- Confirm that the scheduling metadata (isSchedulable + defaultFrequency) matches the user's cadence. If you disable scheduling despite cadence keywords, explain why in metadata.notes.feasibilityReasoning.
- Do not embed Cadence transaction blocks (for example, transaction { ... }) in the workflow contract. Expose resources and helper functions that the ForteHub manager can invoke instead.
- Output strictly valid JSON.`;

const DEFI_ACTIONS_CHECKLIST = `## DeFi Actions Implementation Checklist
- Use DeFiActions.VaultSource / VaultSink and related connectors to move funds; never invent custom resources.
- Tie related operations together with DeFiActions.createUniqueIdentifier() (or equivalent helpers) so withdrawals, swaps, and deposits share the same ID.
- When swapping, use the injected IncrementFiSwapConnectors.Swapper (or other {DeFiActions.Swapper}) and call swapper.swap(quote: quote, inVault: <-vault) - quote parameter first, vault second.
- Import every contract from the exact addresses in the context; never use placeholder addresses like 0x01 or 0x02.
- Remove TODOs, placeholder comments, and ensure assertions or post conditions validate successful execution.
- Expose an access(all) resource (for example, Workflow) with methods like run() or execute() that orchestrate VaultSource withdrawals, call swapper.swap(quote: ..., inVault: ...), then deposit via VaultSink using the injected connectors. Do not return standalone transaction scripts.
- Avoid using transaction templates; instead, implement resource-based workflows that ForteHub Manager can borrow and execute.
- If DeFiActions connectors are not applicable and no safe alternative exists, respond infeasible rather than bypassing these primitives.`;

const RESPONSE_CHECKLIST = `## Response Checklist
- Always include workflowName, category, description, contractCode, metadata, summary, warnings, and feasible.
- Populate every top-level field from the schema (workflowName, category, description, contractCode, metadata, summary, warnings, feasible).
- metadata must include configFields[], defaultParameters{}, notes{}, assets[], and the scheduling flags (isSchedulable, defaultFrequency) that match the top-level fields.
- contractCode must begin with access(all) contract ... { ... }. Do not return standalone transaction scripts.
- When the request implies automation, set metadata.isSchedulable=true and metadata.defaultFrequency (string seconds). If you have strong evidence it should remain manual, explain that in metadata.notes.feasibilityReasoning and ensure the summary calls out the manual requirement.
- The summary must explicitly state whether the workflow runs automatically on a schedule or requires manual execution.
- Workflow contract declarations must not include inheritance or protocol conformance (e.g., remove ": DeFiActions.Workflow"), and the body must not include standalone Cadence transaction blocks.
- The contract must expose an access(all) resource (e.g., Workflow) with a public method that orchestrates the connectors (VaultSource withdrawal -> swapper.swap(...) -> VaultSink deposit) so ForteHub Manager can call it directly.
- Every import address must match the references above (Core Flow Contracts / Detected Tokens). Never use placeholder addresses such as 0x01 or 0x02, and never guess new addresses.
- Format imports as 'import ModuleName from 0xAddress' - never use bare string imports.
- If connector-based composition is impossible, return feasible=false and explain what additional connectors or tokens are required.
- Only return pure JSON (no markdown fences, comments, or trailing text).`;

interface ParsedLLMResult {
  workflow: any | null;
  raw: string;
  issues: string[];
}

interface Budget {
  remaining: number;
}

async function gatherFiles(dir: string, out: string[], budget: Budget) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await gatherFiles(full, out, budget);
        if (budget.remaining <= 0) {
          break;
        }
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) {
        continue;
      }

      try {
        const stats = await fs.stat(full);
        if (stats.size > MAX_FILE_SIZE) {
          continue;
        }

        const content = await fs.readFile(full, "utf8");
        const snippet = `FILE: ${full}\n${content}\n`;

        if (snippet.length <= budget.remaining) {
          out.push(snippet);
          budget.remaining -= snippet.length;
        } else {
          const truncated = snippet.slice(0, Math.max(0, budget.remaining));
          if (truncated) {
            out.push(`${truncated}\n... (truncated)\n`);
          }
          budget.remaining = 0;
          break;
        }
      } catch (err) {
        console.warn("context file read failed", full, err);
      }

      if (budget.remaining <= 0) {
        break;
      }
    }
  } catch (err) {
    console.warn("context directory read failed", dir, err);
  }
}

async function buildContextSections() {
  const projectRoot = process.cwd();
  const budget: Budget = { remaining: MAX_CONTEXT_CHARS };

  const flowActionsParts: string[] = [];
  const candidateRoots = [
    path.join(projectRoot, "frontend", "cadence", "FlowActions"),
    path.join(projectRoot, "cadence", "FlowActions"),
    path.resolve(projectRoot, "..", "cadence", "FlowActions"),
  ];

  let flowActionsRoot: string | null = null;
  for (const candidate of candidateRoots) {
    try {
      await fs.access(candidate);
      flowActionsRoot = candidate;
      break;
    } catch {
      continue;
    }
  }

  if (!flowActionsRoot) {
    console.warn("flow actions root not found", { projectRoot, candidateRoots });
  }
  const FLOW_ACTION_FILES = [
    "README.md",
    path.join("cadence", "contracts", "interfaces", "DeFiActions.cdc"),
    path.join("cadence", "contracts", "connectors", "FungibleTokenConnectors.cdc"),
    path.join("cadence", "contracts", "connectors", "SwapConnectors.cdc"),
    path.join("cadence", "contracts", "connectors", "increment-fi", "IncrementFiSwapConnectors.cdc"),
    path.join("cadence", "contracts", "connectors", "band-oracle", "BandOracleConnectors.cdc"),
    path.join("cadence", "transactions", "increment-fi", "restake_rewards.cdc"),
    path.join("cadence", "tests", "IncrementFiSwapConnectors_test.cdc"),
  ];

  if (flowActionsRoot) {
    for (const relative of FLOW_ACTION_FILES) {
    if (budget.remaining <= 0) break;
    const filePath = path.join(flowActionsRoot, relative);
    try {
      let content = await fs.readFile(filePath, "utf8");
      const MAX_FILE_CHARS = 15_000;
      if (content.length > MAX_FILE_CHARS) {
        content = `${content.slice(0, MAX_FILE_CHARS)}\n... (truncated)\n`;
      }

      if (content.length <= budget.remaining) {
        flowActionsParts.push(`FILE: ${filePath}\n${content}\n`);
        budget.remaining -= content.length;
      } else if (budget.remaining > 0) {
        flowActionsParts.push(
          `FILE: ${filePath}\n${content.slice(0, budget.remaining)}\n... (truncated)\n`
        );
        budget.remaining = 0;
      }
    } catch (err) {
        console.warn(
          "flow actions snippet read failed",
          filePath,
          err instanceof Error ? err.message : err
        );
    }
  }
  }
  const flowActionsContext = flowActionsParts.join("\n");

  let cadenceSyntax = "";
  const cadenceRoot = path.resolve(projectRoot, "..", "cadence");
  const syntaxPath = path.join(
    cadenceRoot,
    "cadence-ai",
    "cadence-syntax-patterns.mdc"
  );
  const MAX_SYNTAX_SNIPPET_CHARS = 20000;
  try {
    let syntaxContent = await fs.readFile(syntaxPath, "utf8");
    if (syntaxContent.length > MAX_SYNTAX_SNIPPET_CHARS) {
      const slicedLines = syntaxContent.split("\n").slice(0, 300);
      syntaxContent = `${slicedLines.join("\n")}\n... (truncated to key Cadence syntax patterns)\n`;
    }
    if (syntaxContent.length <= budget.remaining) {
      cadenceSyntax = `FILE: ${syntaxPath}\n${syntaxContent}\n`;
      budget.remaining -= cadenceSyntax.length;
    } else if (budget.remaining > 0) {
      cadenceSyntax = `FILE: ${syntaxPath}\n${syntaxContent.slice(
        0,
        budget.remaining
      )}\n... (truncated)\n`;
      budget.remaining = 0;
    }
  } catch (err) {
    console.warn("cadence syntax file read failed", syntaxPath, err);
  }

  console.log("[generate][api] context summary", {
    projectRoot,
    flowActionsRoot,
    flowActionsFiles: flowActionsParts.length,
    flowActionsChars: flowActionsContext.length,
    flowActionsPreview: flowActionsContext.slice(0, 200),
    cadenceSyntaxChars: cadenceSyntax.length,
  });

  return { flowActionsContext, cadenceSyntax };
}

function getConnectorImports(network: string): string[] {
  if (CONNECTOR_IMPORTS[network]) {
    return CONNECTOR_IMPORTS[network];
  }
  return CONNECTOR_IMPORTS.testnet;
}

function detectScheduleHint(text: string): ScheduleHint {
  const lowered = text.toLowerCase();
  const patterns: Array<{ regex: RegExp; keyword: string }> = [
    { regex: /\bdaily\b/, keyword: "daily" },
    { regex: /\bweekly\b/, keyword: "weekly" },
    { regex: /\bmonthly\b/, keyword: "monthly" },
    { regex: /\bquarterly\b/, keyword: "quarterly" },
    { regex: /\bhourly\b/, keyword: "hourly" },
    { regex: /\bevery\s+\d+\s*(day|week|month|hour|minute)/, keyword: "every X" },
    { regex: /\bper\s+(day|week|month|hour|minute)\b/, keyword: "per interval" },
    { regex: /\bev?e?ry\s+(day|week|month|hour|minute|night|morning|evening)\b/, keyword: "every interval" },
    { regex: /\bevery\s*(morning|evening|night)/, keyword: "every time of day" },
    { regex: /\bschedule|scheduled|scheduling\b/, keyword: "schedule" },
    { regex: /\bautomated|automatically\b/, keyword: "automatic" },
    { regex: /\bcron\b/, keyword: "cron" },
    { regex: /\bperiodic\b/, keyword: "periodic" },
  ];

  for (const { regex, keyword } of patterns) {
    if (regex.test(lowered)) {
      return { mode: "auto", keyword };
    }
  }

  return { mode: "manual" };
}

function normalizeWorkflow(workflow: any): any {
  if (!workflow || typeof workflow !== "object") {
    return workflow;
  }

  if (workflow.metadata && typeof workflow.metadata === "object") {
    if (!workflow.category && typeof workflow.metadata.category === "string") {
      workflow.category = workflow.metadata.category;
    }
  }

  if (workflow.feasible === false) {
    const fallback = workflow.suggestedDescription || workflow.strategy;
    if (!workflow.strategy && typeof fallback === "string") {
      workflow.strategy = fallback;
    }
  }

  return workflow;
}

function validateWorkflowResponse(workflow: any, scheduleHint: ScheduleHint): string[] {
  const issues: string[] = [];

  if (typeof workflow !== "object" || workflow === null) {
    return ["Response must be a JSON object."];
  }

  if (typeof workflow.feasible !== "boolean") {
    issues.push('Missing or invalid "feasible" boolean.');
  }

  const feasible = workflow.feasible !== false;

  if (feasible) {
    if (!workflow.workflowName || typeof workflow.workflowName !== "string") {
      issues.push('Missing "workflowName" string.');
    }
    if (!workflow.category || typeof workflow.category !== "string") {
      issues.push('Missing "category" string.');
    }
    if (!workflow.description || typeof workflow.description !== "string") {
      issues.push('Missing "description" string.');
    }
    if (!workflow.contractCode || typeof workflow.contractCode !== "string") {
      issues.push('Missing "contractCode" string.');
    }
    if (!workflow.metadata || typeof workflow.metadata !== "object") {
      issues.push('Missing "metadata" object.');
    }

    if (workflow.contractCode) {
      const code = workflow.contractCode;
      if (code.includes("...")) {
        issues.push('contractCode still contains "..." placeholder text. Provide the full implementation.');
      }
      if (/\bTODO\b/i.test(code)) {
        issues.push('contractCode includes TODO markers. Replace them with final logic.');
      }
      if (/Implement logic/iu.test(code) || /placeholder/iu.test(code)) {
        issues.push('Remove placeholder comments like "Implement logic" and provide working Cadence code.');
      }
      if (!/access\(all\)\s+contract/.test(code)) {
        issues.push('contractCode must declare an access(all) contract.');
      }
      const usesDeFiPrimitives =
        /DeFiActions\./.test(code) ||
        /FungibleTokenConnectors\./.test(code) ||
        /SwapConnectors\./.test(code) ||
        /IncrementFiSwapConnectors\./.test(code) ||
        /BandOracleConnectors\./.test(code) ||
        /AutoBalancer/.test(code);
      if (!usesDeFiPrimitives) {
        issues.push('Contract must leverage DeFiActions primitives (e.g., VaultSource, Swapper, PriceOracle).');
      }
      if (/\b0x[0-9a-fA-F]{1,3}\b/.test(code)) {
        issues.push("Replace placeholder addresses such as 0x01 or 0x02 with real Flow addresses from the provided references.");
      }
    }

    if (scheduleHint.mode === "auto") {
      const schedulableFlag = workflow.metadata?.isSchedulable ?? workflow.isSchedulable;
      if (schedulableFlag !== true) {
        issues.push("Strategy implies scheduling but metadata.isSchedulable is not true.");
      }

      let frequencyValue = workflow.metadata?.defaultFrequency ?? workflow.defaultFrequency;
      if (typeof frequencyValue === "number") {
        frequencyValue = String(frequencyValue);
      }
      if (!(typeof frequencyValue === "string" && frequencyValue.trim().length > 0)) {
        issues.push("Provide metadata.defaultFrequency (seconds as string) for scheduled workflows.");
      } else {
        const parsed = Number(frequencyValue);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          issues.push("metadata.defaultFrequency must be a positive numeric string representing seconds.");
        }
      }

      if (typeof workflow.summary === "string") {
        const summaryLower = workflow.summary.toLowerCase();
        const mentionsAutomation = ["automatic", "automated", "schedule", "scheduled", "autonomous"].some((word) =>
          summaryLower.includes(word)
        );
        if (!mentionsAutomation) {
          issues.push("Summary should explicitly mention that the workflow runs automatically on a schedule.");
        }
      }
    }
  } else {
    if (!workflow.reason || typeof workflow.reason !== "string") {
      issues.push('Missing "reason" explaining infeasibility.');
    }
    const suggestion = workflow.suggestedDescription || workflow.strategy;
    if (!suggestion || typeof suggestion !== "string" || suggestion.trim().length === 0) {
      issues.push('Provide "suggestedDescription"/"strategy" with a feasible alternative.');
    }
  }

  return issues;
}

function buildRetryPrompt(
  basePrompt: string,
  previousRaw: string,
  issues: string[]
): string {
  const list = issues.map((item) => `- ${item}`).join("\n");
  const previous = previousRaw.trim().length > 0 ? previousRaw.trim() : "<empty response>";

  return `${basePrompt}

## Retry Notes
The previous JSON response had the following issues:
${list}

Previous response:
${previous}

Please correct these issues and resend only the JSON object described earlier.`;
}

function buildPromptWithContext(params: {
  strategy: string;
  additional?: string;
  imports: string;
  tokenInfo: string;
  flowActionsContext: string;
  cadenceSyntax: string;
  scheduleHint: ScheduleHint;
  coreReference: string;
  network: string;
}): string {
  const {
    strategy,
    additional,
    imports,
    tokenInfo,
    flowActionsContext,
    cadenceSyntax,
    scheduleHint,
    coreReference,
    network,
  } = params;

  const sections: string[] = [];
  const connectorImports = getConnectorImports(network);
  const primaryDeFiImport = connectorImports.find((line) =>
    line.toLowerCase().includes("defiactions")
  );

  sections.push("## ForteHub Workflow Generator");
  sections.push(
    [
      "You are generating Cadence 1.0 workflow contracts for ForteHub.",
      "Use the import and connector patterns exactly as provided.",
      "Never emit placeholder logic, runtime import syntax, or {DeFiActions.*} shorthand.",
    ].join(" ")
  );

  const requestLines = [
    "## Workflow Request",
    `Primary description: ${strategy.trim() || "Not provided"}`,
    `Schedule hint: ${
      scheduleHint.mode === "auto"
        ? `Automatic (detected keyword "${scheduleHint.keyword}")`
        : "Manual (no cadence keywords detected)"
    }`,
    additional && additional.trim() ? `Additional notes: ${additional.trim()}` : null,
    "",
    "Generate a Cadence 1.0 workflow contract that satisfies the request above.",
    "",
    "Contract Structure Requirements:",
    primaryDeFiImport
      ? `- Always include ${primaryDeFiImport} and use its helpers (createUniqueIdentifier, VaultSource/VaultSink wiring).`
      : "- Always import DeFiActions from the provided address and use its helpers (createUniqueIdentifier, VaultSource/VaultSink wiring).",
    "- Declare access(all) contract {Name} without inheritance/conformance.",
    "- Inside, define access(all) resource Workflow (or a similarly named resource) that stores connectors and exposes a public run function.",
    "- In init, accept connector capabilities/resources (VaultSource, VaultSink, IncrementFiSwapConnectors.Swapper or other {DeFiActions.Swapper}) and store them.",
    "- In run, orchestrate the connectors: withdraw via VaultSource, call swapper.swap(quote: ..., inVault: ...) (or a MultiSwapper), deposit via VaultSink, emit events, and enforce pre/post conditions.",
    "- Do NOT include standalone transaction blocks.",
    "- Provide helper access(all) functions if needed (e.g., to update config fields).",
    "- Copy the exact import statements shown below (import ModuleName from 0xAddress). Do not invent runtime import syntax, and only include modules you actually use.",
    "- Use concrete types (Type<@FlowToken.Vault>(), auth(FungibleToken.Withdraw) &{FungibleToken.Vault}) instead of {DeFiActions.*} shorthand.",
    "- Expose configurable parameters such as flowAmount and maxSlippage in both the resource and metadata.configFields/defaultParameters.",
    "- All asset movement must go through DeFiActions connectors; do not borrow account storage directly or create ad-hoc vault logic.",
    "- Remember the deployment pipeline: Stage 1 (`DEPLOY_WORKFLOW_TRANSACTION`) deploys the contract, registers metadata, and sets up vaults. Stage 2 runs your factory function to instantiate the workflow resource.",
    "- Factory signature MUST be `access(all) fun createWorkflow(workflowId: UInt64, config: {String: AnyStruct}, manager: &{ForteHub.WorkflowAcceptance}, ticket: @ForteHub.CloneTicket?)`. It must create the Workflow resource and immediately call `manager.acceptWorkflow(...)`; do NOT return the resource.",
    "- Pull configurable values (name, category, thresholds, paths, etc.) from the `config` dictionary inside `createWorkflow` so both creators and cloners can override defaults safely. Creators pass `ticket: <-nil`; paid clones supply a real ticket.",
    "",
    "Required JSON fields (must all be present when feasible=true):",
    "- workflowName (string)",
    "- category (string from: rebalancing, yield, dca, liquidity, risk-management, automation, custom)",
    "- description (string, 2-3 full sentences)",
    "- contractCode (string with complete Cadence contract)",
    "- metadata object including: assets[], configFields[], defaultParameters{}, notes{}, isSchedulable, defaultFrequency (when schedulable), summary, warnings, feasible",
    "- Summary must clearly state whether the workflow runs automatically on a schedule or requires manual execution (use phrases like \"runs automatically every\" or \"requires manual execution\").",
    "- metadata.configFields/defaultParameters must expose any adjustable parameters used in the contract (e.g., flowAmount, maxSlippage).",
  ].filter(Boolean);

  sections.push(requestLines.join("\n"));

  sections.push(
    [
      "## Resource-Based Workflow Skeleton (adapt as needed)",
      "import ForteHub from 0xbd4c3996265ed830",
      "",
      "access(all) contract {Name} {",
      "  access(all) resource Workflow {",
      "    access(all) let id: UInt64",
      "    access(all) let name: String",
      "    access(all) let category: String",
      "    access(all) var maxFlowPerRun: UFix64",
      "    access(all) var maxSlippage: UFix64",
      "",
      "    init(id: UInt64, name: String, category: String, maxFlowPerRun: UFix64, maxSlippage: UFix64) {",
      "      self.id = id",
      "      self.name = name",
      "      self.category = category",
      "      self.maxFlowPerRun = maxFlowPerRun",
      "      self.maxSlippage = maxSlippage",
      "    }",
      "",
      "    access(all) fun run(): Void {",
      "      // Withdraw via DeFiActions connectors, perform swaps, deposit to sinks, emit events, etc.",
      "    }",
      "",
      "    access(account) fun updateMaxFlowPerRun(newValue: UFix64): Void {",
      "      self.maxFlowPerRun = newValue",
      "    }",
      "  }",
      "",
      "  access(all) fun createWorkflow(",
      "      workflowId: UInt64,",
      "      config: {String: AnyStruct},",
      "      manager: &{ForteHub.WorkflowAcceptance},",
      "      ticket: @ForteHub.CloneTicket?",
      "  ) {",
      "    let maxFlowPerRun = (config[\"maxFlowPerRun\"] as? UFix64) ?? 10.0",
      "    let maxSlippage = (config[\"maxSlippage\"] as? UFix64) ?? 0.02",
      "    let workflowName = (config[\"name\"] as? String) ?? \"FLOW Yield Workflow\"",
      "    let workflowCategory = (config[\"category\"] as? String) ?? \"yield\"",
      "",
      "    let workflow <- create Workflow(",
      "      id: workflowId,",
      "      name: workflowName,",
      "      category: workflowCategory,",
      "      maxFlowPerRun: maxFlowPerRun,",
      "      maxSlippage: maxSlippage",
      "    )",
      "",
      "    manager.acceptWorkflow(",
      "      workflowId: workflowId,",
      "      workflow: <-workflow,",
      "      ticket: <-ticket",
      "    )",
      "  }",
      "}",
      "",
      "Adapt the skeleton to the requested assets/connectors: inside run(), wire up DeFiActions VaultSource/VaultSink objects plus swappers/oracles. Ensure metadata.configFields/defaultParameters mirror every tunable value pulled from config.",
    ].join("\n")
  );

  sections.push(
    [
      "## FlowActions Example (Flow -> USDC swap)",
      "```cadence",
      "import FungibleToken from 0x9a0766d93b6608b7",
      "import FlowToken from 0x7e60df042a9c0868",
      "import USDCFlow from 0x64adf39cbc354fcb",
      "import DeFiActions from 0x2ab6f469ee0dfbb6",
      "import FungibleTokenConnectors from 0x5a7b9cee9aaf4e4e",
      "import IncrementFiSwapConnectors from 0x49bae091e5ea16b5",
      "import ForteHub from 0xbd4c3996265ed830",
      "",
      "access(all) contract FlowToUSDCExample {",
      "  access(all) resource Workflow {",
        "    access(all) let flowSource: FungibleTokenConnectors.VaultSource",
        "    access(all) let usdcSink: FungibleTokenConnectors.VaultSink",
      "    access(all) let swapper: IncrementFiSwapConnectors.Swapper",
      "    access(all) var maxFlowPerRun: UFix64",
      "    access(all) var maxSlippage: UFix64",
      "",
      "    init(flowSource: FungibleTokenConnectors.VaultSource, usdcSink: FungibleTokenConnectors.VaultSink, swapper: IncrementFiSwapConnectors.Swapper, maxFlowPerRun: UFix64, maxSlippage: UFix64) {",
      "      self.flowSource = flowSource",
      "      self.usdcSink = usdcSink",
      "      self.swapper = swapper",
      "      self.maxFlowPerRun = maxFlowPerRun",
      "      self.maxSlippage = maxSlippage",
      "    }",
      "",
      "    access(all) fun run(): Void {",
      "      let available = self.flowSource.minimumAvailable()",
      "      if available == 0.0 {",
      "        return",
      "      }",
      "",
      "      let withdrawTarget = available < self.maxFlowPerRun ? available : self.maxFlowPerRun",
      "      let sinkCapacity = self.usdcSink.minimumCapacity()",
      "      let capped = withdrawTarget < sinkCapacity ? withdrawTarget : sinkCapacity",
      "      if capped == 0.0 {",
      "        return",
      "      }",
      "",
      "      let flowVault <- self.flowSource.withdrawAvailable(maxAmount: capped)",
      "      let quote = self.swapper.quoteOut(forProvided: flowVault.balance, reverse: false)",
      "      let minimumOut: UFix64 = quote.outAmount * (1.0 - self.maxSlippage)",
      "      let usdcVault <- self.swapper.swap(quote: quote, inVault: <-flowVault)",
      "      assert(usdcVault.balance >= minimumOut, message: \"Swap output below slippage guard\")",
      "      self.usdcSink.depositCapacity(from: &usdcVault as auth(FungibleToken.Withdraw) &{FungibleToken.Vault})",
      "      assert(usdcVault.balance == 0.0, message: \"Residual USDC after deposit\")",
      "      destroy usdcVault",
      "    }",
      "  }",
      "",
      "  access(all) fun createWorkflow(",
      "      workflowId: UInt64,",
      "      config: {String: AnyStruct},",
      "      manager: &{ForteHub.WorkflowAcceptance},",
      "      ticket: @ForteHub.CloneTicket?",
      "  ) {",
      "    let maxFlowPerRun = (config[\"maxFlowPerRun\"] as? UFix64) ?? 5.0",
      "    let maxSlippage = (config[\"maxSlippage\"] as? UFix64) ?? 0.02",
      "",
      "    let workflow <- create Workflow(",
      "      flowSource: FlowToUSDCExample.buildFlowSource(),",
      "      usdcSink: FlowToUSDCExample.buildUsdSink(),",
      "      swapper: FlowToUSDCExample.buildSwapper(),",
      "      maxFlowPerRun: maxFlowPerRun,",
      "      maxSlippage: maxSlippage",
      "    )",
      "",
      "    manager.acceptWorkflow(",
      "      workflowId: workflowId,",
      "      workflow: <-workflow,",
      "      ticket: <-ticket",
      "    )",
      "  }",
      "",
      "  access(all) fun buildFlowSource(): FungibleTokenConnectors.VaultSource {",
      "    return FungibleTokenConnectors.borrowVaultSource(",
      "      owner: FlowToUSDCExample.account,",
      "      storagePathIdentifier: \"/storage/flowTokenVault\"",
      "    )",
      "  }",
      "",
      "  access(all) fun buildUsdSink(): FungibleTokenConnectors.VaultSink {",
      "    return FungibleTokenConnectors.borrowVaultSink(",
      "      owner: FlowToUSDCExample.account,",
      "      publicPathIdentifier: \"/public/usdcReceiver\"",
      "    )",
      "  }",
      "",
      "  access(all) fun buildSwapper(): IncrementFiSwapConnectors.Swapper {",
      "    return IncrementFiSwapConnectors.borrowSwapper(",
      "      owner: FlowToUSDCExample.account,",
      "      pathIdentifier: \"FLOW-USDC\"",
      "    )",
      "  }",
      "}",
      "```",
      "Mirror this wiring for other swap-based strategies by swapping in the detected assets and adjusting config fields. Helper builders can read storage/capability identifiers from config defaults if needed.",
    ].join("\n")
  );

  sections.push(
    [
      "## Strategy Connector Guide",
      "- Rebalancing with percentage targets -> inject @DeFiActions.AutoBalancer and call rebalance(force: true); expose setters for target weights instead of manual swaps.",
      "- Restaking or reward compounding -> combine PoolRewardsSource with SwapConnectors.SwapSource and an appropriate sink (see IncrementFi restake references).",
      "- Simple treasury moves (no swaps) -> use FungibleTokenConnectors.VaultSource and VaultSink only; skip swapper imports.",
      "- Price-gated execution -> inject BandOracleConnectors.PriceOracle and guard run() with clear threshold checks before moving funds.",
      "- Multi-leg conversions -> configure IncrementFiSwapConnectors.Swapper paths or build SwapConnectors.MultiSwapper stacks with unique operation IDs.",
      "- Scheduler-specific flows -> set metadata.isSchedulable/defaultFrequency and describe the automation explicitly in summary and notes.",
    ].join("\n")
  );

  sections.push(
    [
      "## AutoBalancer Example (Portfolio Rebalance)",
      "```cadence",
      "import DeFiActions from 0x2ab6f469ee0dfbb6",
      "import ForteHub from 0xbd4c3996265ed830",
      "",
      "access(all) contract PortfolioRebalancerExample {",
      "  access(all) resource Workflow {",
      "    access(all) var targetFlowPercent: UFix64",
      "    access(all) let autoBalancer: @DeFiActions.AutoBalancer",
      "",
      "    init(autoBalancer: @DeFiActions.AutoBalancer, targetFlowPercent: UFix64) {",
      "      self.autoBalancer <- autoBalancer",
      "      self.targetFlowPercent = targetFlowPercent",
      "    }",
      "",
      "    access(all) fun run(): Void {",
      "      self.autoBalancer.rebalance(force: true)",
      "    }",
      "",
      "    access(account) fun updateTargetFlowPercent(newTarget: UFix64): Void {",
      "      pre { newTarget > 0.0 && newTarget < 1.0: \"Target percent must be between 0 and 1\" }",
      "      self.targetFlowPercent = newTarget",
      "    }",
      "",
      "",
      "    destroy() {",
      "      destroy self.autoBalancer",
      "    }",
      "  }",
      "",
      "  access(all) fun createWorkflow(",
      "      workflowId: UInt64,",
      "      config: {String: AnyStruct},",
      "      manager: &{ForteHub.WorkflowAcceptance},",
      "      ticket: @ForteHub.CloneTicket?",
      "  ) {",
      "    let defaultTarget = (config[\"targetFlowPercent\"] as? UFix64) ?? 0.5",
      "",
      "    let workflow <- create Workflow(",
      "      autoBalancer: <-PortfolioRebalancerExample.buildAutoBalancer(),",
      "      targetFlowPercent: defaultTarget",
      "    )",
      "",
      "    manager.acceptWorkflow(",
      "      workflowId: workflowId,",
      "      workflow: <-workflow,",
      "      ticket: <-ticket",
      "    )",
      "  }",
      "",
      "  access(all) fun buildAutoBalancer(): @DeFiActions.AutoBalancer {",
      "    return DeFiActions.createAutoBalancer()",
      "  }",
      "}",
      "```",
      "Use this when the user describes allocation percentages or drift thresholds; the AutoBalancer handles vault math and oracle lookups internally. Replace the helper with the appropriate constructor from your DeFiActions toolkit.",
    ].join("\n")
  );

  if (connectorImports.length > 0 || imports.trim().length > 0) {
    sections.push("## Token & Connector Imports");
    sections.push("Place the required imports at the top of the contract. Remove lines marked Optional if you do not inject that connector.");
    sections.push("```cadence");
    connectorImports.forEach((line) => sections.push(line));
    imports.split("\n").forEach((line) => {
      if (line.trim().length === 0) return;
      const trimmed = line.trim();
      const alreadyIncluded = connectorImports.some((entry) => entry.includes(trimmed.split(" ")[1] ?? ""));
      if (!alreadyIncluded) {
        sections.push("// Optional: " + trimmed);
      }
    });
    sections.push("```");
  }

  if (coreReference) {
    sections.push(`## Core Flow Contracts (Testnet/Mainnet)\n${coreReference}`);
  }

  if (scheduleHint.mode === "auto") {
    sections.push(
      [
        "## Scheduling Expectations",
        `The strategy implies automation (detected keyword "${scheduleHint.keyword}").`,
        "- Default assumption: metadata.isSchedulable must be true and metadata.defaultFrequency must be provided as seconds (string).",
        "- Double-check the user language (daily, every, per, scheduled) before deciding; do not ignore cadence hints.",
        "- If you *must* keep it manual, set isSchedulable=false, omit defaultFrequency, and justify the override explicitly in metadata.notes.feasibilityReasoning.",
        "- Reflect the final scheduling decision at both the top level and inside metadata, and mention it in the summary, for example: This workflow runs automatically every 86400 seconds.",
      ].join("\n")
    );
  } else {
    sections.push(
      [
        "## Scheduling Expectations",
        "No automation keywords detected - default to manual execution.",
        "- metadata.isSchedulable should be false (or omitted).",
        "- Before finalising, re-check the description for cadence words (daily, weekly, per, every). If any are present, switch to isSchedulable=true with defaultFrequency (seconds string) and note the automation in metadata.notes.",
        "- Summary should make clear that this workflow requires manual execution unless automation is explicitly added later.",
      ].join("\n")
    );
  }

  if (flowActionsContext) {
    sections.push(`## FlowActions Reference\n${flowActionsContext}`);
  }

  if (cadenceSyntax) {
    sections.push(`## Cadence Syntax Reference\n${cadenceSyntax}`);
  }

  sections.push(DEFI_ACTIONS_CHECKLIST);
  sections.push(RESPONSE_CHECKLIST);

  return sections.join("\n\n");
}

async function callOpenRouter(
  prompt: string,
  context: string,
  opts: { apiKey?: string; model?: string }
) {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OpenRouter API key is not configured.");
  }

  const model = opts.model ?? process.env.OPENROUTER_MODEL ?? "openrouter/auto";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "https://fortehub.io",
      "X-Title": process.env.OPENROUTER_APP_TITLE ?? "ForteHub Workflow Generator",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "system",
          content: `Reference context (truncated to ${MAX_CONTEXT_CHARS} chars):\n${context}`,
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "workflow_response",
          schema: {
            type: "object",
            properties: {
              feasible: { type: "boolean" },
              workflowName: { type: "string" },
              category: { type: "string" },
              description: { type: "string" },
              contractCode: { type: "string" },
              metadata: { type: "object" },
              summary: { type: "string" },
              warnings: { type: "array", items: { type: "string" } },
              reason: { type: "string" },
              details: { type: "string" },
              suggestion: { type: "string" },
              suggestedDescription: { type: "string" },
              strategy: { type: "string" },
            },
            required: ["feasible"],
            allOf: [
              {
                if: { properties: { feasible: { const: true } } },
                then: {
                  required: [
                    "workflowName",
                    "category",
                    "description",
                    "contractCode",
                    "metadata",
                  ],
                },
              },
              {
                if: { properties: { feasible: { const: false } } },
                then: {
                  required: ["reason", "suggestedDescription", "strategy"],
                },
              },
            ],
            additionalProperties: true,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`OpenRouter request failed (${res.status}): ${message}`);
  }

  return res.json();
}

async function callAnthropic(
  prompt: string,
  context: string,
  apiKey: string,
  model: string
) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "system", content: `Context (truncated to ${MAX_CONTEXT_CHARS} chars):\n${context}` },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`Anthropic request failed (${res.status}): ${message}`);
  }

  return res.json();
}

async function callOpenAI(
  prompt: string,
  context: string,
  apiKey: string,
  model: string
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        { role: "system", content: `Reference context (truncated to ${MAX_CONTEXT_CHARS} chars):\n${context}` },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "workflow_response",
          schema: {
            type: "object",
            properties: {
              feasible: { type: "boolean" },
              workflowName: { type: "string" },
              category: { type: "string" },
              description: { type: "string" },
              contractCode: { type: "string" },
              metadata: { type: "object" },
              summary: { type: "string" },
              warnings: { type: "array", items: { type: "string" } },
              reason: { type: "string" },
              details: { type: "string" },
              suggestion: { type: "string" },
              suggestedDescription: { type: "string" },
              strategy: { type: "string" },
            },
            required: ["feasible"],
            allOf: [
              {
                if: { properties: { feasible: { const: true } } },
                then: {
                  required: [
                    "workflowName",
                    "category",
                    "description",
                    "contractCode",
                    "metadata",
                  ],
                },
              },
              {
                if: { properties: { feasible: { const: false } } },
                then: {
                  required: ["reason", "suggestedDescription", "strategy"],
                },
              },
            ],
            additionalProperties: true,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${message}`);
  }

  return res.json();
}

async function fetchFromProvider(
  providerType: string,
  prompt: string,
  context: string,
  apiKey?: string,
  model?: string
) {
  switch (providerType) {
    case "anthropic":
      if (!apiKey) {
        throw new Error("Anthropic API key required.");
      }
      return callAnthropic(
        prompt,
        context,
        apiKey,
        model || "claude-3-5-sonnet-20240620"
      );
    case "openai":
      if (!apiKey) {
        throw new Error("OpenAI API key required.");
      }
      return callOpenAI(prompt, context, apiKey, model || "gpt-4o-mini");
    case "openrouter":
      return callOpenRouter(prompt, context, {
        apiKey,
        model: model || "x/grok-1",
      });
    case "server":
      return callOpenRouter(prompt, context, {});
    default:
      return callOpenRouter(prompt, context, {});
  }
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let lastRaw = "";
  let lastIssues: string[] = [];

  try {
    const body = await request.json();
    const {
      strategy,
      additional,
      provider,
      apiKey,
      model,
    } = body ?? {};

    if (!strategy || typeof strategy !== "string") {
      return NextResponse.json(
        { error: "Strategy is required." },
        { status: 400 }
      );
    }

    if (!systemPromptLogged) {
      console.log("[generate][api] system prompt preview", SYSTEM_PROMPT.slice(0, 400));
      systemPromptLogged = true;
    }

    const providerType = provider ?? "openrouter";

    console.log("[generate][api] request payload", {
      provider: providerType,
      hasApiKey: Boolean(apiKey),
      model,
    });

    const { flowActionsContext, cadenceSyntax } = await buildContextSections();
    const scheduleHint = detectScheduleHint(`${strategy}\n${additional ?? ""}`);
    console.log("[generate][api] schedule hint", scheduleHint);

    const userTokenText = [strategy, additional].filter(Boolean).join("\n");
    const detectedTokens = detectTokensInDescription(userTokenText);
    const network = process.env.NEXT_PUBLIC_NETWORK || "testnet";
    const imports = getAllImportsForTokens(detectedTokens, network);
    const tokenInfo = generateTokenInfoForPrompt(detectedTokens, network);
    const coreReference = generateCoreContractReference(network);
    console.log("[generate][api] detected tokens", {
      network,
      tokens: detectedTokens.map((token) => token.symbol),
    });

    const basePrompt = buildPromptWithContext({
      strategy,
      additional,
      imports,
      tokenInfo,
      flowActionsContext,
      cadenceSyntax,
      scheduleHint,
      coreReference,
      network,
    });
    console.log("[generate][api] prompt preview", basePrompt.slice(0, 400));

    const combinedContext = [flowActionsContext, cadenceSyntax]
      .filter(Boolean)
      .join("\n\n");

    let currentPrompt = basePrompt;
    lastRaw = "";
    lastIssues = [];

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        console.log("[generate][api] retry prompt preview", {
          attempt,
          preview: currentPrompt.slice(0, 400),
        });
      }

      const llmResponse = await fetchFromProvider(
        providerType,
        currentPrompt,
        combinedContext,
        apiKey,
        model
      );

      const content =
        llmResponse?.choices?.[0]?.message?.content ??
        llmResponse?.output ??
        llmResponse?.content;

      const rawText =
        typeof content === "string"
          ? content
          : Array.isArray(content)
          ? content[0]?.text ?? ""
          : "";

      if (!rawText) {
        lastIssues = ["LLM response missing content string."];
        currentPrompt = buildRetryPrompt(basePrompt, lastRaw, lastIssues);
        continue;
      }

      let workflow: any;
      try {
        workflow = JSON.parse(rawText);
      } catch (parseError) {
        lastIssues = [
          `Invalid JSON: ${(parseError as Error).message}. Ensure the response is strictly valid JSON.`,
        ];
        console.warn("[generate][api] invalid JSON", rawText.slice(0, 400));
        lastRaw = rawText;
        currentPrompt = buildRetryPrompt(basePrompt, lastRaw, lastIssues);
        continue;
      }

      normalizeWorkflow(workflow);

      const validationIssues = validateWorkflowResponse(workflow, scheduleHint);
      if (workflow.feasible !== false && workflow.contractCode) {
        console.log(
          "[generate][api] contract output",
          `\n-----BEGIN CADENCE (attempt ${attempt})-----\n${workflow.contractCode}\n------END CADENCE------`
        );
        const validation = validateWorkflowCode(workflow.contractCode);
        if (!validation.isValid) {
          validationIssues.push(...validation.errors);
        }
      }

      if (validationIssues.length === 0) {
        console.log("[generate][api] response payload", {
          provider: providerType,
          feasible: workflow?.feasible !== false,
          workflowName: workflow?.workflowName,
          category: workflow?.category ?? workflow?.metadata?.category,
          isSchedulable: workflow?.metadata?.isSchedulable ?? workflow?.isSchedulable,
          defaultFrequency: workflow?.metadata?.defaultFrequency ?? workflow?.defaultFrequency,
          attempt,
        });
        return NextResponse.json({ workflow });
      }

      lastIssues = validationIssues;
      lastRaw = rawText;
      currentPrompt = buildRetryPrompt(basePrompt, lastRaw, lastIssues);
      console.warn("[generate][api] retry", { attempt, issues: validationIssues });
      if (workflow?.contractCode) {
        console.warn(
          "[generate][api] invalid contract",
          `\n-----BEGIN CADENCE INVALID (attempt ${attempt})-----\n${workflow.contractCode}\n------END CADENCE INVALID------`
        );
      }
    }

    console.error("[generate][api] exhausted attempts", {
      issues: lastIssues,
      lastResponsePreview: lastRaw.slice(0, 400),
    });

    const errorMessage = `LLM failed after ${MAX_GENERATION_ATTEMPTS} attempts: ${lastIssues.join(
      "; "
    )}.`;
    return NextResponse.json(
      {
        error: errorMessage,
        lastResponse: lastRaw,
        issues: lastIssues,
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("[workflows/generate] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error generating workflow.",
        lastResponse: lastRaw || undefined,
        issues: lastIssues.length > 0 ? lastIssues : undefined,
      },
      { status: 500 }
    );
  }
}

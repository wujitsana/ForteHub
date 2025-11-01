/**
 * Agent Generation Service
 *
 * Uses Claude AI with flow-defi-mcp to analyze DeFi strategies
 * and generate optimized Cadence smart contracts
 */

import Anthropic from "@anthropic-ai/sdk";

interface AgentGenerationRequest {
  strategyDescription: string;
  riskTolerance: "low" | "medium" | "high";
  targetYield: number;
  allowedProtocols: string[];
  oraclePreference: "band" | "chainlink" | "auto";
  initialCapital?: number;
}

interface GeneratedAgent {
  analysis: {
    status: "FEASIBLE" | "RISKY" | "NOT_FEASIBLE";
    reasoning: string;
    oracleSelected: string;
    recommendedMinPrice: number;
    recommendedMaxPrice: number;
    estimatedGasCostPerExecution: number;
  };
  contract: {
    code: string;
    parameters: Record<string, any>;
  };
  workflow: {
    yaml: string;
    schedule: string;
    actions: string[];
  };
  deployment: {
    nextSteps: string[];
    estimatedGas: number;
  };
}

export class AgentGenerationService {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate an agent from a strategy description
   */
  async generateAgent(
    request: AgentGenerationRequest
  ): Promise<GeneratedAgent> {
    // Build the prompt for Claude
    const prompt = this.buildGenerationPrompt(request);

    console.log("Calling Claude with flow-defi-mcp context...");

    // Call Claude API with MCP context
    // Claude will have access to flow-defi-mcp tools via MCP
    const response = await this.client.messages.create({
      model: "claude-opus-4-1-20250805",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      // Note: MCP tools would be configured in the claude-code environment
      // This is a simplified version for the API
    });

    // Parse the response
    const generatedAgent = this.parseClaudeResponse(response.content[0]);
    return generatedAgent;
  }

  /**
   * Build the detailed prompt for Claude to generate an agent
   */
  private buildGenerationPrompt(request: AgentGenerationRequest): string {
    return `
You are an expert DeFi smart contract engineer and AI agent strategist.

Generate an autonomous DeFi agent based on this strategy:

STRATEGY DESCRIPTION:
${request.strategyDescription}

CONSTRAINTS:
- Risk Tolerance: ${request.riskTolerance}
- Target Yield: ${request.targetYield}%
- Allowed Protocols: ${request.allowedProtocols.join(", ")}
- Oracle Preference: ${request.oraclePreference}
- Initial Capital: ${request.initialCapital || "Not specified"}$

YOUR TASK:
1. Use flow-defi-mcp to analyze:
   - Current prices on KittyPunch, IncrementFi, FlowFi for major tokens
   - Liquidity depths and slippage estimates
   - Protocol APYs and risk metrics
   - Gas costs for transaction types
   - Oracle data availability for required token pairs

2. Validate the strategy is feasible:
   - Are the required oracles available?
   - Can the protocols handle the strategy?
   - Is the yield realistic?

3. Generate a Cadence 1.0 smart contract that:
   - Implements the strategy logic
   - Reads from the Band Oracle (or Chainlink if available)
   - Stores execution state on-chain
   - Has entry points for Forte Workflow to call
   - Includes proper error handling

4. Generate a Forte Workflow configuration that:
   - Schedules the agent execution on appropriate intervals
   - Fetches oracle prices
   - Calls the contract functions
   - Records execution results

RESPONSE FORMAT (JSON):
{
  "analysis": {
    "status": "FEASIBLE|RISKY|NOT_FEASIBLE",
    "reasoning": "why this strategy is feasible and how MCP data supports it",
    "oracleSelected": "band|chainlink",
    "recommendedMinPrice": <number>,
    "recommendedMaxPrice": <number>,
    "estimatedGasCostPerExecution": <number>
  },
  "contract": {
    "code": "<full Cadence 1.0 contract code>",
    "parameters": {
      "key": "value"
    }
  },
  "workflow": {
    "yaml": "<Forte workflow YAML>",
    "schedule": "every 3 days|daily|hourly|etc",
    "actions": ["FetchPrice", "ExecuteStrategy"]
  },
  "deployment": {
    "nextSteps": ["review contract", "deploy", "register"],
    "estimatedGas": <number>
  }
}

CRITICAL REQUIREMENTS:
- The Cadence contract MUST be valid Cadence 1.0 syntax
- Contract MUST use access(contract) or access(all) modifiers correctly
- No direct mutations of access(all) var fields - use helper functions instead
- Must include proper Event emission for execution tracking
- Must validate oracle data freshness
- Must implement safe math to avoid overflow/underflow

Generate the agent now.
`;
  }

  /**
   * Parse Claude's response and extract the generated agent
   */
  private parseClaudeResponse(content: any): GeneratedAgent {
    // Extract JSON from Claude's response
    let jsonStr = content.text;

    // Find JSON in the response (between first { and last })
    const jsonStart = jsonStr.indexOf("{");
    const jsonEnd = jsonStr.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("Could not find JSON in Claude response");
    }

    jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);

    try {
      const agent = JSON.parse(jsonStr) as GeneratedAgent;

      // Validate the response has all required fields
      if (!agent.analysis || !agent.contract || !agent.workflow) {
        throw new Error("Missing required fields in agent response");
      }

      return agent;
    } catch (error) {
      console.error("Failed to parse Claude response:", jsonStr);
      throw error;
    }
  }

  /**
   * Validate a generated contract for Cadence syntax
   */
  async validateContract(code: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    // In a real implementation, this would call the Flow CLI or a Cadence validator
    // For now, do basic checks
    const errors: string[] = [];

    // Check for required contract structure
    if (!code.includes("access(all) contract")) {
      errors.push('Contract must start with "access(all) contract"');
    }

    // Check for Cadence 1.0 patterns
    if (code.includes("pub fun")) {
      errors.push(
        'Cadence 1.0 requires "access(all) fun" instead of "pub fun"'
      );
    }

    // Check for direct mutation of access(all) var
    const accessAllVarPattern = /access\(all\)\s+var\s+(\w+):/g;
    const assignmentPattern = /\1\s*=/g;

    if (accessAllVarPattern.test(code)) {
      // Would need more sophisticated parsing to check if mutations happen
      // For now just warn
      console.warn(
        "Warning: Contains access(all) var fields - ensure no direct mutations"
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const agentGenerationService = new AgentGenerationService();

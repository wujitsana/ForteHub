/**
 * Token Registry - Hardcoded token information for Flow blockchain
 *
 * This is the source of truth for token addresses, types, and imports.
 * Later, this can be replaced with MCP queries to flow-defi-mcp for dynamic data.
 *
 * TODO: Replace with MCP calls when flow-defi-mcp is available
 */

import {
  TOKEN_REGISTRY,
  CORE_CONTRACTS,
  TokenInfo,
  CoreContractInfo
} from '../config/tokens';

export type { TokenInfo, CoreContractInfo };

/**
 * Extract mentioned tokens from user description
 * Searches for token names/symbols in the description
 * Maps user input "USDC" to "USDCFlow" token automatically
 */
export function detectTokensInDescription(description: string): TokenInfo[] {
  if (!description) return [TOKEN_REGISTRY.FLOW];

  const mentionedTokens: TokenInfo[] = [];
  const descLower = description.toLowerCase();

  // Always start with FLOW
  mentionedTokens.push(TOKEN_REGISTRY.FLOW);

  // Special case: map user input "USDC" to "USDCFlow" token
  if (descLower.includes('usdc')) {
    mentionedTokens.push(TOKEN_REGISTRY.USDC);
  }

  // Map generic BTC mentions to WBTC (default wrapped Bitcoin available on Flow)
  if (/\bbtc\b/.test(descLower) || descLower.includes('bitcoin')) {
    if (!mentionedTokens.find((token) => token.symbol === TOKEN_REGISTRY.WBTC.symbol)) {
      mentionedTokens.push(TOKEN_REGISTRY.WBTC);
    }
  }

  // Then check for explicitly mentioned tokens (USDT, USDF, stFlow, etc)
  // Note: We don't auto-detect USDC - handled above with alias
  for (const [key, tokenInfo] of Object.entries(TOKEN_REGISTRY)) {
    // Skip FLOW (already added), USDC (handled above), and skip if already detected
    if (
      tokenInfo.symbol === 'FLOW' ||
      key === 'USDC' ||
      mentionedTokens.find((t) => t.symbol === tokenInfo.symbol)
    ) {
      continue;
    }

    // Check for symbol mentions (e.g., "fuDAI", "stFlow")
    if (
      descLower.includes(tokenInfo.symbol.toLowerCase()) ||
      descLower.includes(tokenInfo.name.toLowerCase())
    ) {
      mentionedTokens.push(tokenInfo);
    }
  }

  return mentionedTokens;
}

/**
 * Get the correct address for a token on a specific network
 */
export function getTokenAddressForNetwork(token: TokenInfo, network: string = 'testnet'): string {
  const netKey = network as keyof typeof token.networks;
  const address = token.networks[netKey] || token.networks.mainnet || token.importAddress;
  return address;
}

/**
 * Generate import statements for detected tokens on a specific network
 */
export function generateImportsForTokens(tokens: TokenInfo[], network: string = 'testnet'): string {
  return tokens
    .map((token) => {
      const address = getTokenAddressForNetwork(token, network);
      return `import ${token.symbol} from ${address}`;
    })
    .join('\n');
}

/**
 * Generate token information section for the LLM prompt
 */
export function generateTokenInfoForPrompt(tokens: TokenInfo[], network: string = 'testnet'): string {
  if (tokens.length === 0) {
    return '';
  }

  let prompt = `## AVAILABLE TOKENS FOR THIS STRATEGY\n\n`;
  prompt += `The following tokens are available for this strategy on ${network}:\n\n`;

  for (const token of tokens) {
    const address = getTokenAddressForNetwork(token, network);
    prompt += `**${token.symbol}** (${token.name}):\n`;
    prompt += `- Import: \`import ${token.symbol} from ${address}\`\n`;
    prompt += `- Vault Type: \`Type<${token.vaultType}>()\` (concrete type, no braces)\n`;
    prompt += `- Description: ${token.description}\n\n`;
  }

  prompt += `Use these token values in your contract. DO NOT use placeholder or unknown tokens.\n\n`;

  return prompt;
}

/**
 * Get all imports needed for a strategy
 */
export function getAllImportsForTokens(tokens: TokenInfo[], network: string = 'testnet'): string {
  // Testnet contract addresses
  const testnetAddresses = {
    FungibleToken: '0x9a0766d93b6608b7',
    FlowToken: '0x7e60df042a9c0868',
  };

  // Mainnet contract addresses
  const mainnetAddresses = {
    FungibleToken: '0xf233dcee88fe0abe',
    FlowToken: '0x1654653399040a61',
  };

  const addresses = network === 'mainnet' ? mainnetAddresses : testnetAddresses;

  // Base imports that workflow contracts need (scheduler is handled by manager)
  const baseImports = `import FungibleToken from ${addresses.FungibleToken}
import FlowToken from ${addresses.FlowToken}`;

  const connectorImports = CORE_CONTRACTS.map((contract) => {
    const address = contract.networks[network as 'testnet' | 'mainnet'];
    if (!address) {
      return null;
    }
    return `import ${contract.name} from ${address}`;
  }).filter((line): line is string => Boolean(line));

  // Additional token imports (beyond FLOW)
  const tokenImports = tokens
    .filter((t) => t.symbol !== 'FLOW') // FLOW already in base
    .map((t) => {
      const address = getTokenAddressForNetwork(t, network);
      return `import ${t.symbol} from ${address}`;
    })
    .join('\n');

  const sections = [baseImports];
  if (connectorImports.length > 0) {
    sections.push(connectorImports.join('\n'));
  }
  if (tokenImports) {
    sections.push(tokenImports);
  }

  return sections.join('\n');
}

export function generateCoreContractReference(network: string = 'testnet'): string {
  const lines: string[] = [];
  lines.push('Name | Address | Notes');
  lines.push('---|---|---');

  CORE_CONTRACTS.forEach((contract) => {
    const address = contract.networks[network as 'testnet' | 'mainnet'];
    if (!address) {
      return;
    }
    const note = contract.description ? contract.description : '';
    lines.push(`${contract.name} | ${address} | ${note}`);
  });

  if (lines.length <= 2) {
    return '';
  }

  return lines.join('\n');
}

/**
 * Token Registry - Hardcoded token information for Flow blockchain
 *
 * This is the source of truth for token addresses, types, and imports.
 * Later, this can be replaced with MCP queries to flow-defi-mcp for dynamic data.
 *
 * TODO: Replace with MCP calls when flow-defi-mcp is available
 */

export interface TokenInfo {
  name: string;
  symbol: string;
  importAddress: string;
  importPath: string;
  vaultType: string;
  vaultTypeNoImport?: string; // Fallback if import not available
  description: string;
  networks: {
    testnet?: string;
    mainnet?: string;
  };
}

export const TOKEN_REGISTRY: Record<string, TokenInfo> = {
  FLOW: {
    name: 'Flow Token',
    symbol: 'FLOW',
    importAddress: '0x1654653399040a61',
    importPath: 'import FlowToken from 0x1654653399040a61',
    vaultType: '@FlowToken.Vault',
    description: 'Native Flow token - always available',
    networks: {
      testnet: '0x7e60df042a9c0868',
      mainnet: '0x1654653399040a61',
    },
  },
  USDC: {
    name: 'USD Coin (stgUSDC)',
    symbol: 'USDCFlow',
    importAddress: '0x1e4aa0b87d10b141',
    importPath: 'import USDCFlow from 0x1e4aa0b87d10b141',
    vaultType: '@USDCFlow.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'USD Coin - EVM-bridged stablecoin',
    networks: {
      testnet: '0x64adf39cbc354fcb',
      mainnet: '0x1e4aa0b87d10b141',
    },
  },
  USDT: {
    name: 'Tether (stgUSDT)',
    symbol: 'USDT',
    importAddress: '0x1e4aa0b87d10b141',
    importPath: 'import USDT from 0x1e4aa0b87d10b141',
    vaultType: '@USDT.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'Tether - EVM-bridged stablecoin',
    networks: {
      mainnet: '0x1e4aa0b87d10b141',
    },
  },
  USDF: {
    name: 'USD Flow',
    symbol: 'USDF',
    importAddress: '0x1e4aa0b87d10b141',
    importPath: 'import USDF from 0x1e4aa0b87d10b141',
    vaultType: '@USDF.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'USD Flow - EVM-bridged stablecoin',
    networks: {
      testnet: '0xb7ace0a920d2c37d',
      mainnet: '0x1e4aa0b87d10b141',
    },
  },
  USDCe: {
    name: 'USD Coin (Celer)',
    symbol: 'USDC.e',
    importAddress: '0xf1ab99c82dee3526',
    importPath: 'import USDCe from 0xf1ab99c82dee3526',
    vaultType: '@USDCe.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'USDC (Celer bridge)',
    networks: {
      mainnet: '0xf1ab99c82dee3526',
    },
  },
  stFlow: {
    name: 'Increment Staked FLOW',
    symbol: 'stFlow',
    importAddress: '0xd6f80565193ad727',
    importPath: 'import stFlow from 0xd6f80565193ad727',
    vaultType: '@stFlow.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'Increment staked FLOW token',
    networks: {
      mainnet: '0xd6f80565193ad727',
    },
  },
  ankrFLOW: {
    name: 'Ankr Staked FLOW',
    symbol: 'ankrFLOW',
    importAddress: '0x1e4aa0b87d10b141',
    importPath: 'import ankrFLOW from 0x1e4aa0b87d10b141',
    vaultType: '@ankrFLOW.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'Ankr staked FLOW token',
    networks: {
      mainnet: '0x1e4aa0b87d10b141',
    },
  },
  MOET: {
    name: 'MOET Token',
    symbol: 'MOET',
    importAddress: '0xd27920b6384e2a78',
    importPath: 'import MOET from 0xd27920b6384e2a78',
    vaultType: '@MOET.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'MOET token',
    networks: {
      testnet: '0xd27920b6384e2a78',
    },
  },
  WETH: {
    name: 'Wrapped Ethereum',
    symbol: 'WETH',
    importAddress: '0x1e4aa0b87d10b141',
    importPath: 'import WETH from 0x1e4aa0b87d10b141',
    vaultType: '@WETH.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'Wrapped Ethereum - EVM-bridged',
    networks: {
      testnet: '0xdfc20aee650fcbdf',
      mainnet: '0x1e4aa0b87d10b141',
    },
  },
  WBTC: {
    name: 'Wrapped Bitcoin',
    symbol: 'WBTC',
    importAddress: '0xdfc20aee650fcbdf',
    importPath: 'import WBTC from 0xdfc20aee650fcbdf',
    vaultType: '@WBTC.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'Wrapped Bitcoin - EVM-bridged',
    networks: {
      testnet: '0xdfc20aee650fcbdf',
    },
  },
  cbBTC: {
    name: 'Coinbase Bitcoin',
    symbol: 'cbBTC',
    importAddress: '0x1e4aa0b87d10b141',
    importPath: 'import cbBTC from 0x1e4aa0b87d10b141',
    vaultType: '@cbBTC.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'Coinbase Bitcoin - EVM-bridged',
    networks: {
      testnet: '0xdfc20aee650fcbdf',
      mainnet: '0x1e4aa0b87d10b141',
    },
  },
};

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
  const address = token.networks[network] || token.networks.mainnet || token.importAddress;
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

  // Additional token imports (beyond FLOW)
  const tokenImports = tokens
    .filter((t) => t.symbol !== 'FLOW') // FLOW already in base
    .map((t) => {
      const address = getTokenAddressForNetwork(t, network);
      return `import ${t.symbol} from ${address}`;
    })
    .join('\n');

  return tokenImports ? `${baseImports}\n${tokenImports}` : baseImports;
}

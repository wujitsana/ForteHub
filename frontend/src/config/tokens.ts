/**
 * Token and Contract Configuration
 *
 * This file contains the hardcoded token information and core contract addresses.
 * It is separated from the logic to make updates easier.
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

export interface CoreContractInfo {
  name: string;
  networks: {
    testnet?: string;
    mainnet?: string;
  };
  description?: string;
}

export const CORE_CONTRACTS: CoreContractInfo[] = [
  {
    name: 'DeFiActions',
    networks: {
      testnet: '0x2ab6f469ee0dfbb6',
      mainnet: '0x92195d814edf9cb0'
    },
    description: 'Primary workflow primitives (sources, sinks, identifiers)'
  },
  {
    name: 'DeFiActionsUtils',
    networks: {
      testnet: '0x2ab6f469ee0dfbb6',
      mainnet: '0x92195d814edf9cb0'
    },
    description: 'Helper utilities for DeFiActions composition'
  },
  {
    name: 'DeFiActionsMathUtils',
    networks: {
      testnet: '0x2ab6f469ee0dfbb6',
      mainnet: '0x92195d814edf9cb0'
    },
    description: 'Optional math helpers (e.g., percentage math)'
  },
  {
    name: 'FungibleTokenConnectors',
    networks: {
      testnet: '0x5a7b9cee9aaf4e4e',
      mainnet: '0x1d9a619393e9fb53'
    },
    description: 'VaultSource/VaultSink wrappers for FungibleToken'
  },
  {
    name: 'BandOracleConnectors',
    networks: {
      testnet: '0x1a9f5d18d096cd7a'
    },
    description: 'Oracle connectors (only when price feeds required)'
  },
  {
    name: 'IncrementFiSwapConnectors',
    networks: {
      testnet: '0x49bae091e5ea16b5'
    },
    description: 'Swap connectors for IncrementFi pools'
  }
];

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
    importPath:
      'import EVMVMBridgedToken_208d09d2a6dd176e3e95b3f0de172a7471c5b2d6 from 0xdfc20aee650fcbdf',
    vaultType: '@EVMVMBridgedToken_208d09d2a6dd176e3e95b3f0de172a7471c5b2d6.Vault',
    vaultTypeNoImport: '@FungibleToken.Vault',
    description: 'Wrapped Bitcoin - EVM-bridged',
    networks: {
      testnet: '0xdfc20aee650fcbdf',
      mainnet: '0x1e4aa0b87d10b141',
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

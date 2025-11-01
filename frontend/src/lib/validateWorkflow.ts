/**
 * Validate that generated workflow code follows best practices
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

export function validateWorkflowCode(sourceCode: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const lowerSource = sourceCode.toLowerCase();

  // Metadata is now provided in JSON response, not in code comments
  // No need to validate for metadata comments in the contract code

  // Check for invalid struct interface usage (common mistake)
  const invalidPatterns = ['{DeFiActions.Source}', '{DeFiActions.Sink}', '{DeFiActions.Swapper}',
                           '{DeFiActions.PriceOracle}', '{DeFiActions.Flasher}', '{DeFiActions.AutoBalancer}'];
  const hasInvalidUsage = invalidPatterns.some(pattern => sourceCode.includes(pattern));

  if (hasInvalidUsage) {
    errors.push('Cannot use {DeFiActions.*} syntax - these are struct interfaces, not resource interfaces. Remove curly braces or use concrete struct types.');
  }

  // Check for JavaScript/library imports (common AI mistake)
  const jsLibraryPatterns = [
    'import FCL',
    'import SDK',
    '@onflow/fcl',
    'import React',
    /\bconst\s+\w+\s*=/,  // Match "const x = "
    /\basync\s+/,         // Match "async "
    /\bawait\s+/          // Match "await "
  ];

  const hasJSImports = jsLibraryPatterns.some(pattern => {
    if (typeof pattern === 'string') {
      return sourceCode.includes(pattern);
    } else {
      return pattern.test(sourceCode);
    }
  });

  if (hasJSImports) {
    errors.push('❌ CRITICAL: Contract contains JavaScript/TypeScript code. This must be pure Cadence smart contract code ONLY. Remove all FCL, SDK, React imports and JavaScript syntax (const, async, await).');
  }

  // Workflows should NOT import FlowTransactionScheduler - that's Manager's responsibility
  if (sourceCode.includes('import FlowTransactionScheduler')) {
    errors.push('❌ Workflow should NOT import FlowTransactionScheduler. Scheduling is handled by ForteHubManager, not individual workflows. Remove this import.');
  }

  // Check for Cadence 1.0 syntax
  if (sourceCode.includes('pub fun') && !sourceCode.includes('access(all)')) {
    warnings.push('Code may be using old Cadence syntax. Should use "access(all)" instead of "pub"');
  }

  // Check for forbidden custom destructors (Cadence 1.0)
  // In Cadence 1.0, you CANNOT define destroy() methods at all
  // The destroy keyword is ONLY for destroy statements: destroy variableName
  // Common patterns to catch:
  // - destroy() { ... }
  // - fun destroy() { ... }
  // - access(all) destroy() { ... }
  // - destroy self.workflows
  const destroyMethodPatterns = [
    /destroy\s*\(\s*\)\s*\{/,  // destroy() {
    /fun\s+destroy\s*\(\s*\)/,  // fun destroy()
    /access\([^)]*\)\s+destroy\s*\(\s*\)/,  // access(all) destroy()
  ];

  const hasDestroyMethod = destroyMethodPatterns.some(pattern => pattern.test(sourceCode));

  if (hasDestroyMethod) {
    errors.push('❌ CRITICAL: Custom destroy() methods are FORBIDDEN in Cadence 1.0. Resources are automatically destroyed when they go out of scope. DO NOT define destroy() methods. If you have cleanup logic, create a separate function: access(all) fun cleanup() { } and call it explicitly.');
  }

  // Also check for "destroy self.fields" pattern which is wrong
  if (/destroy\s+self\.\w+/.test(sourceCode)) {
    errors.push('❌ CRITICAL: Cannot use "destroy self.fieldName" - fields are not resources. Only use destroy on local owned variables. Example: let vault <- withdraw(); destroy vault;');
  }

  // Check for resource implementation
  if (!sourceCode.includes('access(all) resource')) {
    warnings.push('Workflow should be implemented as a resource for proper access control');
  }

  // Provide helpful info
  if (sourceCode.includes('Swapper')) {
    info.push('✓ Uses Swapper Action for token exchanges');
  }
  if (sourceCode.includes('PriceOracle')) {
    info.push('✓ Uses PriceOracle for price data');
  }
  if (sourceCode.includes('emit')) {
    info.push('✓ Emits events for operation tracking');
  }

  // Detect metadata block to help with scheduler validation
  let metadata: any = null;
  const metadataMatch = sourceCode.match(/\/\/\s*UPDATABLE_METADATA_BEGIN([\s\S]*?)\/\/\s*UPDATABLE_METADATA_END/);
  if (metadataMatch) {
    try {
      const cleanMetadata = metadataMatch[1]
        .split('\n')
        .map(line => line.replace(/^\s*\/\//, '').trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanMetadata.startsWith('{') && cleanMetadata.endsWith('}')) {
        metadata = JSON.parse(cleanMetadata);
      }
    } catch {
      warnings.push('Unable to parse metadata block. Ensure JSON between UPDATABLE_METADATA markers is valid.');
    }
  }

  // In the centralized ForteHubManager architecture:
  // - Workflow contains ONLY strategy logic and strategy config fields
  // - executionFrequencySeconds is Manager-only (never in Workflow)
  // - Workflow should NOT have any scheduling fields
  if (/executionFrequencySeconds/.test(sourceCode)) {
    errors.push('❌ Workflow should NOT contain executionFrequencySeconds field. This is managed by ForteHubManager, not the Workflow. Remove this field from the Workflow resource.');
  }

  if (/lastExecutionTime/.test(sourceCode)) {
    errors.push('❌ Workflow should NOT contain lastExecutionTime field. This is managed by ForteHubManager, not the Workflow. Remove this field from the Workflow resource.');
  }

  // Detect common placeholder logic that should be replaced before production
  // Only flag if "TODO" or "Placeholder" appear in actual code, not just comments
  const codeWithoutComments = sourceCode.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\b(placeholder|todo)\b/i.test(codeWithoutComments)) {
    warnings.push('Found placeholder or TODO logic in contract code. Replace with production-ready logic (actual token transfers, swaps, price checks, etc.) before deploying to testnet.');
  }

  // DeFiActions primitives must not be instantiated directly (no constructors on interfaces)
  const forbiddenConstructors = [
    'DeFiActions.Swapper(',
    'DeFiActions.Source(',
    'DeFiActions.Sink(',
    'DeFiActions.PriceOracle(',
    'DeFiActions.AutoBalancer(',
    'DeFiActions.Flasher('
  ];
  if (forbiddenConstructors.some(pattern => sourceCode.includes(pattern))) {
    errors.push('❌ CRITICAL: DeFiActions primitives must be injected via capabilities/structs. Do not call constructors like DeFiActions.Swapper(...). Pass concrete connectors into the workflow instead.');
  }

  const usesPriceOracle = /PriceOracle/.test(sourceCode);
  const hasBandOracleImport = sourceCode.includes('import BandOracleConnectors');
  if (usesPriceOracle && !hasBandOracleImport) {
    warnings.push('Workflow references DeFiActions.PriceOracle but does not import BandOracleConnectors. Ensure a real price oracle connector is injected or remove the price-based logic.');
  }

  const usesSwapper = /Swapper/.test(sourceCode);
  const hasIncrementImport = sourceCode.includes('import IncrementFiSwapConnectors');
  if (usesSwapper && !hasIncrementImport) {
    warnings.push('Workflow references a Swapper but does not import IncrementFiSwapConnectors. Inject a real swap connector (e.g., IncrementFiSwapConnectors.Swapper) instead of using placeholders.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    info
  };
}

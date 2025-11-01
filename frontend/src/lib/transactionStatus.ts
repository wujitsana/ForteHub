/**
 * Transaction Status Checker
 *
 * Verifies that transactions are sealed and checks for errors
 * Uses Flow access node REST API
 */

export interface TransactionResult {
  id: string;
  status: number; // 0=unknown, 1=pending, 2=finalized, 3=executed, 4=sealed
  statusString: string;
  sealed: boolean;
  error?: string;
  errorMessage?: string;
}

const STATUS_NAMES: Record<number, string> = {
  0: 'UNKNOWN',
  1: 'PENDING',
  2: 'FINALIZED',
  3: 'EXECUTED',
  4: 'SEALED',
};

/**
 * Validate transaction ID format
 */
export function isValidTransactionId(txId: string): boolean {
  // Flow transaction IDs are 64-character hex strings
  return /^[a-f0-9]{64}$/.test(txId?.toLowerCase() || '');
}

/**
 * Poll for transaction status until sealed or timeout
 * @param txId Transaction ID to check
 * @param maxAttempts Maximum number of polling attempts (each ~1 second)
 * @param network Network to query (testnet, mainnet, emulator)
 * @returns Transaction result with status and any errors
 */
export async function waitForTransactionSealed(
  txId: string,
  maxAttempts: number = 60,
  network: string = 'testnet'
): Promise<TransactionResult> {
  // Validate transaction ID
  if (!txId || !isValidTransactionId(txId)) {
    console.error('Invalid transaction ID:', txId);
    return {
      id: txId || 'unknown',
      status: 0,
      statusString: 'INVALID',
      sealed: false,
      error: `Invalid transaction ID format: ${txId}. Expected 64-character hex string.`,
    };
  }

  const accessNode = getAccessNodeUrl(network);
  let attempts = 0;
  let first404Attempt = -1;

  console.log(`Starting transaction polling for ${txId} on ${network}...`);

  while (attempts < maxAttempts) {
    try {
      console.log(`[Attempt ${attempts + 1}/${maxAttempts}] Checking transaction status...`);
      const response = await fetch(`${accessNode}/v1/transactions/${txId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Transaction not found yet - this is normal in first few attempts
          // The access node needs time to index the transaction
          if (first404Attempt === -1) {
            first404Attempt = attempts;
            console.log(`[Attempt ${attempts + 1}] Transaction not yet indexed (404 - normal on first attempts)`);
          }

          attempts++;

          // After 10 attempts (10 seconds), start warning
          if (attempts > 10) {
            console.warn(`Transaction still not found after ${attempts} seconds. Continuing to poll...`);
          }

          // Exponential backoff: increase delay as we wait longer
          const delayMs = attempts < 5 ? 1000 : attempts < 15 ? 2000 : 3000;
          await delay(delayMs);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const status = data.status || 0;
      const statusString = STATUS_NAMES[status] || 'UNKNOWN';

      console.log(`Transaction found! Status: ${statusString} (${status})`);

      // Check for execution errors IMMEDIATELY (don't wait for sealed)
      // Check both nested result errors and top-level errors
      const executionError = data.result?.error || data.result?.errorMessage || data.error;
      if (executionError) {
        console.error('Transaction execution error detected:', executionError);
        return {
          id: txId,
          status,
          statusString,
          sealed: status >= 4,
          error: executionError || 'Unknown error in transaction result',
          errorMessage: data.result?.errorMessage || data.errorMessage,
        };
      }

      // Check if sealed (status >= 4)
      if (status >= 4) {
        // Transaction is sealed successfully
        return {
          id: txId,
          status,
          statusString,
          sealed: true,
          error: undefined,
          errorMessage: undefined,
        };
      }

      // Not sealed yet, try again
      console.log(`Transaction status is ${statusString}, waiting for SEALED...`);
      attempts++;
      if (attempts < maxAttempts) {
        await delay(2000);
      }
    } catch (error) {
      console.error(`Error checking transaction status (attempt ${attempts + 1}):`, error);
      attempts++;
      await delay(2000);
    }
  }

  // Timeout after max attempts
  return {
    id: txId,
    status: 0,
    statusString: 'TIMEOUT',
    sealed: false,
    error: `Transaction did not seal within ${maxAttempts} seconds. It may still be processing. Check Flowscan: https://${network === 'testnet' ? 'testnet.' : ''}flowscan.io/transaction/${txId}`,
  };
}

/**
 * Get transaction with detailed error information
 * @param txId Transaction ID
 * @param network Network to query
 * @returns Full transaction data including error details
 */
export async function getTransactionWithError(
  txId: string,
  network: string = 'testnet'
): Promise<any> {
  const accessNode = getAccessNodeUrl(network);

  try {
    const response = await fetch(`${accessNode}/v1/transactions/${txId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching transaction:', error);
    throw error;
  }
}

/**
 * Extract error message from transaction result
 * @param txData Transaction data from Flow API
 * @returns Formatted error message or null if no error
 */
export function extractTransactionError(txData: any): string | null {
  if (!txData) return null;

  // Check result.error
  if (txData.result?.error) {
    return txData.result.error;
  }

  // Check result.errorMessage
  if (txData.result?.errorMessage) {
    return txData.result.errorMessage;
  }

  // Check top-level error
  if (txData.error) {
    return txData.error;
  }

  // Check events for ContractDeploymentFailed or similar
  if (txData.result?.events) {
    const failedEvent = txData.result.events.find((e: any) =>
      e.type?.includes('ContractDeploymentFailed') || e.type?.includes('Error')
    );
    if (failedEvent) {
      return `Contract deployment error: ${failedEvent.data?.message || 'Unknown'}`;
    }
  }

  return null;
}

/**
 * Helper to get the correct access node URL
 */
function getAccessNodeUrl(network: string): string {
  switch (network.toLowerCase()) {
    case 'testnet':
      return 'https://rest-testnet.onflow.org';
    case 'mainnet':
      return 'https://rest-mainnet.onflow.org';
    case 'emulator':
      return 'http://localhost:8080';
    default:
      return 'https://rest-testnet.onflow.org';
  }
}

/**
 * Simple delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

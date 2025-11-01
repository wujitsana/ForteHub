import crypto from 'crypto';

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

/**
 * Upload workflow source code to IPFS using Pinata API
 */
export async function uploadWorkflowToIPFS(
  sourceCode: string,
  metadata: {
    name: string;
    creator: string;
    category: string;
    description: string;
  }
): Promise<{
  cid: string;
  url: string;
  gatewayUrl: string;
  hash: string;
}> {
  if (!PINATA_JWT) {
    throw new Error('PINATA_JWT not configured. Please add NEXT_PUBLIC_PINATA_JWT to .env.local');
  }

  // Compute SHA-256 hash for verification
  const hash = crypto.createHash('sha256').update(sourceCode).digest('hex');

  try {
    // Upload to Pinata as a file (preserves formatting)
    const blob = new Blob([sourceCode], { type: 'text/plain' });
    const formData = new FormData();

    // Use simple filename without spaces or special characters
    const cleanName = metadata.name.replace(/[^a-zA-Z0-9]/g, '');
    formData.append('file', blob, `${cleanName}.cdc`);

    // Add metadata
    const pinataMetadata = JSON.stringify({
      name: `${cleanName}.cdc`,
      keyvalues: {
        workflowName: metadata.name,  // Store full name in metadata
        creator: metadata.creator,
        category: metadata.category,
        description: metadata.description,
        type: 'workflow-contract'
      }
    });
    formData.append('pinataMetadata', pinataMetadata);

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Pinata API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();

    return {
      cid: result.IpfsHash,
      url: `ipfs://${result.IpfsHash}`,
      gatewayUrl: `https://${PINATA_GATEWAY}/ipfs/${result.IpfsHash}`,
      hash
    };
  } catch (error) {
    console.error('Pinata upload error:', error);
    throw new Error(`Failed to upload to IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch workflow source code from IPFS
 */
export async function fetchWorkflowFromIPFS(cid: string): Promise<string> {
  const response = await fetch(`https://${PINATA_GATEWAY}/ipfs/${cid}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
  }

  // Always fetch as plain text to preserve formatting
  const sourceCode = await response.text();

  // If the response looks like escaped JSON string (from old uploads), unescape it
  if (sourceCode.startsWith('"') && sourceCode.endsWith('"')) {
    try {
      return JSON.parse(sourceCode);
    } catch {
      // If parsing fails, return as-is
      return sourceCode;
    }
  }

  return sourceCode;
}

/**
 * Verify workflow source code matches on-chain hash
 */
export async function verifyWorkflowHash(
  cid: string,
  expectedHash: string
): Promise<boolean> {
  const sourceCode = await fetchWorkflowFromIPFS(cid);
  const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
  return actualHash === expectedHash;
}

/**
 * Compute SHA-256 hash of source code
 */
export function computeSourceHash(sourceCode: string): string {
  return crypto.createHash('sha256').update(sourceCode).digest('hex');
}

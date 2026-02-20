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

    // Request CIDv1 (bafy...) format - latest IPFS standard
    // CIDv1 is more future-proof than CIDv0 (Qm...)
    const options = JSON.stringify({
      cidVersion: 1
    });
    formData.append('pinataOptions', options);

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

    // Pinata returns IpfsHash which is now CIDv1 (bafy...) due to cidVersion: 1
    const cid = result.IpfsHash;

    return {
      cid,
      url: `ipfs://${cid}`,
      gatewayUrl: `https://${PINATA_GATEWAY}/ipfs/${cid}`,
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

/**
 * Decode CIDv1 (bafy...) to extract the SHA-256 hash
 *
 * CIDv1 structure:
 * - First 4 chars: "bafy" = base32 encoded "01" (CIDv1 multicodec version)
 * - Remaining: base32-encoded multihash (hash type + length + hash data)
 *
 * Base32 alphabet: a-z, 2-7 (RFC 4648)
 */
export function decodeCIDv1ToHash(cid: string): string {
  if (!cid.startsWith('bafy')) {
    throw new Error(`Invalid CIDv1: must start with "bafy", got "${cid.substring(0, 4)}"`);
  }

  try {
    // Base32 alphabet (RFC 4648)
    const base32Alphabet = 'abcdefghijklmnopqrstuvwxyz234567';

    // Remove "bafy" prefix and decode the rest
    const encoded = cid.substring(4);
    let bits = '';

    // Convert base32 to binary
    for (const char of encoded) {
      const index = base32Alphabet.indexOf(char.toLowerCase());
      if (index === -1) {
        throw new Error(`Invalid base32 character: ${char}`);
      }
      bits += index.toString(2).padStart(5, '0');
    }

    // CIDv1 multicodec structure:
    // First byte: 0x12 (SHA2_256 hash type in multihash)
    // Second byte: 0x20 (hash length: 32 bytes)
    // Remaining bytes: the SHA-256 hash (256 bits)

    // Skip first bits to align: base32 encodes in 5-bit chunks
    // CIDv1 multicodec takes first 8 bits (hash type), then 8 bits (length), then 256 bits (hash)
    const byteData = [];
    for (let i = 0; i < bits.length; i += 8) {
      const byte = bits.substring(i, i + 8);
      if (byte.length === 8) {
        byteData.push(parseInt(byte, 2));
      }
    }

    // Extract hash data (skip first 2 bytes: hash type 0x12 and length 0x20)
    const hashBytes = byteData.slice(2, 34);

    if (hashBytes.length !== 32) {
      throw new Error(`Expected 32 bytes of hash data, got ${hashBytes.length}`);
    }

    // Convert bytes to hex string
    return hashBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    throw new Error(`Failed to decode CIDv1: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify that IPFS CIDv1 hash matches the computed SHA-256 hash
 * This ensures IPFS data integrity
 */
export function verifyCIDv1Hash(cid: string, expectedHash: string): boolean {
  try {
    const cidHash = decodeCIDv1ToHash(cid);
    return cidHash === expectedHash;
  } catch (error) {
    console.error('CIDv1 verification failed:', error);
    return false;
  }
}

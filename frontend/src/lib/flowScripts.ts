/**
 * Workflow Data Transformation Utilities
 *
 * Pure utility functions for transforming and parsing workflow data.
 * These do NOT interact with blockchain - just data transformation.
 *
 * NOTE: FORTEHUB_REGISTRY env var used directly in Cadence strings.
 * FCL configuration handled by FlowProvider in FlowProviderWrapper.
 * Blockchain queries use useFlowQuery hook directly in components.
 */

import { WorkflowInfo, WorkflowMetadata } from '@/types/interfaces';

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');
const FORTEHUB_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_FORTEHUB_MARKET_ADDRESS || '0xbd4c3996265ed830').replace('0X', '0x');

const emptyMetadata: WorkflowMetadata = {
  assets: [],
  configFields: [],
  defaultParameters: {},
  notes: {}
};

export const parseMetadataJSON = (metadataJSON?: string | null): WorkflowMetadata => {
  if (!metadataJSON || metadataJSON.length === 0) {
    return emptyMetadata;
  }

  try {
    const parsed = JSON.parse(metadataJSON);
    return {
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      configFields: Array.isArray(parsed.configFields) ? parsed.configFields : [],
      defaultParameters:
        typeof parsed.defaultParameters === 'object' && parsed.defaultParameters !== null
          ? parsed.defaultParameters
          : {},
      notes: typeof parsed.notes === 'object' && parsed.notes !== null ? parsed.notes : {},
      isSchedulable: parsed.isSchedulable,
      defaultFrequency: parsed.defaultFrequency
    };
  } catch (error) {
    console.warn('Failed to parse metadata JSON:', metadataJSON, error);
    return emptyMetadata;
  }
};

export const metadataToVarMap = (metadata: WorkflowMetadata): { [key: string]: string } => {
  const map: { [key: string]: string } = {};
  metadata.configFields.forEach(field => {
    if (field && field.name) {
      map[field.name] = field.fieldType || 'String';
    }
  });
  return map;
};

export const normalizeCadenceDictionary = (raw: any): { [key: string]: any } => {
  if (!raw) return {};

  if (Array.isArray(raw)) {
    const entries: { [key: string]: any } = {};
    raw.forEach((item: any) => {
      const key =
        typeof item?.key === 'string'
          ? item.key
          : item?.key?.value;
      if (!key) {
        return;
      }
      const value =
        item?.value?.value !== undefined ? item.value.value : item?.value ?? null;
      entries[key] = value;
    });
    return entries;
  }

  if (typeof raw === 'object') {
    return raw as { [key: string]: any };
  }

  return {};
};

const decodeOptionalNumber = (value: any): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    if (value.value !== undefined) {
      const parsed = Number(value.value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (value.Some !== undefined) {
      const parsed = Number(value.Some);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
};

export const decodeCadenceNumber = (value: any): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && value !== null && value.value !== undefined) {
    const parsed = Number(value.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

interface NormalizeOptions {
  cloneCount?: number;
  forkCount?: number;
  updatableVariables?: { [key: string]: string };
}

export const normalizeWorkflowInfo = (raw: any, options: NormalizeOptions = {}): WorkflowInfo => {
  if (!raw) {
    throw new Error('Cannot normalize empty workflow info');
  }

  const metadataJSON =
    typeof raw.metadataJSON === 'string' && raw.metadataJSON.length > 0
      ? raw.metadataJSON
      : '{}';
  const metadata = parseMetadataJSON(metadataJSON);
  const configDefaults =
    raw.configDefaults ? normalizeCadenceDictionary(raw.configDefaults) : {};

  const createdAt = decodeCadenceNumber(raw.createdAt);
  const parentWorkflowId = decodeOptionalNumber(raw.parentWorkflowId);

  return {
    workflowId: Number(raw.workflowId ?? 0),
    creator: raw.creator || '0x0000000000000000',
    name: raw.name || 'Unnamed Workflow',
    category: raw.category || 'yield',
    description: raw.description || 'No description provided',
    sourceCodeIPFS: raw.sourceCodeIPFS || '',
    sourceCodeHash: raw.sourceCodeHash || '',
    isListed: raw.isListed ?? true,
    deploymentType: raw.deploymentType || 'wallet',
    createdAt,
    contractName: raw.contractName || 'Unknown',
    metadataJSON,
    metadata,
    configDefaults,
    parentWorkflowId,
    updatableVariables: options.updatableVariables,
    cloneCount: options.cloneCount ?? 0,
    forkCount: options.forkCount ?? 0,
    clonesLocked: Boolean(raw.clonesLocked),
    price: raw.price ? raw.price.toString() : undefined,
    imageIPFS: raw.imageIPFS || undefined
  };
};

/**
 * Check if creator already has a workflow with this name
 * Returns the existing workflow name if found, null otherwise
 *
 * Used in create page to warn users about duplicate workflow names
 * This is an async helper since it's called from event handlers, not in render
 */
export const checkWorkflowNameExists = async (creator: string, name: string): Promise<string | null> => {
  const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');
  const FORTEHUB_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_FORTEHUB_MARKET_ADDRESS || '0xbd4c3996265ed830').replace('0X', '0x');

  try {
    // Dynamic import to get fcl - only when needed
    const fcl = await import('@onflow/fcl');

    // Get all workflows by creator
    const response = await fcl.default.query({
      cadence: `
        import ForteHub from ${FORTEHUB_REGISTRY}

        access(all) fun main(creator: Address): [UInt64] {
          return ForteHub.getWorkflowsByCreator(creator: creator)
        }
      `,
      args: (arg: any, t: any) => [arg(creator, t.Address)]
    });

    if (!Array.isArray(response) || response.length === 0) {
      return null;
    }

    // For each workflow ID, check if the name matches
    for (const workflowId of response) {
      const id = typeof workflowId === 'string' ? workflowId : workflowId?.toString?.();
      if (id) {
        // Query each workflow's info
        const workflowInfo = await fcl.default.query({
          cadence: `
            import ForteHub from ${FORTEHUB_REGISTRY}

            access(all) fun main(id: UInt64): ForteHub.WorkflowInfo? {
              return ForteHub.getWorkflowInfo(workflowId: id)
            }
          `,
          args: (arg: any, t: any) => [arg(id, t.UInt64)]
        });

        if (workflowInfo && workflowInfo.name === name) {
          return workflowInfo.name;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn('Failed to check workflow name existence:', error);
    return null;
  }
};

// Marketplace Scripts

export const getListingDetailsScript = `
import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

access(all) fun main(sellerAddress: Address, listingId: UInt64): ForteHubMarket.ListingDetails? {
    let marketCollection = getAccount(sellerAddress)
        .capabilities.get<&ForteHubMarket.ListingCollection>(/public/fortehubMarketCollection)
        .borrow()
        
    if marketCollection == nil {
        return nil
    }

    return marketCollection!.borrowListingDetails(listingId: listingId)
}
`;

export const getSellerListingsScript = `
import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

access(all) fun main(sellerAddress: Address): [UInt64] {
    let marketCollection = getAccount(sellerAddress)
        .capabilities.get<&ForteHubMarket.ListingCollection>(/public/fortehubMarketCollection)
        .borrow()
        
    if marketCollection == nil {
        return []
    }

    return marketCollection!.getActiveListingIds()
}
`;

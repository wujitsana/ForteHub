`use client`;

import * as fcl from '@onflow/fcl';
import { WorkflowInfo, WorkflowMetadata } from '@/types/interfaces';

const DEFAULT_ACCESS_NODE = 'https://rest-testnet.onflow.org';
const DEFAULT_DISCOVERY_WALLET = 'https://fcl-discovery.onflow.org/testnet/authn';
const DEFAULT_DISCOVERY_ENDPOINT = 'https://fcl-discovery.onflow.org/api/testnet/authn';
const DEFAULT_APP_TITLE = 'ForteHub';
const DEFAULT_APP_DESCRIPTION = 'Build & Share DeFi Workflows';
const DEFAULT_APP_URL = 'https://fortehub.io';

const ACCESS_NODE =
  process.env.NEXT_PUBLIC_FLOW_ACCESS_NODE || DEFAULT_ACCESS_NODE;
const DISCOVERY_WALLET =
  process.env.NEXT_PUBLIC_FLOW_DISCOVERY_WALLET || DEFAULT_DISCOVERY_WALLET;
const DISCOVERY_ENDPOINT =
  process.env.NEXT_PUBLIC_FLOW_DISCOVERY_AUTHN || DEFAULT_DISCOVERY_ENDPOINT;
const FLOW_NETWORK = process.env.NEXT_PUBLIC_FLOW_NETWORK || 'testnet';
const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || DEFAULT_APP_TITLE;
const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION || DEFAULT_APP_DESCRIPTION;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;

let fclConfigured = false;
const ensureFclConfigured = () => {
  if (fclConfigured) return;

  fcl
    .config()
    .put('accessNode.api', ACCESS_NODE)
    .put('discovery.wallet', DISCOVERY_WALLET)
    .put('discovery.authn.endpoint', DISCOVERY_ENDPOINT)
    .put('flow.network', FLOW_NETWORK)
    .put('app.detail.title', APP_TITLE)
    .put('app.detail.description', APP_DESCRIPTION)
    .put('app.detail.url', APP_URL);

  fclConfigured = true;
};

ensureFclConfigured();

export const FORTEHUB_REGISTRY =
  process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xf8d6e0586b0a20c7';

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

export const metadataToVarMap = (metadata: WorkflowMetadata): {[key: string]: string} => {
  const map: {[key: string]: string} = {};
  metadata.configFields.forEach(field => {
    if (field && field.name) {
      map[field.name] = field.fieldType || 'String';
    }
  });
  return map;
};

export const normalizeCadenceDictionary = (raw: any): {[key: string]: string} => {
  if (!raw) return {};

  if (Array.isArray(raw)) {
    const entries: {[key: string]: string} = {};
    raw.forEach((item: any) => {
      const key = item?.key;
      const value = item?.value;
      if (key && typeof key === 'string' && typeof value === 'string') {
        entries[key] = value;
      } else if (key?.value && typeof key.value === 'string') {
        entries[key.value] = typeof value === 'string' ? value : value?.value ?? '';
      }
    });
    return entries;
  }

  if (typeof raw === 'object') {
    return raw as {[key: string]: string};
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

const decodeCadenceNumber = (value: any): number => {
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
  updatableVariables?: {[key: string]: string};
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
    parentWorkflowId,
    updatableVariables: options.updatableVariables,
    cloneCount: options.cloneCount ?? 0,
    forkCount: options.forkCount ?? 0
  };
};

export const fetchWorkflowInfo = async (workflowId: number | string) => {
  const response = await fcl.query({
    cadence: `
      import ForteHubRegistry from ${FORTEHUB_REGISTRY}

      access(all) fun main(id: UInt64): ForteHubRegistry.WorkflowInfo? {
        return ForteHubRegistry.getWorkflowInfo(workflowId: id)
      }
    `,
    args: (arg, t) => [arg(workflowId.toString(), t.UInt64)]
  });

  return response || null;
};

export const fetchCloneCount = async (workflowId: number | string): Promise<number> => {
  const response = await fcl.query({
    cadence: `
      import ForteHubRegistry from ${FORTEHUB_REGISTRY}

      access(all) fun main(id: UInt64): UInt64 {
        return ForteHubRegistry.getCloneCount(workflowId: id)
      }
    `,
    args: (arg, t) => [arg(workflowId.toString(), t.UInt64)]
  });

  const count = decodeCadenceNumber(response);
  return Number.isFinite(count) ? count : 0;
};

export const fetchForkCount = async (workflowId: number | string): Promise<number> => {
  const response = await fcl.query({
    cadence: `
      import ForteHubRegistry from ${FORTEHUB_REGISTRY}

      access(all) fun main(id: UInt64): UInt64 {
        return ForteHubRegistry.getForkCount(workflowId: id)
      }
    `,
    args: (arg, t) => [arg(workflowId.toString(), t.UInt64)]
  });

  const count = decodeCadenceNumber(response);
  return Number.isFinite(count) ? count : 0;
};

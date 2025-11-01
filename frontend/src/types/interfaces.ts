export interface WorkflowMetadataField {
  name: string;
  fieldType: string;
  label: string;
  description?: string;
  min?: string | null;
  max?: string | null;
  rules?: string[] | null;
}


export interface MetadataAsset {
  symbol: string;
  address: string;
  notes?: Record<string, string>;
}

export interface MetadataConfigField {
  name: string;
  fieldType: string;
  label: string;
  description?: string;
  min?: string | null;
  max?: string | null;
  rules?: string[] | null;
}

export interface WorkflowMetadata {
  assets: MetadataAsset[];
  configFields: MetadataConfigField[];
  defaultParameters: Record<string, string>;
  notes: Record<string, string>;
  isSchedulable?: boolean;          // Whether workflow can be autonomously scheduled
  defaultFrequency?: string;        // Suggested frequency in seconds (e.g., "86400.0")
}


export interface WorkflowInfo {
  workflowId: number;
  creator: string;
  name: string;
  category: string;
  description: string;
  sourceCodeIPFS: string;
  sourceCodeHash: string;
  isListed: boolean;
  deploymentType: string;
  createdAt: number;
  contractName: string;
  metadataJSON?: string;
  parentWorkflowId?: number | null;
  metadata?: WorkflowMetadata;
  updatableVariables?: {[key: string]: string};
  cloneCount: number;
  forkCount: number;
}


export interface TokenBalance {
  symbol: string;
  balance: string;
  name: string;
}

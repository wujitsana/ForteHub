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
  category?: string;
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
  configDefaults?: Record<string, any>;
  parentWorkflowId?: number | null;
  metadata?: WorkflowMetadata;
  updatableVariables?: { [key: string]: string };
  cloneCount: number;
  forkCount: number;
  clonesLocked?: boolean;
  price?: string;
  imageIPFS?: string;
}


export interface TokenBalance {
  symbol: string;
  balance: string;
  name: string;
}

export interface MarketplaceListingDetails {
  listingId: number;
  workflowId: number;
  price: string;
  seller: string;
}

export interface MarketplaceEvent {
  type: 'listed' | 'unlisted' | 'purchased' | 'priceUpdated';
  listingId: number;
  workflowId: number;
  price?: string;
  seller: string;
  buyer?: string;
  timestamp: number;
}

export interface WorkflowWithListing extends WorkflowInfo {
  listing?: MarketplaceListingDetails;
  listedCount?: number;
  totalSalesCount?: number;
}

export interface MarketplaceListing {
  listingId: number;
  workflowId: number;
  price: number;
  seller: string;
  active: boolean;
  workflowInfo: WorkflowInfo | null;
  platformFeePercent?: number;
}

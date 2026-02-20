/**
 * Update Metadata Transaction Generator
 *
 * Allows workflow creators to update workflow metadata (name, description, config fields)
 * in ForteHubRegistry without redeploying the contract.
 *
 * This is called when a creator wants to:
 * 1. Change the workflow name or description
 * 2. Update configurable field defaults
 * 3. Propagate changes to future cloners via WorkflowMetadataUpdated event
 *
 * Architecture Notes:
 * - Only the creator can update metadata (verified on-chain)
 * - Updates are immediate on-chain
 * - WorkflowMetadataUpdated event notifies off-chain indexers
 * - Future cloners get updated defaults from Registry
 * - Existing clones keep their original snapshot (frozen config)
 */

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');

export const UPDATE_METADATA_TRANSACTION = `
import ForteHub from ${FORTEHUB_REGISTRY}

transaction(
    workflowId: UInt64,
    name: String,
    description: String,
    metadataJSON: String
) {
    prepare(signer: auth(BorrowValue) &Account) {
        // No special authorization needed - registry will verify creator
    }

    execute {
        // Update metadata in ForteHub
        // Registry function will verify that signer is the workflow creator
        ForteHub.updateWorkflowMetadata(
            workflowId: workflowId,
            creator: signer.address,
            name: name,
            description: description,
            newMetadataJSON: metadataJSON
        )

        log("Workflow metadata updated for ID: ".concat(workflowId.toString()))
    }
}
`;

/**
 * Builds arguments for the update metadata transaction
 *
 * @param workflowId - The workflow ID to update
 * @param name - New workflow name
 * @param description - New workflow description
 * @param metadataJSON - Updated metadata JSON (config fields schema)
 * @param arg - FCL arg function
 * @param t - FCL type function
 * @returns Array of transaction arguments
 */
export function buildUpdateMetadataArgs(
  workflowId: string,
  name: string,
  description: string,
  metadataJSON: string,
  arg: any,
  t: any
): any[] {
  // Validate inputs
  const requiredFields = [
    { name: 'workflowId', value: workflowId },
    { name: 'name', value: name },
    { name: 'description', value: description },
    { name: 'metadataJSON', value: metadataJSON }
  ];

  for (const { name: fieldName, value } of requiredFields) {
    if (value === null || value === undefined || value === '') {
      console.error(`Invalid argument: ${fieldName} = ${value}`);
      throw new Error(`Update metadata argument '${fieldName}' cannot be null, undefined, or empty`);
    }
  }

  // Parse workflowId to UInt64
  const workflowIdNum = BigInt(workflowId);

  // Ensure metadataJSON is valid
  let normalizedMetadata = metadataJSON.trim();
  if (!normalizedMetadata) {
    normalizedMetadata = '{}';
  }

  // Validate it's valid JSON
  try {
    JSON.parse(normalizedMetadata);
  } catch (e) {
    throw new Error(`metadataJSON is not valid JSON: ${e}`);
  }

  return [
    arg(workflowIdNum.toString(), t.UInt64),
    arg(name, t.String),
    arg(description, t.String),
    arg(normalizedMetadata, t.String)
  ];
}

/**
 * Extract metadata updates from form inputs
 *
 * @param metadata - Current workflow metadata
 * @param updates - Updated fields (name, description, configFields)
 * @returns Updated metadata JSON string
 */
export function buildUpdatedMetadataJSON(
  metadata: {
    configFields?: Array<{
      name: string;
      fieldType: string;
      label: string;
      description?: string;
      default?: string;
      min?: string;
      max?: string;
    }>;
    [key: string]: any;
  },
  updates: {
    configFields?: typeof metadata.configFields;
  }
): string {
  const updated = {
    ...metadata,
    ...updates
  };

  return JSON.stringify(updated);
}

/**
 * Validate metadata updates
 *
 * @param name - New name
 * @param description - New description
 * @returns Object with validation errors, empty if valid
 */
export function validateMetadataUpdates(
  name: string,
  description: string
): { name?: string; description?: string } {
  const errors: { name?: string; description?: string } = {};

  if (!name || name.trim().length === 0) {
    errors.name = 'Workflow name cannot be empty';
  } else if (name.length > 100) {
    errors.name = 'Workflow name must be less than 100 characters';
  }

  if (!description || description.trim().length === 0) {
    errors.description = 'Workflow description cannot be empty';
  } else if (description.length > 500) {
    errors.description = 'Workflow description must be less than 500 characters';
  }

  return errors;
}

/**
 * Validate config field updates
 *
 * @param configFields - Updated config fields
 * @returns Array of validation error messages
 */
export function validateConfigFieldUpdates(
  configFields: Array<{
    name?: string;
    fieldType?: string;
    label?: string;
    default?: string;
    min?: string;
    max?: string;
  }>
): string[] {
  const errors: string[] = [];

  if (!Array.isArray(configFields)) {
    errors.push('configFields must be an array');
    return errors;
  }

  for (let i = 0; i < configFields.length; i++) {
    const field = configFields[i];

    if (!field.name || field.name.trim().length === 0) {
      errors.push(`Field ${i}: name is required`);
    }

    if (!field.fieldType) {
      errors.push(`Field ${i}: fieldType is required`);
    }

    if (!field.label || field.label.trim().length === 0) {
      errors.push(`Field ${i}: label is required`);
    }

    if (field.default !== undefined && field.default !== null) {
      // Validate default value matches type
      try {
        if (field.fieldType === 'UFix64' || field.fieldType === 'UInt64') {
          parseFloat(field.default);
        }
      } catch (e) {
        errors.push(`Field ${i}: default value '${field.default}' is invalid for type ${field.fieldType}`);
      }
    }
  }

  return errors;
}

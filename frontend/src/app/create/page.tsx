'use client';

import { useState, useEffect, useMemo, useRef, useCallback, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { WorkflowMetadata, WorkflowMetadataField, MetadataAsset} from '@/types/interfaces';
import { uploadWorkflowToIPFS, verifyCIDv1Hash } from '@/services/ipfs.service';
import { buildWorkflowPrompt } from '@/lib/agentPrompt';
import { validateWorkflowCode } from '@/lib/validateWorkflow';
import { sanitizeCadenceCode } from '@/lib/sanitizeCadence';
import { stripCadenceComments } from '@/lib/stripCadenceComments';
import { DEPLOY_WORKFLOW_TRANSACTION, buildDeploymentArgs, extractVaultSetupInfo } from '@/lib/deploymentTransaction';
import { useFlowCurrentUser, useFlowQuery, Connect, TransactionDialog, TransactionButton } from '@onflow/react-sdk';
import { Copy, Check, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { checkWorkflowNameExists } from '@/lib/flowScripts';
import { updateDescriptionWithValues } from '@/lib/updateDescriptionWithValues';
import { GenerationMethodSelector, GenerationOption, GenerationMode } from '@/components/create/GenerationMethodSelector';
import { OpenRouterSettings, OpenRouterModelInfo } from '@/components/create/OpenRouterSettings';
import { AnthropicSettings } from '@/components/create/AnthropicSettings';
import { OpenAISettings } from '@/components/create/OpenAISettings';
import { GenerationProgressModal } from '@/components/create/GenerationProgressModal';

type TransactionConfig = ComponentProps<typeof TransactionButton>['transaction'];

function summarizeFlowError(raw?: string | null): { summary: string; detail?: string } {
  if (!raw) {
    return { summary: 'Transaction failed. Check Flowscan for details.' };
  }

  const normalized = raw.trim();
  if (!normalized) {
    return { summary: 'Transaction failed. Check Flowscan for details.' };
  }

  let summary = normalized;

  if (/cannot find declaration/i.test(normalized)) {
    summary = 'Flow could not find one of the imported contracts. Verify the generated imports (for example, WBTC may be exported under a different contract name).';
  } else if (/cannot deploy invalid contract/i.test(normalized)) {
    summary = 'Flow rejected the contract deployment. Review the error details below for missing imports or syntax issues.';
  } else if (/execution failed/i.test(normalized) && /error:/.test(normalized)) {
    summary = 'Transaction execution failed. See the detailed error message below for the exact Cadence runtime issue.';
  }

  return { summary, detail: normalized };
}

export default function CreateWorkflowPage() {
  const router = useRouter();
  const [strategy, setStrategy] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [isListed, setIsListed] = useState(true);
  const [clonePrice, setClonePrice] = useState('0');
  const [imageIPFS, setImageIPFS] = useState('https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq');
  const [isPreparingDeployment, setIsPreparingDeployment] = useState(false);
  const [preparationStep, setPreparationStep] = useState<'ipfs' | 'transaction' | null>(null);

  const { user, isLoading: isUserLoading } = useFlowCurrentUser();
  const userAddress = user?.addr || null;
  const [copied, setCopied] = useState(false);
  const [validation, setValidation] = useState<ReturnType<typeof validateWorkflowCode> | null>(null);
  const [statusMessage, setStatusMessage] = useState<{type: 'success' | 'error' | 'info'; text: string} | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewName, setReviewName] = useState('');
  const [reviewDescription, setReviewDescription] = useState('');
  const [reviewErrors, setReviewErrors] = useState<{name?: string; description?: string}>({});
  const [nameCheck, setNameCheck] = useState<{conflict: boolean; suggestion?: string} | null>(null);
  const [checkingName, setCheckingName] = useState(false);
  const [cachedWorkflowNames, setCachedWorkflowNames] = useState<string[] | null>(null);
  const [responseMetadata, setResponseMetadata] = useState<WorkflowMetadata | null>(null);
  const [pendingTransaction, setPendingTransaction] = useState<TransactionConfig | null>(null);
  const [isDeploymentPromptOpen, setIsDeploymentPromptOpen] = useState(false);
  const [pendingDeploymentDetails, setPendingDeploymentDetails] = useState<{ workflowName: string; contractName: string } | null>(null);
  const [deploymentDialogTxId, setDeploymentDialogTxId] = useState<string | null>(null);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [creationMode, setCreationMode] = useState<GenerationMode>('manual');
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSummary, setApiSummary] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [suggestedStrategy, setSuggestedStrategy] = useState<string | null>(null);
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [rememberOpenRouterKey, setRememberOpenRouterKey] = useState(false);
  const [openRouterModel, setOpenRouterModel] = useState('x/grok-1');
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModelInfo[]>([]);
  const [modelSortAsc, setModelSortAsc] = useState(true);
  const [anthropicModels, setAnthropicModels] = useState<Array<{ id: string; name?: string; description?: string }>>([]);
  const [openAIModels, setOpenAIModels] = useState<Array<{ id: string; name?: string; description?: string }>>([]);
  const [loadingModelList, setLoadingModelList] = useState(false);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [rememberAnthropicKey, setRememberAnthropicKey] = useState(false);
  const [anthropicModel, setAnthropicModel] = useState('claude-3-5-sonnet-20240620');
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [rememberOpenAIApiKey, setRememberOpenAIApiKey] = useState(false);
  const [openAIModel, setOpenAIModel] = useState('gpt-4o-mini');
  const [isReviewCodeOpen, setIsReviewCodeOpen] = useState(false);
  const [isDescriptionManuallyEdited, setIsDescriptionManuallyEdited] = useState(false);
  const hasUserInteractedRef = useRef(false);

const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);
const [generationProviderLabel, setGenerationProviderLabel] = useState<string>('');
const [generationModalNote, setGenerationModalNote] = useState<string | null>(null);
const [generationStrategyPreview, setGenerationStrategyPreview] = useState<string>('');
const generationCancelledRef = useRef(false);
const deploymentCancelledRef = useRef(false);
  const [metadataOverrides, setMetadataOverrides] = useState<{
    defaultParameters: Record<string, string>;
    defaultFrequency?: string;
    isSchedulable?: boolean;
  }>({
    defaultParameters: {},
    defaultFrequency: undefined,
    isSchedulable: undefined
  });
  const [lastLLMResponse, setLastLLMResponse] = useState<string | null>(null);

  const sortedOpenRouterModels = useMemo(
    () => sortOpenRouterModels(openRouterModels, modelSortAsc),
    [openRouterModels, modelSortAsc]
  );

  const derivedMetadata = useMemo(() => {
    return buildMetadataFromSource(sourceCode, responseMetadata || undefined, {
      defaultParameters: metadataOverrides.defaultParameters,
      defaultFrequency: metadataOverrides.defaultFrequency,
      isSchedulable: metadataOverrides.isSchedulable
    });
  }, [sourceCode, responseMetadata, metadataOverrides]);

  // User subscription handled by useCurrentUser hook

  useEffect(() => {
    setCachedWorkflowNames(null);
  }, [userAddress]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Clear suggested strategy when user manually edits the strategy
  useEffect(() => {
    setSuggestedStrategy(null);
  }, [strategy]);

  useEffect(() => {
    setHasGenerated(false);
  }, [creationMode]);

  useEffect(() => {
    if (!responseMetadata) {
      setMetadataOverrides({
        defaultParameters: {},
        defaultFrequency: undefined,
        isSchedulable: undefined
      });
      return;
    }

    const defaults: Record<string, string> = {};
    (responseMetadata.configFields ?? []).forEach((field) => {
      const baseValue =
        responseMetadata.defaultParameters?.[field.name] ?? '';
      defaults[field.name] = baseValue;
    });

    setMetadataOverrides({
      defaultParameters: defaults,
      defaultFrequency: responseMetadata.defaultFrequency,
      isSchedulable: responseMetadata.isSchedulable
    });
  }, [responseMetadata]);

  // Update review description when default parameters change
  useEffect(() => {
    if (!isReviewModalOpen || !reviewDescription) return;

    // Collect all parameter values that might be referenced in description
    const paramValues: Record<string, string | number> = {
      ...metadataOverrides.defaultParameters,
      defaultFrequency: metadataOverrides.defaultFrequency || ''
    };

    // Update description with current parameter values
    const updatedDescription = updateDescriptionWithValues(reviewDescription, paramValues);

    // Only update if the description actually changed
    if (updatedDescription !== reviewDescription) {
      setReviewDescription(updatedDescription);
    }
  }, [metadataOverrides.defaultParameters, metadataOverrides.defaultFrequency, isReviewModalOpen]);

useEffect(() => {
  if (typeof window === 'undefined') return;
  try {
    const storedMode = window.localStorage.getItem('fortehub_creation_mode');
    if (
      storedMode === 'manual' ||
      storedMode === 'openrouter' ||
      storedMode === 'anthropic' ||
      storedMode === 'openai'
    ) {
      if (!hasUserInteractedRef.current) {
        setCreationMode(storedMode as GenerationMode);
      }
    }

    const storedOpenRouterKey = window.localStorage.getItem('openrouter_api_key');
    if (storedOpenRouterKey) {
      setOpenRouterApiKey(storedOpenRouterKey);
      setRememberOpenRouterKey(true);
    }
    const storedOpenRouterModel = window.localStorage.getItem('openrouter_model');
    if (storedOpenRouterModel) {
      setOpenRouterModel(storedOpenRouterModel);
    }

    const storedAnthropicKey = window.localStorage.getItem('anthropic_api_key');
    if (storedAnthropicKey) {
      setAnthropicApiKey(storedAnthropicKey);
      setRememberAnthropicKey(true);
    }
    const storedAnthropicModel = window.localStorage.getItem('anthropic_model');
    if (storedAnthropicModel) {
      setAnthropicModel(storedAnthropicModel);
    }

    const storedOpenAIKey = window.localStorage.getItem('openai_api_key');
    if (storedOpenAIKey) {
      setOpenAIApiKey(storedOpenAIKey);
      setRememberOpenAIApiKey(true);
    }
    const storedOpenAIModel = window.localStorage.getItem('openai_model');
    if (storedOpenAIModel) {
      setOpenAIModel(storedOpenAIModel);
    }

  } catch (error) {
    console.warn('Failed to hydrate stored generation preferences', error);
  }
}, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('fortehub_creation_mode', creationMode);
    } catch (error) {
      console.warn('Failed to persist generation mode', error);
    }
  }, [creationMode]);

useEffect(() => {
  if (typeof window === 'undefined') return;
  try {
    if (rememberOpenRouterKey && openRouterApiKey) {
      window.localStorage.setItem('openrouter_api_key', openRouterApiKey);
      } else if (!rememberOpenRouterKey) {
        window.localStorage.removeItem('openrouter_api_key');
      }
    } catch (error) {
      console.warn('Failed to persist OpenRouter API key preference', error);
  }
}, [rememberOpenRouterKey, openRouterApiKey]);

useEffect(() => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('openrouter_model', openRouterModel);
  } catch (error) {
    console.warn('Failed to persist OpenRouter model preference', error);
  }
}, [openRouterModel]);

useEffect(() => {
  if (typeof window === 'undefined') return;
  try {
    if (rememberAnthropicKey && anthropicApiKey) {
      window.localStorage.setItem('anthropic_api_key', anthropicApiKey);
    } else if (!rememberAnthropicKey) {
      window.localStorage.removeItem('anthropic_api_key');
    }
  } catch (error) {
    console.warn('Failed to persist Anthropic API key preference', error);
  }
}, [rememberAnthropicKey, anthropicApiKey]);

useEffect(() => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('anthropic_model', anthropicModel);
  } catch (error) {
    console.warn('Failed to persist Anthropic model preference', error);
  }
}, [anthropicModel]);

useEffect(() => {
  if (typeof window === 'undefined') return;
  try {
    if (rememberOpenAIApiKey && openAIApiKey) {
      window.localStorage.setItem('openai_api_key', openAIApiKey);
    } else if (!rememberOpenAIApiKey) {
      window.localStorage.removeItem('openai_api_key');
    }
  } catch (error) {
    console.warn('Failed to persist OpenAI API key preference', error);
  }
}, [rememberOpenAIApiKey, openAIApiKey]);

useEffect(() => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('openai_model', openAIModel);
  } catch (error) {
    console.warn('Failed to persist OpenAI model preference', error);
  }
}, [openAIModel]);


  useEffect(() => {
    setApiError(null);
    if (creationMode === 'manual') {
      setApiSummary(null);
    }
  }, [creationMode]);

  useEffect(() => {
    if (creationMode !== 'openrouter') {
      setApiSummary(null);
    }
  }, [creationMode]);

  const handleSourceCodeChange = (input: string) => {
    // Try to parse as JSON first (new format from Claude)
    try {
      const jsonMatch = input.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Check if it's a not-feasible response
        if (parsed.feasible === false) {
          const missing =
            parsed.missing && Array.isArray(parsed.missing)
              ? parsed.missing.join(', ')
              : parsed.missing;
          const alternative = parsed.alternative ? ` Alternative: ${parsed.alternative}` : '';
          setStatusMessage({
            type: 'error',
            text: `Workflow not feasible: ${parsed.reason}${
              missing ? ` Missing: ${missing}.` : ''
            }${alternative}`
          });
          return;
        }

        // Extract from JSON format
        if (parsed.workflowName && parsed.contractCode) {
          // Store metadata FIRST before setting sourceCode to avoid race conditions
          // (sourceCode change triggers useMemo which needs responseMetadata to be set)
          const metadata: WorkflowMetadata = {
            assets: [],
            configFields: parsed.configFields || [],
            defaultParameters: parsed.defaultParameters || {},
            notes: {},
            isSchedulable: parsed.isSchedulable ?? false,
            defaultFrequency: parsed.defaultFrequency
          };
          console.log('Parsed metadata from LLM response:', {
            configFieldsCount: metadata.configFields.length,
            configFields: metadata.configFields.map(f => ({ name: f.name, label: f.label })),
            defaultParameters: metadata.defaultParameters,
            isSchedulable: metadata.isSchedulable,
            defaultFrequency: metadata.defaultFrequency
          });
          setResponseMetadata(metadata);

          // Now set sourceCode which will trigger useMemo with responseMetadata already set
          setWorkflowName(parsed.workflowName);
          setCategory(typeof parsed.category === 'string' ? parsed.category : '');
          setDescription(parsed.description || '');
          setSourceCode(parsed.contractCode);

          // Validate the extracted code
          const validationResult = validateWorkflowCode(parsed.contractCode);
          setValidation(validationResult);
          return;
        }
      }
    } catch (e) {
      // Not JSON, fall through to code parsing
      console.log('JSON parsing failed:', {
        error: String(e),
        inputStart: input.substring(0, 100)
      });
    }

    // Set source code and validate
    setSourceCode(input);

    // Validate code quality
    if (input.trim().length > 50) {
      const validationResult = validateWorkflowCode(input);
      setValidation(validationResult);
    } else {
      setValidation(null);
    }
  };

  const sanitizeContractName = (name: string): string => {
    const cleaned = name.replace(/[^A-Za-z0-9_]/g, '');
    if (!cleaned) {
      return `Workflow${Date.now()}`;
    }
    if (!/^[A-Za-z_]/.test(cleaned)) {
      return `A${cleaned}`;
    }
    return cleaned;
  };

  const ensureUniqueContractName = async (baseName: string): Promise<string> => {
    const sanitized = sanitizeContractName(baseName);
    if (!userAddress) {
      return sanitized;
    }

    // Use timestamp-based suffix to ensure uniqueness
    // Deployment will fail if contract already exists and user will be informed
    const timestamp = Date.now().toString().slice(-6);
    return `${sanitized}_${timestamp}`;
  };

  function extractUpdatableVariables(code: string): {[key: string]: string} {
    const vars: {[key: string]: string} = {};
    const metadata = extractMetadataFromCode(code);
    if (metadata) {
      metadata.configFields.forEach(field => {
        if (field && typeof field.name === 'string' && typeof field.fieldType === 'string') {
          vars[field.name] = field.fieldType;
        }
      });
      return vars;
    }

    const dictMatch = code.match(/self\.updatableVariables\s*=\s*\{([\s\S]*?)\}/);
    if (!dictMatch) {
      return vars;
    }

    const body = dictMatch[1];
    const entryRegex = /"([^"]+)"\s*:\s*"([^"]+)"/g;
    let entry: RegExpExecArray | null;
    while ((entry = entryRegex.exec(body)) !== null) {
      const key = entry[1];
      const value = entry[2];
      vars[key] = value;
    }

    return vars;
  }

  function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function replaceNumericValue(text: string, previous: string, nextValue: string): string {
    if (!text || !previous || !nextValue) {
      return text;
    }
    const escaped = escapeRegExp(previous);
    const regex = new RegExp(`(^|[^0-9.])(${escaped})(?=[^0-9.]|$)`, 'g');
    let updated = text;
    updated = updated.replace(regex, (match, prefix) => `${prefix}${nextValue}`);
    return updated;
  }

  function updateDescriptionsForOverride(previousValue: string, nextValue: string) {
    if (!previousValue || !nextValue || previousValue === nextValue) {
      return;
    }

    const candidateValues = new Set<string>();
    candidateValues.add(previousValue);
    const numeric = Number(previousValue);
    if (Number.isFinite(numeric)) {
      candidateValues.add(String(numeric));
    }

    if (!isDescriptionManuallyEdited) {
      setDescription((current) => {
        if (!current) return current;
        let result = current;
        candidateValues.forEach((value) => {
          result = replaceNumericValue(result, value, nextValue);
        });
        return result;
      });
      setReviewDescription((current) => {
        if (!current) return current;
        let result = current;
        candidateValues.forEach((value) => {
          result = replaceNumericValue(result, value, nextValue);
        });
        return result;
      });
    }
  }

  function formatLabelFromName(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  function describeFrequency(value?: string | null): string | null {
    if (!value) {
      return null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }

    const seconds = Math.round(numeric);
    if (seconds % 86400 === 0) {
      const days = seconds / 86400;
      return `every ${days === 1 ? 'day' : `${days} days`}`;
    }
    if (seconds % 3600 === 0) {
      const hours = seconds / 3600;
      return `every ${hours === 1 ? 'hour' : `${hours} hours`}`;
    }
    if (seconds % 60 === 0) {
      const minutes = seconds / 60;
      return `every ${minutes === 1 ? 'minute' : `${minutes} minutes`}`;
    }
    return `every ${seconds} seconds`;
  }

  function sortOpenRouterModels(models: OpenRouterModelInfo[], asc: boolean): OpenRouterModelInfo[] {
    return [...models].sort((a, b) => {
      const nameA = (a.name || a.id || '').toLowerCase();
      const nameB = (b.name || b.id || '').toLowerCase();
      return asc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });
  }

  function normalizeMetadata(raw: any): WorkflowMetadata {
    const safeConfigFields: WorkflowMetadataField[] = Array.isArray(raw?.configFields)
      ? raw.configFields
          .filter((field: any) => field && typeof field.name === 'string')
          .map((field: any) => {
            const fieldType = typeof field.fieldType === 'string' ? field.fieldType : 'String';
            const label =
              typeof field.label === 'string' && field.label.length > 0
                ? field.label
                : formatLabelFromName(field.name);
            const description = typeof field.description === 'string' ? field.description : undefined;
            const minValue =
              field.min === null || field.min === undefined
                ? null
                : typeof field.min === 'string'
                ? field.min
                : String(field.min);
            const maxValue =
              field.max === null || field.max === undefined
                ? null
                : typeof field.max === 'string'
                ? field.max
                : String(field.max);
            const rulesValue = Array.isArray(field.rules)
              ? field.rules.map((rule: any) => String(rule))
              : typeof field.rules === 'string'
              ? [field.rules]
              : null;

            return {
              name: field.name,
              fieldType,
              label,
              description,
              min: minValue,
              max: maxValue,
              rules: rulesValue
            };
          })
      : [];

    const safeAssets: MetadataAsset[] = Array.isArray(raw?.assets)
      ? raw.assets
          .filter((asset: any) => asset && typeof asset.symbol === 'string' && typeof asset.address === 'string')
          .map((asset: any) => ({
            symbol: asset.symbol,
            address: asset.address,
            notes:
              asset.notes && typeof asset.notes === 'object'
                ? Object.entries(asset.notes).reduce<Record<string, string>>((acc, [key, value]) => {
                    if (typeof value === 'string') {
                      acc[key] = value;
                    }
                    return acc;
                  }, {})
                : undefined
          }))
      : [];

    const defaultParameters: Record<string, string> = {};

    // Support top-level defaultParameters object
    if (raw?.defaultParameters && typeof raw.defaultParameters === 'object') {
      Object.entries(raw.defaultParameters).forEach(([key, value]) => {
        if (typeof value === 'string') {
          defaultParameters[key] = value;
        } else if (value !== null && value !== undefined) {
          defaultParameters[key] = String(value);
        }
      });
    }

    const notes: Record<string, string> = {};
    if (raw?.notes && typeof raw.notes === 'object') {
      Object.entries(raw.notes).forEach(([key, value]) => {
        if (typeof value === 'string') {
          notes[key] = value;
        }
      });
    }

    return {
      assets: safeAssets,
      configFields: safeConfigFields,
      defaultParameters,
      notes,
      isSchedulable: typeof raw?.isSchedulable === 'boolean' ? raw.isSchedulable : undefined,
      defaultFrequency: typeof raw?.defaultFrequency === 'string' ? raw.defaultFrequency : undefined
    };
  }

  function extractMetadataFromCode(code: string): WorkflowMetadata | null {
    // Match metadata block between markers
    const metadataMatch = code.match(/UPDATABLE_METADATA_BEGIN([\s\S]*?)UPDATABLE_METADATA_END/);

    if (!metadataMatch) {
      return null;
    }

    try {
      // Extract content and clean line-by-line
      const rawContent = metadataMatch[1];
      const lines = rawContent.split('\n');

      // Process each line: remove leading //, whitespace, and empty lines
      const jsonLines = lines
        .map(line => {
          // Remove leading whitespace and // comment marker
          const cleaned = line.trim().startsWith('//')
            ? line.trim().substring(2).trim()
            : line.trim();
          return cleaned;
        })
        .filter(line => line.length > 0); // Remove empty lines

      // Join back together and parse JSON
      const jsonString = jsonLines.join('\n');
      const parsed = JSON.parse(jsonString);

      return normalizeMetadata(parsed);
    } catch (err) {
      console.warn('Failed to parse embedded metadata block', err);
      return null;
    }
  }

  type MetadataOverrideInput = {
    defaultParameters?: Record<string, string>;
    defaultFrequency?: string;
    isSchedulable?: boolean;
  };

  function buildMetadataFromSource(
    code: string,
    existingMetadata?: WorkflowMetadata | null,
    overrides?: MetadataOverrideInput
  ): WorkflowMetadata {
    const seedMetadata = existingMetadata ?? extractMetadataFromCode(code) ?? undefined;
    const configFields = seedMetadata?.configFields ?? [];
    const defaultParameters: Record<string, string> = {
      ...(seedMetadata?.defaultParameters ?? {})
    };
    const allowedParameterNames = new Set<string>();
    configFields.forEach(field => {
      if (field?.name) {
        allowedParameterNames.add(field.name);
      }
    });
    Object.keys(seedMetadata?.defaultParameters ?? {}).forEach((key) => {
      allowedParameterNames.add(key);
    });

    if (overrides?.defaultParameters) {
      Object.entries(overrides.defaultParameters).forEach(([key, value]) => {
        if (typeof value !== 'string') {
          return;
        }
        if (allowedParameterNames.size === 0) {
          return;
        }
        if (!allowedParameterNames.has(key)) {
          return;
        }
        defaultParameters[key] = value.trim();
      });
    }

    const isSchedulable =
      typeof overrides?.isSchedulable === 'boolean'
        ? overrides.isSchedulable
        : seedMetadata?.isSchedulable;

    const frequencyOverride = overrides && Object.prototype.hasOwnProperty.call(overrides, 'defaultFrequency')
      ? overrides.defaultFrequency
      : seedMetadata?.defaultFrequency;
    const trimmedFrequency =
      typeof frequencyOverride === 'string' && frequencyOverride.trim().length > 0
        ? frequencyOverride.trim()
        : undefined;

    return {
      assets: seedMetadata?.assets ?? [],
      configFields,
      defaultParameters,
      notes: seedMetadata?.notes ?? {},
      isSchedulable,
      defaultFrequency: isSchedulable ? trimmedFrequency : undefined
    };
  }

  function stripMetadataBlock(code: string): string {
    // No-op: metadata is now in JSON response, not in code
    return code;
  }

  function ensureClosingBrace(code: string): string {
    let adjusted = code.trimEnd();
    if (!adjusted.endsWith('}')) {
      adjusted = `${adjusted}\n}\n`;
    }
    return adjusted;
  }

  const fetchExistingWorkflowNames = async (): Promise<string[]> => {
    if (!userAddress) return [];

    if (cachedWorkflowNames) {
      return cachedWorkflowNames;
    }

    // For now, return empty list
    // TODO: Implement workflow name fetching with React SDK hooks
    return [];
  };

  const handleStrategyInputChange = (value: string) => {
    hasUserInteractedRef.current = true;
    setStrategy(value);
    if (creationMode !== 'manual') {
      setHasGenerated(false);
    }
  };

  const checkNameAvailability = async (
    candidateName: string
  ): Promise<{ conflict: boolean; suggestion?: string }> => {
    const trimmed = candidateName.trim();
    if (!trimmed) {
      return { conflict: false };
    }

    const existingNames = await fetchExistingWorkflowNames();
    const lowerExisting = existingNames.map(name => name.toLowerCase());
    const candidateLower = trimmed.toLowerCase();

    if (!lowerExisting.includes(candidateLower)) {
      return { conflict: false };
    }

    let suffix = 2;
    let suggestion = `${trimmed}_${suffix}`;
    while (lowerExisting.includes(suggestion.toLowerCase())) {
      suffix += 1;
      suggestion = `${trimmed}_${suffix}`;
    }

    return { conflict: true, suggestion };
  };

  useEffect(() => {
    if (!isReviewModalOpen) {
      setNameCheck(null);
      setCheckingName(false);
      return;
    }

    const trimmed = reviewName.trim();
    if (!trimmed) {
      setNameCheck(null);
      setCheckingName(false);
      return;
    }

    let active = true;
    setCheckingName(true);
    const timer = setTimeout(async () => {
      const result = await checkNameAvailability(trimmed);
      if (active) {
        setNameCheck(result);
        setCheckingName(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isReviewModalOpen, reviewName, userAddress]);

  const handleCopyPrompt = () => {
    const prompt = buildWorkflowPrompt({
      strategy: strategy || 'Build me an autonomous DeFi workflow',
      description: description || ''
    });
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTrySuggestedStrategy = async () => {
    if (!suggestedStrategy) return;

    // Replace strategy with suggested one
    setHasGenerated(false);
    setStrategy(suggestedStrategy);
    setSuggestedStrategy(null);
    setApiError(null);

    // Regenerate workflow with suggested strategy
    // Use setTimeout to allow state updates to complete
    setTimeout(() => {
      // Trigger generation with the new strategy
      const newPayload = {
        strategy: suggestedStrategy,
      };

      // Re-run generation with updated strategy
      (async () => {
        setApiLoading(true);
        setApiError(null);

        try {
          const provider = providerFromMode(creationMode);
          if (!provider) {
            setApiError('Select a generation method before generating a workflow.');
            setApiLoading(false);
            return;
          }
          if (provider === 'server') {
            setApiError('Server LLM mode is currently disabled.');
            setApiLoading(false);
            return;
          }

          const requestBody: Record<string, unknown> = {
            strategy: suggestedStrategy,
            provider,
          };

          if (provider === 'openrouter') {
            const apiKey = openRouterApiKey.trim();
            if (!apiKey) {
              setApiError('Please provide an OpenRouter API key.');
              setApiLoading(false);
              return;
            }
            requestBody.apiKey = apiKey;
            requestBody.model = openRouterModel.trim() || 'x/grok-1';
          } else if (provider === 'anthropic') {
            const apiKey = anthropicApiKey.trim();
            if (!apiKey) {
              setApiError('Please provide an Anthropic API key.');
              setApiLoading(false);
              return;
            }
            requestBody.apiKey = apiKey;
            requestBody.model = anthropicModel.trim() || 'claude-3-5-sonnet-20240620';
          } else if (provider === 'openai') {
            const apiKey = openAIApiKey.trim();
            if (!apiKey) {
              setApiError('Please provide an OpenAI API key.');
              setApiLoading(false);
              return;
            }
            requestBody.apiKey = apiKey;
            requestBody.model = openAIModel.trim() || 'gpt-4o-mini';
          }

          openGenerationModal(provider, suggestedStrategy);

          const requestLog = { ...requestBody } as Record<string, unknown>;
          if (requestLog.apiKey) {
            requestLog.apiKey = '[redacted]';
          }
          console.log('[generate] request payload (retry)', {
            provider,
            payload: requestLog,
          });

          const response = await fetch('/api/workflows/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          const data = await response.json();
          if (generationCancelledRef.current) {
            console.log('[generate] response ignored (cancelled)');
            return;
          }
          console.log('[generate] response payload (retry)', {
            provider,
            payload: data,
          });
          if (!response.ok) {
            setApiError(data?.error || `Generation failed with status ${response.status}`);
            return;
          }

          if (!data?.workflow) {
            throw new Error('Response missing workflow payload.');
          }

          await applyGeneratedWorkflow(data.workflow);
        } catch (error) {
          if (generationCancelledRef.current) {
            return;
          }
          const errorMessage = error instanceof Error ? error.message : 'Unexpected error generating workflow.';
          setApiError(errorMessage);
        } finally {
          generationCancelledRef.current = false;
          closeGenerationModal();
          setApiLoading(false);
        }
      })();
    }, 0);
  };

  const loadOpenRouterModels = async () => {
    if (creationMode !== 'openrouter') {
      setApiError('Switch to OpenRouter mode to load models.');
      return;
    }
    const key = openRouterApiKey.trim();
    if (!key) {
      setApiError('Please enter an OpenRouter API key before fetching models.');
      return;
    }

    setLoadingModelList(true);
    setApiError(null);
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://fortehub.io',
          'X-Title': 'ForteHub Workflow Generator',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        setApiError(data?.error || `Failed to load models (status ${response.status}).`);
        setOpenRouterModels([]);
        return;
      }

      const models: OpenRouterModelInfo[] = Array.isArray(data?.data)
        ? data.data.map((model: any) => ({
            id: model?.id ?? model?.name,
            name: model?.name ?? model?.id,
            description: model?.description,
          }))
        : [];
      setOpenRouterModels(models);

      if (models.length > 0) {
        const sorted = sortOpenRouterModels(models, modelSortAsc);
        const current = sorted.find((model: OpenRouterModelInfo) => model.id === openRouterModel);
        if (!current) {
          setOpenRouterModel(sorted[0].id);
        }
      }

      if (models.length === 0) {
        setStatusMessage({
          type: 'info',
          text: 'No models returned for that API key. Ensure it has access to model listings.'
        });
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to load OpenRouter models.');
    } finally {
      setLoadingModelList(false);
    }
  };

  const loadAnthropicModels = async () => {
    if (creationMode !== 'anthropic') {
      setApiError('Switch to Anthropic mode to load models.');
      return;
    }
    const key = anthropicApiKey.trim();
    if (!key) {
      setApiError('Please enter an Anthropic API key before fetching models.');
      return;
    }

    setLoadingModelList(true);
    setApiError(null);
    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        setApiError(data?.error?.message || `Failed to load models (status ${response.status}).`);
        setAnthropicModels([]);
        return;
      }

      const models = Array.isArray(data?.data)
        ? data.data
            .filter((model: any) => model?.type === 'model')
            .map((model: any) => ({
              id: model?.id ?? model?.name,
              name: model?.id ?? model?.name,
              description: model?.display_name,
            }))
        : [];
      setAnthropicModels(models);

      if (models.length > 0) {
        const current = models.find((model: any) => model.id === anthropicModel);
        if (!current) {
          setAnthropicModel(models[0].id);
        }
      }

      if (models.length === 0) {
        setStatusMessage({
          type: 'info',
          text: 'No models returned. Check that your API key is valid.'
        });
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to load Anthropic models.');
    } finally {
      setLoadingModelList(false);
    }
  };

  const loadOpenAIModels = async () => {
    if (creationMode !== 'openai') {
      setApiError('Switch to OpenAI mode to load models.');
      return;
    }
    const key = openAIApiKey.trim();
    if (!key) {
      setApiError('Please enter an OpenAI API key before fetching models.');
      return;
    }

    setLoadingModelList(true);
    setApiError(null);
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        setApiError(data?.error?.message || `Failed to load models (status ${response.status}).`);
        setOpenAIModels([]);
        return;
      }

      const models = Array.isArray(data?.data)
        ? data.data
            .filter((model: any) => model?.id && !model?.id.includes('embedding'))
            .map((model: any) => ({
              id: model?.id,
              name: model?.id,
              description: model?.owned_by ? `Owned by ${model.owned_by}` : undefined,
            }))
        : [];
      setOpenAIModels(models);

      if (models.length > 0) {
        const current = models.find((model: any) => model.id === openAIModel);
        if (!current) {
          setOpenAIModel(models[0].id);
        }
      }

      if (models.length === 0) {
        setStatusMessage({
          type: 'info',
          text: 'No models returned. Check that your API key is valid.'
        });
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to load OpenAI models.');
    } finally {
      setLoadingModelList(false);
    }
  };

  const applyGeneratedWorkflow = async (workflow: any) => {
    if (!workflow || typeof workflow !== 'object') {
      throw new Error('LLM response missing workflow payload.');
    }

    // Check if workflow is infeasible
    if (workflow.feasible === false) {
      const reason = workflow.reason || 'The workflow cannot be created.';
      const details = workflow.details ? `${workflow.details}\n` : '';
      const suggestion = workflow.suggestion ? `\n\nSuggestion: ${workflow.suggestion}` : '';

      // Store suggested description for "Try Alternative" button
    if (workflow.suggestedDescription) {
      setSuggestedStrategy(workflow.suggestedDescription);
    } else if (workflow.strategy) {
      setSuggestedStrategy(workflow.strategy);
    }

      throw new Error(`Workflow not feasible: ${reason}\n\n${details}${suggestion}`);
    }

    if (!workflow.contractCode || typeof workflow.contractCode !== 'string') {
      throw new Error('LLM response missing contractCode.');
    }

    if (workflow.workflowName) {
      let finalName = workflow.workflowName;

      if (userAddress) {
        setCheckingName(true);
        try {
          const existingName = await checkWorkflowNameExists(
            userAddress,
            workflow.workflowName
          );
          if (existingName) {
            finalName = `${workflow.workflowName}_2`;
            setNameCheck({
              conflict: true,
              suggestion: finalName,
            });
            setStatusMessage({
              type: 'info',
              text: `Hint: You already have a workflow named "${existingName}". We've suggested "${finalName}" as the name. You can change it if you prefer.`,
            });
          } else {
            setNameCheck(null);
          }
        } catch (error) {
          console.warn('Failed to check workflow name:', error);
          setNameCheck(null);
        } finally {
          setCheckingName(false);
        }
      } else {
        setNameCheck(null);
      }

      setWorkflowName(finalName);
      setReviewName(finalName);
    }

    if (workflow.description) {
      setDescription(workflow.description);
      setReviewDescription(workflow.description);
      setIsDescriptionManuallyEdited(false);
    }

    if (workflow.category && typeof workflow.category === 'string') {
      setCategory(workflow.category);
    } else if (workflow.metadata?.category && typeof workflow.metadata.category === 'string') {
      setCategory(workflow.metadata.category);
    }

    setSourceCode(workflow.contractCode);
    const validationResult = validateWorkflowCode(workflow.contractCode);
    setValidation(validationResult);

    if (workflow.metadata) {
      const normalized = normalizeMetadata(workflow.metadata);
      setResponseMetadata(normalized);
      const defaults: Record<string, string> = {};
      normalized.configFields.forEach((field) => {
        defaults[field.name] = normalized.defaultParameters[field.name] ?? '';
      });
      setMetadataOverrides({
        defaultParameters: defaults,
        defaultFrequency: normalized.defaultFrequency,
        isSchedulable: normalized.isSchedulable
      });
    } else {
      setResponseMetadata(null);
      setMetadataOverrides({
        defaultParameters: {},
        defaultFrequency: undefined,
        isSchedulable: undefined
      });
    }

    // Clear suggested strategy and error when workflow is successfully generated
    setSuggestedStrategy(null);
    setApiError(null);

    if (workflow.summary) {
      setApiSummary(workflow.summary);
    }

    if (Array.isArray(workflow.warnings) && workflow.warnings.length > 0) {
      setStatusMessage({
        type: 'info',
        text: `Warnings: ${workflow.warnings.join('; ')}`
      });
    } else {
      setStatusMessage({
        type: 'success',
        text: 'Workflow generated. Review and deploy when ready.'
      });
    }

    setReviewErrors({});

    setHasGenerated(true);
    setIsReviewCodeOpen(false);
    if (creationMode !== 'manual') {
      if (!workflow.description && description) {
        setReviewDescription(description);
        setIsDescriptionManuallyEdited(false);
      }
      if (!userAddress) {
        setStatusMessage((prev) => {
          if (prev?.type === 'info' && prev.text?.startsWith('Warnings')) {
            return prev;
          }
          return {
            type: 'info',
            text: 'Connect your wallet to deploy the generated workflow.'
          };
        });
      }
      setIsReviewModalOpen(true);
    }
  };

  const handleGenerateWorkflow = async () => {
    if (creationMode === 'manual') {
      return;
    }

    if (!strategy || strategy.trim().length === 0) {
      setApiError('Please describe your strategy before generating a workflow.');
      return;
    }

    setHasGenerated(false);
    setApiLoading(true);
    setApiError(null);
    setApiSummary(null);
    setLastLLMResponse(null);

    const payload = {
      strategy,
    };

    try {
      const provider = providerFromMode(creationMode);
      if (!provider) {
        setApiError('Select a generation method before generating a workflow.');
        setApiLoading(false);
        return;
      }
      if (provider === 'server') {
        setApiError('Server LLM mode is currently disabled.');
        setApiLoading(false);
        return;
      }

      const requestBody: Record<string, unknown> = {
        strategy,
        provider,
      };

      if (provider === 'openrouter') {
        const apiKey = openRouterApiKey.trim();
        if (!apiKey) {
          setApiError('Please provide an OpenRouter API key.');
          setApiLoading(false);
          return;
        }
        requestBody.apiKey = apiKey;
        requestBody.model = openRouterModel.trim() || 'x/grok-1';
      } else if (provider === 'anthropic') {
        const apiKey = anthropicApiKey.trim();
        if (!apiKey) {
          setApiError('Please provide an Anthropic API key.');
          setApiLoading(false);
          return;
        }
        requestBody.apiKey = apiKey;
        requestBody.model = anthropicModel.trim() || 'claude-3-5-sonnet-20240620';
      } else if (provider === 'openai') {
        const apiKey = openAIApiKey.trim();
        if (!apiKey) {
          setApiError('Please provide an OpenAI API key.');
          setApiLoading(false);
          return;
        }
        requestBody.apiKey = apiKey;
        requestBody.model = openAIModel.trim() || 'gpt-4o-mini';
      }

      openGenerationModal(provider, strategy);

      const requestLog = { ...requestBody } as Record<string, unknown>;
      if (requestLog.apiKey) {
        requestLog.apiKey = '[redacted]';
      }
      console.log('[generate] request payload', { provider, payload: requestLog });

      const response = await fetch('/api/workflows/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      if (generationCancelledRef.current) {
        console.log('[generate] response payload ignored (cancelled)');
        return;
      }
      console.log('[generate] response payload', { provider, payload: data });

      if (!response.ok) {
        if (typeof data?.lastResponse === 'string' && data.lastResponse.trim().length > 0) {
          setLastLLMResponse(data.lastResponse);
        }
        const issuesText =
          Array.isArray(data?.issues) && data.issues.length > 0
            ? `\n\nIssues detected:\n- ${data.issues.join('\n- ')}`
            : '';
        setApiError((data?.error || `Generation failed with status ${response.status}`) + issuesText);
        return;
      }

      if (!data?.workflow) {
        throw new Error('Response missing workflow payload.');
      }

      setStatusMessage({
        type: 'success',
        text: 'Workflow generated successfully!'
      });

      await applyGeneratedWorkflow(data.workflow);
    } catch (error) {
      if (generationCancelledRef.current) {
        return;
      }
      setLastLLMResponse(null);
      const errorMessage = error instanceof Error ? error.message : 'Unexpected error generating workflow.';

      // Format infeasibility errors for better readability
      if (errorMessage.includes('Workflow not feasible:')) {
        setApiError(errorMessage);
      } else {
        setApiError(errorMessage);
      }
    } finally {
      generationCancelledRef.current = false;
      closeGenerationModal();
      setApiLoading(false);
    }
  };

  const prepareDeploymentTransaction = async (finalName: string, finalDescription: string) => {
    if (!userAddress) {
      setStatusMessage({
        type: 'info',
        text: 'Please connect your wallet before deploying an workflow.'
      });
      return;
    }

    setPendingTransaction(null);
    setPendingDeploymentDetails(null);
    setIsDeploymentPromptOpen(false);
    deploymentCancelledRef.current = false;
    setIsPreparingDeployment(true);
    setPreparationStep('ipfs');

    try {
      // Extract contract name FIRST (before any transformations)
      const contractNameMatch = sourceCode.match(/access\(all\)\s+contract\s+(\w+)/);
      if (!contractNameMatch) {
        setStatusMessage({
          type: 'error',
          text: 'Could not find contract name in generated code. Ensure it includes "access(all) contract YourContractName {".'
        });
        setIsPreparingDeployment(false);
        setPreparationStep(null);
        return;
      }
      const baseContractName = contractNameMatch[1];

      const metadata = buildMetadataFromSource(
        sourceCode,
        responseMetadata || undefined,
        metadataOverrides
      );
      const metadataJSON = JSON.stringify(metadata);

      const contractName = await ensureUniqueContractName(baseContractName);

      // Apply transformations to BOTH IPFS and deployment code consistently
      // 1. Replace contract name if needed
      const codeWithReplacedName = sourceCode.replace(
        new RegExp(`\b${baseContractName}\b`, 'g'),
        contractName
      );

      // 2. Sanitize, strip comments, balance braces (same pipeline for both)
      const sanitized = stripMetadataBlock(sanitizeCadenceCode(codeWithReplacedName));
      const commentsStripped = stripCadenceComments(sanitized);
      const finalCode = ensureClosingBrace(commentsStripped);

      // 3. Upload the exact same code to IPFS
      const { cid, hash } = await uploadWorkflowToIPFS(finalCode, {
        name: finalName,
        creator: userAddress,
        category,
        description: finalDescription
      });

      if (deploymentCancelledRef.current) {
        console.log('Deployment cancelled after IPFS upload; aborting.');
        setIsPreparingDeployment(false);
        setPreparationStep(null);
        return;
      }

      // Verify CIDv1 integrity: ensure the IPFS CID hash matches computed SHA-256 hash
      // This prevents deployment if IPFS upload was corrupted
      const cidHashValid = verifyCIDv1Hash(cid, hash);
      if (!cidHashValid) {
        setStatusMessage({
          type: 'error',
          text: 'IPFS upload verification failed. The CIDv1 hash does not match the source code hash. This suggests the IPFS upload was corrupted. Please try again.'
        });
        setIsPreparingDeployment(false);
        setPreparationStep(null);
        return;
      }

      console.log('Uploaded to IPFS:', { cid, hash, cidHashValid });
      console.log('Base contract name:', baseContractName);
      console.log('Deployment contract name:', contractName);

      const vaultSetupInfo = extractVaultSetupInfo(metadataJSON, sourceCode);
      const shouldDeployManager = true;
      console.log('ForteHub deploy check (assuming deploy needed):', shouldDeployManager);

      console.log('Deployment arguments:', {
        contractName,
        finalCode: `${finalCode.substring(0, 100)}...`,
        finalName,
        category,
        finalDescription,
        ipfsCID: cid,
        codeHash: hash,
        isListed,
        userAddress,
        metadataJSON: `${metadataJSON.substring(0, 50)}...`,
        vaultSetupInfo,
        shouldDeployManager
      });

      if (deploymentCancelledRef.current) {
        setIsPreparingDeployment(false);
        setPreparationStep(null);
        return;
      }

      setPreparationStep('transaction');

      const transactionConfig: TransactionConfig = {
        cadence: DEPLOY_WORKFLOW_TRANSACTION,
        limit: 9999,
        args: (arg: any, t: any) =>
          buildDeploymentArgs(
            String(contractName),
            String(finalCode),
            String(finalName),
            String(category),
            String(finalDescription),
            String(cid),
            isListed,
            String(userAddress),
            String(metadataJSON),
            vaultSetupInfo,
            Boolean(metadata.isSchedulable),
            metadata.defaultFrequency,
            clonePrice || '0',
            imageIPFS || 'https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq',
            arg,
            t
          )
      };

      setPendingTransaction(transactionConfig);
      setPendingDeploymentDetails({ workflowName: finalName, contractName });
      setIsDeploymentPromptOpen(true);
      setStatusMessage({
        type: 'info',
        text: 'Deployment transaction prepared. Review and sign to continue.'
      });
    } catch (error) {
      console.warn('Deployment error while preparing transaction:', error);
      setPendingTransaction(null);
      setPendingDeploymentDetails(null);
      setIsDeploymentPromptOpen(false);
      setStatusMessage({
        type: 'error',
        text: `Failed to deploy workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsPreparingDeployment(false);
      setPreparationStep(null);
    }
  };

  const handleDeployClick = () => {
    if (isPreparingDeployment) return;
    if (isUserLoading) {
      setStatusMessage({
        type: 'info',
        text: 'Wallet is connecting... Please wait.'
      });
      return;
    }
    if (!userAddress) {
      setStatusMessage({
        type: 'info',
        text: 'Please connect your wallet before deploying an workflow.'
      });
      return;
    }

    if (!workflowName || !sourceCode || !category) {
      setStatusMessage({
        type: 'error',
        text: 'Please fill in all required fields (name, category, and source code) before deploying.'
      });
      return;
    }

    if (validation && validation.errors.length > 0) {
      setStatusMessage({
        type: 'error',
        text: 'Resolve validation errors before deploying.'
      });
      return;
    }

    setReviewName(workflowName);
    setReviewDescription(description);
    setIsDescriptionManuallyEdited(false);
    setReviewErrors({});
    setNameCheck(null);
    setIsReviewModalOpen(true);
    setIsReviewCodeOpen(false);
  };

  const closeReviewModal = () => {
    if (isPreparingDeployment) return;
    setIsReviewModalOpen(false);
    setReviewErrors({});
    setNameCheck(null);
    setIsReviewCodeOpen(false);
  };

  const confirmDeployment = async () => {
    const trimmedName = reviewName.trim();
    const trimmedDescription = reviewDescription.trim();
    const errors: typeof reviewErrors = {};

    if (!trimmedName) {
      errors.name = 'Name cannot be empty';
    }
    if (!trimmedDescription) {
      errors.description = 'Description cannot be empty';
    }

    if (Object.keys(errors).length > 0) {
      setReviewErrors(errors);
      return;
    }

    if (nameCheck?.conflict) {
      setStatusMessage({
        type: 'error',
        text: 'Please choose a unique workflow name before deploying.'
      });
      return;
    }

    setWorkflowName(trimmedName);
    setDescription(trimmedDescription);
    setIsReviewModalOpen(false);
    setReviewErrors({});
    setNameCheck(null);
    setIsReviewCodeOpen(false);
    await prepareDeploymentTransaction(trimmedName, trimmedDescription);
  };

  const connectWallet = async () => {
    // User connects wallet through the Flow wallet UI
    // useCurrentUser hook automatically updates user state
    setStatusMessage({
      type: 'info',
      text: 'Please connect your wallet using the wallet button in the header.'
    });
  };

  const providerLabels: Record<'openrouter' | 'anthropic' | 'openai' | 'server', string> = {
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic Claude',
    openai: 'OpenAI',
    server: 'Server LLM',
  };

  const providerFromMode = (
    mode: GenerationMode
  ): 'openrouter' | 'anthropic' | 'openai' | 'server' | null => {
    switch (mode) {
      case 'openrouter':
        return 'openrouter';
      case 'anthropic':
        return 'anthropic';
      case 'openai':
        return 'openai';
      case 'server':
        return 'server';
      default:
        return null;
    }
  };

  const openGenerationModal = (
    provider: 'openrouter' | 'anthropic' | 'openai' | 'server',
    strategyText: string
  ) => {
    generationCancelledRef.current = false;
    setGenerationProviderLabel(providerLabels[provider] ?? 'Selected provider');
    setGenerationModalNote(
      provider === 'server'
        ? 'Server-hosted LLM will process this request once re-enabled.'
        : null
    );
    setGenerationStrategyPreview(strategyText);
    setIsGenerationModalOpen(true);
  };

  const closeGenerationModal = () => {
    setIsGenerationModalOpen(false);
    setGenerationProviderLabel('');
    setGenerationModalNote(null);
    setGenerationStrategyPreview('');
  };

  const handleCancelGeneration = useCallback(() => {
    generationCancelledRef.current = true;
    closeGenerationModal();
    setApiLoading(false);
    setStatusMessage({
      type: 'info',
      text: 'Generation cancelled. You can adjust your strategy or try again.'
    });
  }, []);

  const handleCancelPreparation = useCallback(() => {
    if (!isPreparingDeployment) return;
    deploymentCancelledRef.current = true;
    setIsPreparingDeployment(false);
    setPreparationStep(null);
    setIsDeploymentPromptOpen(false);
    setPendingTransaction(null);
    setPendingDeploymentDetails(null);
    setStatusMessage({
      type: 'info',
      text: 'Deployment cancelled. You can review your workflow and try again.'
    });
  }, [isPreparingDeployment]);

  const resetWorkflowForm = useCallback(() => {
    setWorkflowName('');
    setDescription('');
    setSourceCode('');
    setStrategy('');
    setHasGenerated(false);
    setIsListed(true);
    setCachedWorkflowNames(null);
    setResponseMetadata(null);
    setMetadataOverrides({
      defaultParameters: {},
      defaultFrequency: undefined,
      isSchedulable: undefined
    });
    setValidation(null);
  }, []);

  const handleTransactionSuccess = useCallback(() => {
    resetWorkflowForm();
    setPendingTransaction(null);
    setStatusMessage({
      type: 'success',
      text: 'Workflow deployed successfully!'
    });
  }, [resetWorkflowForm]);

  const generationOptions: GenerationOption[] = [
    {
      value: 'manual',
      label: 'Manual',
      description: 'Copy prompts to your preferred assistant and paste the generated code back into the editor.'
    },
    {
      value: 'openrouter',
      label: 'OpenRouter (Custom)',
      description: 'Use your own OpenRouter API key - defaults to Grok (x/grok-1) but you can pick any available model.'
    },
    {
      value: 'anthropic',
      label: 'Anthropic Claude',
      description: "Call Anthropic's Claude models with your API key and keep everything in-discoverr."
    },
    {
      value: 'openai',
      label: 'OpenAI',
      description: 'Use OpenAI Chat Completions with your API key and preferred model.'
    }
  ];

  const handleModeChange = useCallback((mode: GenerationMode) => {
    hasUserInteractedRef.current = true;
    setCreationMode(mode);
  }, []);

  const selectedGenerationOption = generationOptions.find((opt) => opt.value === creationMode);
  const isOpenRouterMode = creationMode === 'openrouter';
  const isAnthropicMode = creationMode === 'anthropic';
  const isOpenAIMode = creationMode === 'openai';

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Create New Workflow</h1>
        <p className="text-gray-600">
          {creationMode === 'manual'
            ? 'Describe your strategy, copy the prompt to your preferred assistant, then paste the generated code back here.'
            : 'Describe your strategy and generate Cadence code directly using the selected integration.'}
        </p>
      </div>

      <GenerationMethodSelector
        options={generationOptions}
        currentMode={creationMode}
        onModeChange={handleModeChange}
      />

      <GenerationProgressModal
        open={isGenerationModalOpen}
        providerLabel={generationProviderLabel || 'Selected provider'}
        strategy={generationStrategyPreview || strategy}
        extraNote={generationModalNote || undefined}
        onCancel={handleCancelGeneration}
      />

      {creationMode !== 'manual' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Describe & Deploy with {selectedGenerationOption?.label}</CardTitle>
            <CardDescription>
              Enter your workflow description, configure the provider, and we'll open a deployment review once the model responds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="workflow-description">Workflow Description *</Label>
              <Textarea
                id="workflow-description"
                value={strategy}
                onChange={(event) => handleStrategyInputChange(event.target.value)}
                placeholder="Example: Create a DCA workflow that buys $100 of FLOW with USDC every week"
                rows={4}
                className="mt-2"
              />
              <p className="mt-2 text-xs text-gray-500">
                We'll send this description to {selectedGenerationOption?.label ?? 'the selected model'} with ForteHub's Cadence context and then open a deployment review modal.
              </p>
            </div>

            {isOpenRouterMode && (
              <OpenRouterSettings
                apiKey={openRouterApiKey}
                onApiKeyChange={setOpenRouterApiKey}
                rememberKey={rememberOpenRouterKey}
                onRememberKeyChange={setRememberOpenRouterKey}
                model={openRouterModel}
                onModelChange={setOpenRouterModel}
                models={sortedOpenRouterModels}
                loading={loadingModelList}
                sortAsc={modelSortAsc}
                onToggleSort={() => setModelSortAsc((prev) => !prev)}
                onFetchModels={loadOpenRouterModels}
              />
            )}

            {isAnthropicMode && (
              <AnthropicSettings
                apiKey={anthropicApiKey}
                onApiKeyChange={setAnthropicApiKey}
                rememberKey={rememberAnthropicKey}
                onRememberKeyChange={setRememberAnthropicKey}
                model={anthropicModel}
                onModelChange={setAnthropicModel}
                models={anthropicModels}
                loading={loadingModelList}
                onFetchModels={loadAnthropicModels}
              />
            )}

            {isOpenAIMode && (
              <OpenAISettings
                apiKey={openAIApiKey}
                onApiKeyChange={setOpenAIApiKey}
                rememberKey={rememberOpenAIApiKey}
                onRememberKeyChange={setRememberOpenAIApiKey}
                model={openAIModel}
                onModelChange={setOpenAIModel}
                models={openAIModels}
                loading={loadingModelList}
                onFetchModels={loadOpenAIModels}
              />
            )}

            {!userAddress && (
              <div className="p-4 border border-slate-200 bg-slate-50 rounded-md">
                <p className="text-sm text-gray-600">
                  Connect your wallet before deploying the generated workflow.
                </p>
                <div className="mt-3">
                  <Connect />
                </div>
              </div>
            )}

            {hasGenerated && workflowName && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <p className="font-semibold">Ready to deploy "{workflowName}"</p>
                <p className="text-xs text-green-600 mt-1">Category: {category || '-'}</p>
              </div>
            )}

            {validation && hasGenerated && (
              <div className="space-y-2">
                {validation.errors.length > 0 && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 space-y-1">
                    {validation.errors.map((error, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                )}
                {validation.warnings.length > 0 && (
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-700 space-y-1">
                    {validation.warnings.map((warning, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}
                {validation.info.length > 0 && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 space-y-1">
                    {validation.info.map((info, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{info}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={hasGenerated ? handleDeployClick : handleGenerateWorkflow}
              disabled={
                apiLoading ||
                (hasGenerated ? isPreparingDeployment : !strategy.trim())
              }
              className="w-full"
            >
              {apiLoading ? 'Generating...' : hasGenerated ? 'Review Deployment' : 'Generate & Review'}
            </Button>

            {apiError && (
              <div className="space-y-3">
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap break-words">
                  <p className="font-semibold mb-2">Generation Failed</p>
                  {apiError}
                </div>
                {lastLLMResponse && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-semibold mb-2 text-slate-600">Last model output</p>
                    <div className="max-h-64 overflow-y-auto rounded border border-slate-200 bg-white p-2">
                      <pre className="font-mono whitespace-pre-wrap break-words">{lastLLMResponse}</pre>
                    </div>
                  </div>
                )}
                {suggestedStrategy && (
                  <Button
                    onClick={handleTrySuggestedStrategy}
                    disabled={apiLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                {apiLoading ? 'Generating alternative...' : 'Hint: Try Suggested Alternative'}
                  </Button>
                )}
              </div>
            )}

            {apiSummary && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <p className="font-semibold mb-1">Model Summary</p>
                <p>{apiSummary}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {statusMessage && (
        <div
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${
            statusMessage.type === 'error'
              ? 'border-red-300 bg-red-50 text-red-700'
              : statusMessage.type === 'success'
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-blue-300 bg-blue-50 text-blue-700'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {creationMode === 'manual' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Describe Your Workflow</CardTitle>
              <CardDescription>
                Tell us what you want your workflow to do
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="strategy">Workflow Description *</Label>
                <Textarea
                  id="strategy"
                  value={strategy}
                  onChange={(e) => handleStrategyInputChange(e.target.value)}
                  placeholder="Example: Create a DCA workflow that buys $100 of FLOW with USDC every week"
                  rows={4}
                  className="mt-2"
                />
              </div>

              <Button
                onClick={handleCopyPrompt}
                disabled={!strategy}
                className="w-full"
                variant="outline"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Prompt for Claude/ChatGPT
                  </>
                )}
              </Button>

              <div className="text-xs text-gray-500 space-y-1">
                <p>After copying:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Paste the prompt into Claude/ChatGPT</li>
                  <li>LLM will generate the Cadence code</li>
                  <li>Copy the generated code</li>
                  <li>Paste it in Step 2 to deploy</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Step 2 - Deploy Workflow */}
          <Card>
          <CardHeader>
            <CardTitle>
              {creationMode === 'manual' ? 'Step 2: Deploy Your Workflow' : 'Review & Deploy'}
            </CardTitle>
            <CardDescription>
              {creationMode === 'manual'
                ? 'Paste the generated code - name and category will be auto-detected'
                : 'We\'ll populate the generated Cadence contract below. Review and continue when ready.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!userAddress ? (
              <div className="p-8 text-center bg-slate-50 rounded-lg border-2 border-dashed">
                <p className="text-gray-600 mb-4">Connect your wallet to deploy workflows</p>
                <Connect />
              </div>
            ) : (
              <>
                <div className="p-3 bg-green-50 rounded border border-green-200">
                  <p className="text-sm text-green-800">
                    Connected: {userAddress.slice(0, 8)}...{userAddress.slice(-4)}
                  </p>
                </div>

                <div>
                  <Label htmlFor="source-code">Cadence Source Code *</Label>
                  <Textarea
                    id="source-code"
                    value={sourceCode}
                    onChange={(e) => handleSourceCodeChange(e.target.value)}
                    placeholder={
                      creationMode === 'manual'
                        ? 'Paste the Cadence contract generated by Claude/ChatGPT...'
                        : 'Generated Cadence contract will appear here after the model responds...'
                    }
                    rows={12}
                    className="font-mono text-xs mt-2"
                    required
                  />
                  {workflowName && (
                    <p className="text-xs text-green-600 mt-1">
                      Auto-detected: {workflowName} ({category})
                    </p>
                  )}

                  {/* Code Validation Feedback */}
                  {validation && (
                    <div className="mt-2 space-y-1">
                      {validation.errors.length > 0 && (
                        <div className="text-xs space-y-1">
                          {validation.errors.map((error, i) => (
                            <div key={i} className="flex items-start gap-1 text-red-600">
                              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              <span>{error}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {validation.warnings.length > 0 && (
                        <div className="text-xs space-y-1">
                          {validation.warnings.map((warning, i) => (
                            <div key={i} className="flex items-start gap-1 text-yellow-600">
                              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              <span>{warning}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {validation.info.length > 0 && (
                        <div className="text-xs space-y-1">
                          {validation.info.map((info, i) => (
                            <div key={i} className="flex items-start gap-1 text-blue-600">
                              <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              <span>{info}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3 border border-slate-200 bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="isListed"
                      checked={isListed}
                      onCheckedChange={(checked) => setIsListed(checked as boolean)}
                    />
                    <Label htmlFor="isListed" className="text-sm cursor-pointer">
                      List in public registry
                    </Label>
                  </div>

                  <div>
                    <Label htmlFor="clonePrice" className="text-sm">
                      Clone Price (FLOW) - leave blank or 0 for free
                    </Label>
                    <Input
                      id="clonePrice"
                      type="number"
                      placeholder="0"
                      value={clonePrice}
                      onChange={(e) => setClonePrice(e.target.value)}
                      min="0"
                      step="0.01"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="imageIPFS" className="text-sm">
                      Workflow Image (IPFS URL) - optional
                    </Label>
                    <Input
                      id="imageIPFS"
                      type="text"
                      placeholder="https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/..."
                      value={imageIPFS}
                      onChange={(e) => setImageIPFS(e.target.value)}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Image displayed on workflow card. Defaults to coffee image if not provided.
                    </p>
                  </div>

                  <Button
                    onClick={handleDeployClick}
                    disabled={
                      !workflowName ||
                      !sourceCode ||
                      isPreparingDeployment ||
                      (validation && validation.errors.length > 0) ||
                      undefined
                    }
                    className="w-full"
                    size="lg"
                  >
                    {isPreparingDeployment
                      ? 'Preparing deployment...'
                      : creationMode === 'manual'
                      ? 'Deploy Workflow'
                      : 'Review & Deploy'}
                  </Button>
                  {validation && validation.errors.length > 0 && (
                    <p className="text-xs text-red-600 text-center">
                      Fix validation errors before deploying
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
          </Card>
        </div>
      )}

      <Modal
        open={isReviewModalOpen}
        onClose={() => {
          if (!isPreparingDeployment) {
            closeReviewModal();
          }
        }}
      >
        <ModalHeader
          title="Review Workflow Details"
          description="Update the public name and description before deploying."
          onClose={!isPreparingDeployment ? closeReviewModal : undefined}
        />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="review-name">Workflow Name</Label>
              <Input
                id="review-name"
                value={reviewName}
                onChange={(e) => {
                  setReviewName(e.target.value);
                  setReviewErrors(prev => ({ ...prev, name: undefined }));
                }}
                placeholder="Enter a unique workflow name"
              />
              {reviewErrors.name && (
                <p className="mt-1 text-xs text-red-600">{reviewErrors.name}</p>
              )}
              {checkingName && (
                <p className="mt-1 text-xs text-gray-500">Checking name availability...</p>
              )}
              {nameCheck?.conflict && (
                <div className="mt-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800 space-y-2">
                  <p>This name is already used for one of your registered workflows.</p>
                  {nameCheck.suggestion && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const suggestion = nameCheck.suggestion;
                        if (suggestion) {
                          setReviewName(suggestion);
                          setReviewErrors(prev => ({ ...prev, name: undefined }));
                        }
                      }}
                    >
                      Use "{nameCheck.suggestion}"
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="review-description">Short Description</Label>
              <Textarea
                id="review-description"
                value={reviewDescription}
                onChange={(e) => {
                  setReviewDescription(e.target.value);
                  setIsDescriptionManuallyEdited(true);
                  setReviewErrors(prev => ({ ...prev, description: undefined }));
                }}
                rows={4}
                placeholder="Describe what this workflow does"
              />
              {reviewErrors.description && (
                <p className="mt-1 text-xs text-red-600">{reviewErrors.description}</p>
              )}
            </div>

            <div>
              <Label htmlFor="review-price">Clone Price (FLOW)</Label>
              <Input
                id="review-price"
                type="number"
                placeholder="0 for free"
                value={clonePrice}
                onChange={(e) => setClonePrice(e.target.value)}
                min="0"
                step="0.01"
              />
              <p className="mt-1 text-xs text-gray-500">
                Users will pay this amount to clone your workflow. Leave blank or 0 for free.
              </p>
            </div>

            <div>
              <Label htmlFor="review-image">Workflow Image (IPFS URL)</Label>
              <Input
                id="review-image"
                type="text"
                placeholder="https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/..."
                value={imageIPFS}
                onChange={(e) => setImageIPFS(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Image displayed on workflow card in marketplace. Defaults to coffee image if not provided.
              </p>
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <p>
                Category: <span className="font-semibold">{category || '-'}</span>
              </p>
              <p className="text-gray-400">
                The contract name will be finalised automatically to avoid collisions in your account.
              </p>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="review-schedulable"
                  checked={Boolean(metadataOverrides.isSchedulable)}
                  onCheckedChange={(checked) => {
                    const isChecked = checked === true;
                    setMetadataOverrides(prev => {
                      const next: typeof prev = {
                        ...prev,
                        isSchedulable: isChecked,
                        defaultFrequency: isChecked
                          ? (prev.defaultFrequency || responseMetadata?.defaultFrequency || '86400')
                          : undefined
                      };
                      return next;
                    });
                  }}
                />
                <Label htmlFor="review-schedulable" className="text-sm text-slate-700 cursor-pointer">
                  Enable automatic scheduling
                </Label>
              </div>
              {metadataOverrides.isSchedulable ? (
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="review-frequency" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Default cadence (seconds)
                    </Label>
                    <Input
                      id="review-frequency"
                      value={metadataOverrides.defaultFrequency ?? ''}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        setMetadataOverrides(prev => ({
                          ...prev,
                          defaultFrequency: value
                        }));
                      }}
                      placeholder="86400"
                    />
                    <div className="mt-1 text-[11px] text-slate-500 space-y-1">
                      {describeFrequency(metadataOverrides.defaultFrequency) && (
                        <p>Currently {describeFrequency(metadataOverrides.defaultFrequency)}.</p>
                      )}
                      {responseMetadata?.defaultFrequency &&
                        responseMetadata.defaultFrequency !== metadataOverrides.defaultFrequency && (
                          <p className="text-slate-500">
                            Model suggested {describeFrequency(responseMetadata.defaultFrequency) ?? `${responseMetadata.defaultFrequency} seconds`}.
                          </p>
                        )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  This workflow will only run when triggered manually.
                  {responseMetadata?.isSchedulable && responseMetadata.defaultFrequency && (
                    <>
                      {' '}
                      Suggested schedule: {describeFrequency(responseMetadata.defaultFrequency) ?? `${responseMetadata.defaultFrequency} seconds`}.
                    </>
                  )}
                </p>
              )}
            </div>

            {derivedMetadata.configFields.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 space-y-3">
                <p className="font-semibold text-slate-600">Default configuration values</p>
                <div className="space-y-3">
                  {derivedMetadata.configFields.map((field) => {
                    const fieldId = `review-config-${field.name}`;
                    const overrideValue = metadataOverrides.defaultParameters[field.name] ?? '';
                    const rangeLabel =
                      field.min || field.max
                        ? `Range: ${field.min ?? '-'} - ${field.max ?? '-'}`
                        : null;
                    return (
                      <div key={field.name} className="space-y-1">
                        <Label htmlFor={fieldId} className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {field.label || formatLabelFromName(field.name)}
                          <span className="ml-1 text-[10px] text-slate-400 normal-case">({field.fieldType})</span>
                        </Label>
                        <Input
                          id={fieldId}
                          value={overrideValue}
                          onChange={(e) => {
                            const rawValue = e.target.value.trim();
                            setMetadataOverrides(prev => {
                              const previousValue =
                                prev.defaultParameters[field.name] ??
                                responseMetadata?.defaultParameters?.[field.name] ??
                                '';
                              const nextDefaults = {
                                ...prev.defaultParameters,
                                [field.name]: rawValue
                              };
                              if (rawValue && previousValue && rawValue !== previousValue) {
                                updateDescriptionsForOverride(previousValue, rawValue);
                              }
                              return {
                                ...prev,
                                defaultParameters: nextDefaults
                              };
                            });
                          }}
                        />
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {field.description && <span>{field.description}</span>}
                          {rangeLabel && <span className="font-mono text-slate-500">{rangeLabel}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
                onClick={() => setIsReviewCodeOpen(prev => !prev)}
              >
                {isReviewCodeOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {isReviewCodeOpen ? 'Hide generated Cadence code' : 'Show generated Cadence code'}
              </Button>
              {isReviewCodeOpen && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3">
                  <pre className="text-xs font-mono whitespace-pre-wrap">{sourceCode || '// No code generated yet.'}</pre>
                </div>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={closeReviewModal} disabled={isPreparingDeployment}>
            Cancel
          </Button>
          <Button
            onClick={confirmDeployment}
            disabled={
              isPreparingDeployment ||
              checkingName ||
              Boolean(nameCheck?.conflict) ||
              Boolean(validation && validation.errors.length > 0)
            }
          >
            {isPreparingDeployment ? 'Preparing...' : 'Confirm & Deploy'}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={isPreparingDeployment}
        onClose={handleCancelPreparation}
      >
        <ModalHeader
          title={
            preparationStep === 'transaction'
              ? 'Preparing deployment transaction...'
              : 'Uploading workflow to IPFS...'
          }
          onClose={handleCancelPreparation}
        />
        <ModalBody>
          <div className="space-y-4 py-8">
            <div className="flex justify-center items-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-300 border-t-blue-600" />
            </div>
            <div className="text-center space-y-3">
              <p className="text-sm font-semibold text-blue-700">
                {preparationStep === 'transaction'
                  ? 'Sanitizing code and building the deployment payload...'
                  : 'Uploading workflow source code to IPFS...'}
              </p>
              <p className="text-xs text-gray-500">
                {preparationStep === 'transaction'
                  ? 'Almost there! We are finalizing the transaction arguments before prompting your wallet.'
                  : 'This may take a few seconds depending on the file size.'}
              </p>
            </div>
            <div className="pt-2 text-center">
              <button
                type="button"
                className="text-xs font-medium text-gray-600 hover:text-gray-900"
                onClick={handleCancelPreparation}
              >
                Cancel deployment
              </button>
            </div>
          </div>
        </ModalBody>
      </Modal>

      <Modal
        open={isDeploymentPromptOpen && Boolean(pendingTransaction) && Boolean(pendingDeploymentDetails)}
        onClose={() => {
          setIsDeploymentPromptOpen(false);
          if (!isPreparingDeployment) {
            setPendingTransaction(null);
          }
        }}
      >
        <ModalHeader
          title="Sign Deployment Transaction"
          description="Review the summary below, then sign the Flow transaction to deploy your workflow."
          onClose={() => {
            setIsDeploymentPromptOpen(false);
            setPendingTransaction(null);
          }}
        />
        <ModalBody>
          <div className="space-y-3 text-sm text-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-500">Workflow</span>
              <span className="font-medium">{pendingDeploymentDetails?.workflowName || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Contract Name</span>
              <span className="font-mono text-xs">{pendingDeploymentDetails?.contractName || '-'}</span>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p>
                The transaction will deploy your Cadence contract, set up any required vaults, and
                register the workflow in ForteHub. You will be prompted by your wallet to approve the
                transaction.
              </p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsDeploymentPromptOpen(false);
              setPendingTransaction(null);
            }}
          >
            Cancel
          </Button>
          {pendingTransaction && (
            <TransactionButton
              transaction={pendingTransaction}
              label="Sign & Deploy"
              mutation={{
                onSuccess: (txId: string) => {
                  setDeploymentDialogTxId(txId);
                  setIsTransactionDialogOpen(true);
                  setIsDeploymentPromptOpen(false);
                  setPendingTransaction(null);
                  setStatusMessage({
                    type: 'info',
                    text: 'Transaction submitted. Waiting for confirmation...'
                  });
                },
                onError: (error: Error) => {
                  setStatusMessage({
                    type: 'error',
                    text: `Failed to submit transaction: ${error.message}`
                  });
                }
              }}
            />
          )}
        </ModalFooter>
      </Modal>

      <TransactionDialog
        open={isTransactionDialogOpen}
        onOpenChange={(open) => {
          setIsTransactionDialogOpen(open);
          if (!open) {
            setDeploymentDialogTxId(null);
            setPendingDeploymentDetails(null);
          }
        }}
        txId={deploymentDialogTxId || undefined}
        pendingTitle="Deploying workflow..."
        pendingDescription="Waiting for Flow to seal the transaction."
        successTitle="Workflow deployed!"
        successDescription={
          pendingDeploymentDetails
            ? `"${pendingDeploymentDetails.workflowName}" is now live on Flow.`
            : 'Workflow deployed successfully.'
        }
        closeOnSuccess
        onSuccess={handleTransactionSuccess}
      />

    </div>
  );
}

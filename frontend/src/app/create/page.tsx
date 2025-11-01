'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { WorkflowMetadata, WorkflowMetadataField, MetadataAsset} from '@/types/interfaces';
import { uploadWorkflowToIPFS } from '@/services/ipfs.service';
import { buildWorkflowPrompt } from '@/lib/agentPrompt';
import { validateWorkflowCode } from '@/lib/validateWorkflow';
import { sanitizeCadenceCode } from '@/lib/sanitizeCadence';
import { DEPLOY_WORKFLOW_TRANSACTION, buildDeploymentArgs, extractVaultSetupInfo, FORTEHUB_MANAGER_CONTRACT_CODE } from '@/lib/deploymentTransaction';
import { useFlowCurrentUser, useFlowQuery, useFlowMutate, Connect } from '@onflow/react-sdk';
import { Copy, Check, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { waitForTransactionSealed } from '@/lib/transactionStatus';

export default function CreateWorkflowPage() {
  const router = useRouter();
  const [strategy, setStrategy] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [isListed, setIsListed] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const { user } = useFlowCurrentUser();
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
  const [deploymentResult, setDeploymentResult] = useState<{
    type: 'success' | 'error';
    txId?: string;
    workflowName?: string;
    contractName?: string;
    error?: string;
  } | null>(null);
  const [deployedContractName, setDeployedContractName] = useState<string>('');
  const [isPollingTransaction, setIsPollingTransaction] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<string>('Checking transaction status...');

  const derivedMetadata = useMemo(() => {
    const result = buildMetadataFromSource(sourceCode, responseMetadata, {});
    return result;
  }, [sourceCode, responseMetadata]);

  // User subscription handled by useCurrentUser hook

  useEffect(() => {
    setCachedWorkflowNames(null);
  }, [userAddress]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Deployment mutation hook
  const { mutate: deployWorkflowMutation, isPending: isDeploying, error: deploymentError } = useFlowMutate({
    mutation: {
      onSuccess: async (txId: string) => {
        console.log('✅ Transaction submitted:', { txId });
        console.log('Waiting for transaction to seal...');

        // Show polling modal
        setDeploymentResult({ type: 'success', txId });
        setPollingStatus('Checking transaction status...');
        setIsPollingTransaction(true);

        try {
          // Wait for transaction to seal before showing final success
          const network = process.env.NEXT_PUBLIC_NETWORK || 'testnet';
          setPollingStatus('Polling Flow Access Node (this may take 15-30 seconds)...');
          const result = await waitForTransactionSealed(txId, 60, network);

          console.log('📊 Poll result:', result);

          if (result.error) {
            console.error('❌ Transaction error detected:', result.error);
            setPollingStatus('Transaction failed - check error details');
            setIsPollingTransaction(false);
            setDeploymentResult({
              type: 'error',
              error: result.error || 'Transaction failed. Check Flowscan for details.',
              txId
            });
          } else if (result.sealed) {
            console.log('✅ Transaction sealed successfully');
            setPollingStatus('Transaction sealed! Workflow deployed.');

            // Keep modal open for 1 second to show the sealed message
            await new Promise(resolve => setTimeout(resolve, 1000));
            setIsPollingTransaction(false);

            setDeploymentResult({
              type: 'success',
              txId,
              workflowName: reviewName || workflowName,
              contractName: deployedContractName
            });

            // Reset form for next workflow
            setWorkflowName('');
            setDescription('');
            setSourceCode('');
            setStrategy('');
            setIsListed(true);
            setCachedWorkflowNames(null);
            setResponseMetadata(null);
            setDeployedContractName('');

            // Small delay then navigate to browse to see the new workflow
            setTimeout(() => {
              router.push('/browse');
            }, 2000);
          } else {
            console.warn('⚠️ Transaction status unknown:', result);
            setPollingStatus(`Status unknown: ${result.statusString || 'UNKNOWN'}`);
            setIsPollingTransaction(false);
            setDeploymentResult({
              type: 'error',
              error: `Transaction status unknown after polling. Check Flowscan manually: ${result.statusString}`,
              txId
            });
          }
        } catch (error) {
          console.error('❌ Error waiting for transaction:', error);
          setPollingStatus('Error during polling');
          setIsPollingTransaction(false);
          setDeploymentResult({
            type: 'error',
            error: `Failed to confirm transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
            txId
          });
        }
      },
      onError: (error: Error) => {
        console.error('Deployment error:', error);
        setDeploymentResult({
          type: 'error',
          error: error.message || 'Deployment failed. Check your Cadence code syntax and ensure all imports are correct.'
        });
      }
    }
  });

  // Show error when deployment error changes
  useEffect(() => {
    if (deploymentError) {
      setDeploymentResult({
        type: 'error',
        error: deploymentError.message || 'Deployment failed'
      });
    }
  }, [deploymentError]);

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
          if (metadata.defaultParameters && Object.keys(metadata.defaultParameters).length > 0) {
            setOriginalDefaults({ ...metadata.defaultParameters });
            setConfigOverrides({ ...metadata.defaultParameters });
          }

          // Now set sourceCode which will trigger useMemo with responseMetadata already set
          setWorkflowName(parsed.workflowName);
          setCategory(parsed.category || 'yield');
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

  function formatLabelFromName(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
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

  function buildMetadataFromSource(
    code: string,
    existingMetadata?: WorkflowMetadata,
    overrides?: Record<string, string>
  ): WorkflowMetadata {
    // Use existing metadata from the JSON response, or create empty metadata if none provided
    const configFields = existingMetadata?.configFields || [];
    const defaultParameters: Record<string, string> = { ...existingMetadata?.defaultParameters || {} };

    // Apply any overrides
    if (overrides) {
      Object.entries(overrides).forEach(([key, value]) => {
        defaultParameters[key] = value;
      });
    }

    return {
      assets: existingMetadata?.assets ?? [],
      configFields,
      defaultParameters,
      notes: existingMetadata?.notes ?? {},
      isSchedulable: existingMetadata?.isSchedulable,
      defaultFrequency: existingMetadata?.defaultFrequency
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

  const executeDeployment = async (finalName: string, finalDescription: string) => {
    if (!userAddress) {
      setStatusMessage({
        type: 'info',
        text: 'Please connect your wallet before deploying an workflow.'
      });
      return;
    }

    setIsUploading(true);

    try {
      // Strip metadata block and sanitize code before IPFS upload
      const sanitizedSource = stripMetadataBlock(sanitizeCadenceCode(sourceCode));
      const balancedCleanSource = ensureClosingBrace(sanitizedSource);

      const { cid, hash } = await uploadWorkflowToIPFS(balancedCleanSource, {
        name: finalName,
        creator: userAddress,
        category,
        description: finalDescription
      });

      console.log('Uploaded to IPFS:', { cid, hash });

      const contractNameMatch = sourceCode.match(/access\(all\)\s+contract\s+(\w+)/);
      if (!contractNameMatch) {
        setStatusMessage({
          type: 'error',
          text: 'Could not find contract name in generated code. Ensure it includes "access(all) contract YourContractName {".'
        });
        setIsUploading(false);
        return;
      }
      const baseContractName = contractNameMatch[1];

      const metadata = buildMetadataFromSource(sourceCode, responseMetadata || undefined, {});
      const metadataJSON = JSON.stringify(metadata);

      const contractName = await ensureUniqueContractName(baseContractName);

      // Store contract name for success modal
      setDeployedContractName(contractName);

      console.log('Base contract name:', baseContractName);
      console.log('Deployment contract name:', contractName);

      const deploymentCode = sourceCode.replace(
        new RegExp(`\\b${baseContractName}\\b`, 'g'),
        contractName
      );

      const sanitizedDeploymentCode = stripMetadataBlock(
        sanitizeCadenceCode(deploymentCode)
      );
      const balancedDeploymentCode = ensureClosingBrace(sanitizedDeploymentCode);

      console.log('Base contract name:', baseContractName);
      console.log('Deployment contract name:', contractName);
      console.log('IPFS hash (original code):', hash);
        
      // Extract vault setup info from metadata and source code
      const vaultSetupInfo = extractVaultSetupInfo(metadataJSON, sourceCode);

      // Check if ForteHubManager already exists on the user's account
      // For now, always attempt to deploy (deployment will skip if it already exists)
      let shouldDeployManager = true;
      console.log('ForteHubManager deploy check (assuming deploy needed):', shouldDeployManager);

      // Debug all deployment arguments
      console.log('Deployment arguments:', {
        contractName,
        balancedDeploymentCode: `${balancedDeploymentCode.substring(0, 100)}...`,
        finalName,
        category,
        finalDescription,
        cid,
        hash,
        isListed,
        userAddress,
        metadataJSON: `${metadataJSON.substring(0, 50)}...`,
        vaultSetupInfo,
        shouldDeployManager
      });
      
      // Use the unified one-shot deployment transaction
      deployWorkflowMutation({
        cadence: DEPLOY_WORKFLOW_TRANSACTION,
        args: (arg: any, t: any) =>
          buildDeploymentArgs(
            String(contractName),
            String(balancedDeploymentCode),
            String(finalName),
            String(category),
            String(finalDescription),
            String(cid),
            isListed,
            String(userAddress),
            String(metadataJSON),
            vaultSetupInfo,
            shouldDeployManager,
            arg,
            t
          )
      });

    } catch (error) {
      console.error('Deployment error:', error);
      setStatusMessage({
        type: 'error',
        text: `Failed to deploy workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeployClick = () => {
    if (isUploading) return;
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
    setReviewErrors({});
    setNameCheck(null);
    setIsReviewModalOpen(true);
  };

  const closeReviewModal = () => {
    if (isUploading) return;
    setIsReviewModalOpen(false);
    setReviewErrors({});
    setNameCheck(null);
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
    await executeDeployment(trimmedName, trimmedDescription);
  };

  const connectWallet = async () => {
    // User connects wallet through the Flow wallet UI
    // useCurrentUser hook automatically updates user state
    setStatusMessage({
      type: 'info',
      text: 'Please connect your wallet using the wallet button in the header.'
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Create New Workflow</h1>
        <p className="text-gray-600">
          Describe your strategy, copy the prompt to Claude AI, then paste the generated code back here
        </p>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {(
    <Card>
      <CardHeader>
        <CardTitle>Step 1: Describe Your Strategy</CardTitle>
        <CardDescription>
          Tell us what you want your workflow to do
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="strategy">Workflow Strategy *</Label>
          <Textarea
            id="strategy"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
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
  )}

  {/* Step 2 - Deploy Workflow */}
  <Card>
    <CardHeader>
      <CardTitle>Step 2: Deploy Your Workflow</CardTitle>
      <CardDescription>
        Paste the generated code - name and category will be auto-detected
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!userAddress ? (
        <div className="p-8 text-center bg-slate-50 rounded-lg border-2 border-dashed">
          <p className="text-gray-600 mb-4">Connect your wallet to deploy workflows</p>
          <Connect/>
        </div>
      ) : (
        <>
          <div className="p-3 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-green-800">
              ✓ Connected: {userAddress.slice(0, 8)}...{userAddress.slice(-4)}
            </p>
          </div>

          <div>
            <Label htmlFor="source-code">Cadence Source Code *</Label>
            <Textarea
              id="source-code"
              value={sourceCode}
              onChange={(e) => handleSourceCodeChange(e.target.value)}
              placeholder="Paste the Cadence contract generated by Claude/ChatGPT..."
              rows={12}
              className="font-mono text-xs mt-2"
              required
            />
            {workflowName && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Auto-detected: {workflowName} ({category})
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
            {/* FIX APPLIED: Removed the invalid <p> tag that was wrapping the checkbox div */}
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

            <Button
              onClick={handleDeployClick}
              disabled={!workflowName || !sourceCode || isUploading || (validation && validation.errors.length > 0) || undefined}
              className="w-full"
              size="lg"
            >
              {isUploading ? 'Deploying to IPFS & Flow...' : 'Deploy Workflow'}
            </Button>
            {validation && validation.errors.length > 0 && (
              <p className="text-xs text-red-600 text-center">
                Fix validation errors before deploying
              </p>
            )}
          </div> {/* Closing div for the space-y-3 options container */}
        </> /* Closing fragment */
      )} {/* Closing ternary for userAddress check */}
    </CardContent>
  </Card>
</div>

      <Modal
        open={isReviewModalOpen}
        onClose={() => {
          if (!isUploading) {
            closeReviewModal();
          }
        }}
      >
        <ModalHeader
          title="Review Workflow Details"
          description="Update the public name and description before deploying."
          onClose={!isUploading ? closeReviewModal : undefined}
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
                <p className="mt-1 text-xs text-gray-500">Checking name availability…</p>
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
                  setReviewErrors(prev => ({ ...prev, description: undefined }));
                }}
                rows={4}
                placeholder="Describe what this workflow does"
              />
              {reviewErrors.description && (
                <p className="mt-1 text-xs text-red-600">{reviewErrors.description}</p>
              )}
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <p>
                Category: <span className="font-semibold">{category || '—'}</span>
              </p>
              {derivedMetadata.isSchedulable && (
                <p className="text-blue-600">
                  ✓ Schedulable: This workflow can be set to run autonomously
                  {derivedMetadata.defaultFrequency && ` (suggested: every ${Math.floor(parseInt(derivedMetadata.defaultFrequency) / 3600)} hours)`}
                </p>
              )}
              {!derivedMetadata.isSchedulable && (
                <p className="text-amber-600">
                  ○ Manual only: This workflow must be triggered manually
                </p>
              )}
              <p className="text-gray-400">
                The contract name will be finalised automatically to avoid collisions in your account.
              </p>
            </div>


            {derivedMetadata.configFields.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 space-y-2">
                <p className="font-semibold text-slate-600">Default configuration values</p>
                <div className="space-y-1">
                  {derivedMetadata.configFields.map((field) => {
                    const defaultValue = derivedMetadata.defaultParameters[field.name] ?? '—';
                    return (
                      <div key={field.name} className="flex justify-between gap-4">
                        <span>{field.label || formatLabelFromName(field.name)}</span>
                        <span className="font-mono text-slate-600">
                          {defaultValue}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={closeReviewModal} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={confirmDeployment}
            disabled={isUploading || checkingName || Boolean(nameCheck?.conflict)}
          >
            {isUploading ? 'Deploying…' : 'Confirm & Deploy'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Transaction Polling Modal */}
      <Modal
        open={isPollingTransaction}
        onClose={() => {
          setIsPollingTransaction(false);
          setPollingStatus('Checking transaction status...');
          setDeploymentResult({
            type: 'error',
            error: 'Deployment polling cancelled. You can check your transaction status on Flowscan with the transaction ID below.',
            txId: deploymentResult?.txId
          });
        }}
      >
        <ModalHeader
          title="Confirming Deployment..."
          description="Waiting for transaction to seal on Flow Testnet"
          onClose={() => {
            setIsPollingTransaction(false);
            setPollingStatus('Checking transaction status...');
            setDeploymentResult({
              type: 'error',
              error: 'Deployment polling cancelled. You can check your transaction status on Flowscan with the transaction ID below.',
              txId: deploymentResult?.txId
            });
          }}
        />
        <ModalBody>
          <div className="space-y-4 py-8">
            <div className="flex justify-center items-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-300 border-t-blue-600"></div>
            </div>
            <div className="text-center space-y-3">
              <p className="text-sm font-semibold text-blue-700">{pollingStatus}</p>
              <p className="text-xs text-gray-500">
                This typically takes 15-30 seconds. Please don't close this tab.
              </p>
            </div>
            {deploymentResult?.txId && (
              <div className="bg-gray-50 rounded p-3 text-xs font-mono text-center text-gray-600 break-all">
                {deploymentResult.txId}
              </div>
            )}
            <div className="pt-4 text-center">
              <p className="text-xs text-gray-600 mb-3">
                If this is taking too long, you can check Flowscan manually:
              </p>
              {deploymentResult?.txId && (
                <a
                  href={`https://${process.env.NEXT_PUBLIC_NETWORK === 'testnet' ? 'testnet.' : ''}flowscan.io/transaction/${deploymentResult.txId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  View on Flowscan
                </a>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            onClick={() => {
              setIsPollingTransaction(false);
              setPollingStatus('Checking transaction status...');
              setDeploymentResult({
                type: 'error',
                error: 'Deployment polling cancelled. You can check your transaction status on Flowscan with the transaction ID.',
                txId: deploymentResult?.txId
              });
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
        </ModalFooter>
      </Modal>

      {/* Deployment Success Modal */}
      <Modal
        open={deploymentResult?.type === 'success' && !isPollingTransaction}
        onClose={() => setDeploymentResult(null)}
      >
        <ModalHeader
          title="🎉 Workflow Deployed Successfully!"
          onClose={() => setDeploymentResult(null)}
        />
        <ModalBody>
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">{deploymentResult?.workflowName}</h3>
              <p className="text-sm text-gray-600">
                Your workflow has been deployed to Flow testnet and registered in ForteHub.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              {deploymentResult?.contractName && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Contract Name:</span>
                  <span className="font-mono">{deploymentResult.contractName}</span>
                </div>
              )}
              {deploymentResult?.txId && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-gray-600">Transaction ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {deploymentResult.txId.slice(0, 8)}...{deploymentResult.txId.slice(-6)}
                    </span>
                    <button
                      onClick={() => window.open(`https://testnet.flowscan.io/transaction/${deploymentResult.txId}`, '_blank')}
                      className="text-blue-600 hover:text-blue-800"
                      title="View on Flowscan"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500 text-center">
              Your workflow is now live on testnet. You can view it in your dashboard or the public registry.
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDeploymentResult(null);
            }}
          >
            Create Another Workflow
          </Button>
          <Button
            onClick={() => {
              setDeploymentResult(null);
              router.push('/dashboard');
            }}
          >
            View in Dashboard
          </Button>
        </ModalFooter>
      </Modal>

      {/* Deployment Error Modal */}
      <Modal
        open={deploymentResult?.type === 'error' && !isPollingTransaction}
        onClose={() => setDeploymentResult(null)}
      >
        <ModalHeader
          title="Deployment Failed"
          onClose={() => setDeploymentResult(null)}
        />
        <ModalBody>
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <AlertCircle className="w-16 h-16 text-red-500" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-red-800">
                Failed to Deploy Workflow
              </h3>
              <p className="text-sm text-gray-600">
                Your workflow could not be deployed to Flow testnet.
              </p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-48 overflow-y-auto">
              <p className="text-sm text-red-800 font-mono break-words whitespace-pre-wrap">
                {deploymentResult?.error || 'Unknown error occurred'}
              </p>
            </div>

            <div className="text-xs text-gray-600 space-y-2">
              <p className="font-semibold">Troubleshooting steps:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Check Flowscan link above to see the full transaction error</li>
                <li>If error mentions "invalid syntax", check that code follows Cadence 1.0 rules</li>
                <li>If error mentions "already exists", use a different contract name</li>
                <li>If error mentions "insufficient balance", fund your account with more FLOW</li>
                <li>For other errors, copy the error message and share with support</li>
              </ol>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setDeploymentResult(null)}
          >
            Close
          </Button>
          <Button
            onClick={() => {
              setDeploymentResult(null);
              // User can try again - form isn't reset on error
            }}
          >
            Try Again
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, type ComponentProps } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { fetchWorkflowFromIPFS, computeSourceHash } from '@/services/ipfs.service';
import { ArrowLeft, ExternalLink, Copy, Check, AlertTriangle } from 'lucide-react';
import { useFlowCurrentUser, TransactionButton, TransactionDialog, useFlowQuery } from '@onflow/react-sdk';
import { WorkflowInfo } from '@/types/interfaces';
import { useSelectedWorkflow } from '@/lib/WorkflowContext';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  normalizeWorkflowInfo,
  normalizeCadenceDictionary,
  metadataToVarMap
} from '@/lib/flowScripts';
import { prepareCloneTransaction as prepareCloneTransactionHelper } from '@/lib/cloneUtils';
import { ConfigurableVariablesModal, type ConfigurableVariable } from '@/components/workflow/ConfigurableVariablesModal';

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');

type TransactionConfig = ComponentProps<typeof TransactionButton>['transaction'];

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<WorkflowInfo | null>(null);
  const [sourceCode, setSourceCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingSource, setLoadingSource] = useState(true);
  const [copied, setCopied] = useState(false);
  const [hashValid, setHashValid] = useState<boolean | null>(null);
  const [computedIpfsHash, setComputedIpfsHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [unlistModal, setUnlistModal] = useState<WorkflowInfo | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<WorkflowInfo | null>(null);
  const [rescheduleFrequency, setRescheduleFrequency] = useState<number>(86400);
  const [isBuildingCloneTx, setIsBuildingCloneTx] = useState(false);
  const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [transactionSuccessMeta, setTransactionSuccessMeta] = useState<{ type: 'clone' | 'unlist'; workflowName?: string } | null>(null);
  const [configurableVariables, setConfigurableVariables] = useState<Record<string, ConfigurableVariable>>({});
  const [variablesModalOpen, setVariablesModalOpen] = useState(false);
  const [cloneTransactionBuilder, setCloneTransactionBuilder] = useState<((overrides: Record<string, ConfigurableVariable>) => TransactionConfig) | null>(null);
  const [deploymentSummary, setDeploymentSummary] = useState<{ contractName: string; description?: string } | null>(null);

  const { user } = useFlowCurrentUser();
  const userAddress = user?.addr || null;
  const { selectedWorkflow } = useSelectedWorkflow();
  const isCreatorAddress = workflow?.creator?.toLowerCase() === userAddress?.toLowerCase();
  const cloningLocked = Boolean(workflow?.clonesLocked);
  const isListed = workflow?.isListed !== false;
  const canClone = Boolean(workflow && !isCreatorAddress && !cloningLocked && isListed);

  const beginTransactionTracking = (
    txId: string,
    meta: { type: 'clone' | 'unlist'; workflowName?: string }
  ) => {
    setTransactionDialogTxId(txId);
    setIsTransactionDialogOpen(true);
    setTransactionSuccessMeta(meta);
    setStatusMessage({
      type: 'info',
      text: 'Transaction submitted. Waiting for confirmation...'
    });
  };

  // Use context workflow if available (from discover page navigation)
  useEffect(() => {
    if (selectedWorkflow) {
      console.log('Using workflow from context:', selectedWorkflow);
      setWorkflow(selectedWorkflow);
      setLoading(false);

      setLoadingSource(true);
      (async () => {
        try {
          setHashValid(null);
          setComputedIpfsHash(null);

          // Fetch source code from IPFS
          const source = await fetchWorkflowFromIPFS(selectedWorkflow.sourceCodeIPFS);
          setSourceCode(source);

          // Compute SHA-256 hash of fetched source code
          const ipfsHash = computeSourceHash(source);
          setComputedIpfsHash(ipfsHash);

          // Compare with registry hash
          const registryHash = selectedWorkflow.sourceCodeHash;
          const hashesMatch = ipfsHash === registryHash;
          setHashValid(hashesMatch);

          if (!hashesMatch) {
            console.warn('Hash mismatch detected:', {
              ipfsHash,
              registryHash,
              workflowId: selectedWorkflow.workflowId
            });
          }
        } catch (error) {
          console.error('Failed to load source code:', error);
          setSourceCode('// Failed to load source code from IPFS');
          setHashValid(false);
        } finally {
          setLoadingSource(false);
        }
      })();
    }
  }, [selectedWorkflow]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Parse configurable variables from workflow metadata
  useEffect(() => {
    if (!workflow || !workflow.metadataJSON) {
      setConfigurableVariables({});
      return;
    }

    try {
      const metadata = JSON.parse(workflow.metadataJSON);
      const vars: Record<string, { value: string; type: string; label?: string; min?: string; max?: string }> = {};

      // Convert metadata entries to configurable variables
      Object.entries(metadata).forEach(([key, value]) => {
        vars[key] = {
          value: String(value),
          type: typeof value === 'number' ? 'number' : 'string',
          label: key.replace(/([A-Z])/g, ' $1').trim()
        };
      });

      setConfigurableVariables(vars);
    } catch (error) {
      console.error('Failed to parse workflow metadata:', error);
      setConfigurableVariables({});
    }
  }, [workflow]);


  // Fetch workflow details using useFlowQuery
  const { data: rawInfo, isLoading: isLoadingWorkflow, error: workflowError } = useFlowQuery({
    cadence: `
      import ForteHubRegistry from ${FORTEHUB_REGISTRY}

      access(all) fun main(id: UInt64): ForteHubRegistry.WorkflowInfo? {
        return ForteHubRegistry.getWorkflowInfo(workflowId: id)
      }
    `,
    args: (arg, t) => [arg(workflowId, t.UInt64)],
    query: {
      enabled: !!workflowId,
      staleTime: 30000
    }
  }) as { data: any; isLoading: boolean; error: Error | null };



  // Process workflow data when loaded
  useEffect(() => {
    if (!rawInfo) {
      if (!isLoadingWorkflow && workflowError) {
        setStatusMessage({ type: 'error', text: 'Workflow not found.' });
        router.push('/discover');
      }
      setLoading(isLoadingWorkflow);
      return;
    }

    try {
      const normalizedBase = normalizeWorkflowInfo({ ...rawInfo, workflowId: parseInt(workflowId) });

      let registryVars = normalizedBase.metadata ? metadataToVarMap(normalizedBase.metadata) : {};
      if ((!registryVars || Object.keys(registryVars).length === 0) && rawInfo.updatableVariables) {
        registryVars = normalizeCadenceDictionary(rawInfo.updatableVariables);
      }

      const normalizedInfo: WorkflowInfo = {
        ...normalizedBase,
        updatableVariables:
          registryVars && Object.keys(registryVars).length > 0 ? registryVars : undefined
      };

      setWorkflow(normalizedInfo);

      // Load source code
      setLoadingSource(true);
      (async () => {
        try {
          // Validate IPFS CID format (should start with bafy, bafk, or Qm, or be a hex hash)
          const isValidCID = normalizedInfo.sourceCodeIPFS &&
            (normalizedInfo.sourceCodeIPFS.startsWith('bafy') ||
              normalizedInfo.sourceCodeIPFS.startsWith('bafk') ||
              normalizedInfo.sourceCodeIPFS.startsWith('Qm') ||
              /^[a-f0-9]{64}$/.test(normalizedInfo.sourceCodeIPFS)); // SHA-256 hex hash

          if (!isValidCID) {
            console.warn(`Invalid IPFS CID: ${normalizedInfo.sourceCodeIPFS}`);
            setSourceCode('// Source code CID is invalid or missing');
            setHashValid(false);
            setComputedIpfsHash(null);
            setLoadingSource(false);
            return;
          }

          // Fetch source code from IPFS
          const source = await fetchWorkflowFromIPFS(normalizedInfo.sourceCodeIPFS);
          setSourceCode(source);

          // Compute SHA-256 hash of fetched source code
          const ipfsHash = computeSourceHash(source);
          setComputedIpfsHash(ipfsHash);

          // Compare with registry hash (on-chain stored hash)
          const registryHash = normalizedInfo.sourceCodeHash;
          const hashesMatch = ipfsHash === registryHash;
          setHashValid(hashesMatch);

          if (!hashesMatch) {
            console.warn('Hash mismatch detected:', {
              ipfsHash,
              registryHash,
              workflowId: normalizedInfo.workflowId
            });
          }
        } catch (error) {
          console.error('Failed to load source code:', error);
          setSourceCode('// Failed to load source code from IPFS');
          setHashValid(false);
          setComputedIpfsHash(null);
        } finally {
          setLoadingSource(false);
        }
      })();

      setLoading(false);
    } catch (error) {
      console.error('Failed to load workflow:', error);
      setStatusMessage({ type: 'error', text: 'Failed to load workflow details.' });
    }
  }, [rawInfo, isLoadingWorkflow, workflowError, workflowId]);

  const handleTransactionSuccess = () => {
    if (transactionSuccessMeta?.type === 'clone') {
      setStatusMessage({
        type: 'success',
        text: transactionSuccessMeta.workflowName
          ? `Workflow "${transactionSuccessMeta.workflowName}" cloned successfully.`
          : 'Workflow cloned successfully.'
      });
    } else if (transactionSuccessMeta?.type === 'unlist') {
      setStatusMessage({
        type: 'success',
        text: 'Workflow removed from registry.'
      });
      // Re-fetch workflow data to reflect unlist status
      // useFlowQuery will automatically refetch when queryKey dependencies change
    }
    setTransactionSuccessMeta(null);
  };

  const handleClone = async () => {
    if (!workflow) return;

    if (!userAddress) {
      setStatusMessage({ type: 'info', text: 'Please connect your wallet first.' });
      return;
    }

    if (workflow.clonesLocked) {
      setStatusMessage({ type: 'error', text: 'Cloning has been locked by the creator.' });
      return;
    }

    if (workflow.isListed === false) {
      setStatusMessage({ type: 'error', text: 'This workflow is unlisted and cannot be cloned.' });
      return;
    }

    const startPreparation = async () => {
      setIsBuildingCloneTx(true);
      try {
        const clonePrep = await prepareCloneTransactionHelper(
          workflow,
          sourceCode && sourceCode.trim().length > 0 ? { sourceCode } : undefined
        );

        setCloneTransactionBuilder(() => clonePrep.transactionBuilder);
        setConfigurableVariables(clonePrep.configVariables);
        const priceText = workflow.price === null || workflow.price === undefined || workflow.price === 0
          ? 'FREE clone'
          : `${workflow.price} FLOW clone fee`;
        setDeploymentSummary({
          contractName: workflow.contractName,
          description: `Clone "${workflow.name}" to your account. ${priceText}.`
        });
        setVariablesModalOpen(true);
      } catch (error) {
        console.error('Failed to prepare clone transaction:', error);
        setStatusMessage({
          type: 'error',
          text: `Failed to prepare clone: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      } finally {
        setIsBuildingCloneTx(false);
      }
    };

    if (hashValid === false) {
      setConfirmModal({
        title: 'IPFS CID mismatch',
        description: 'The IPFS CID for this workflow differs from the registry entry. Deploy only if you trust this source.',
        onConfirm: async () => {
          setConfirmLoading(true);
          try {
            await startPreparation();
            setConfirmModal(null);
          } finally {
            setConfirmLoading(false);
          }
        }
      });
      return;
    }

    await startPreparation();
  };
  const handleCopySource = () => {
    navigator.clipboard.writeText(sourceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyIPFS = () => {
    if (workflow) {
      navigator.clipboard.writeText(workflow.sourceCodeIPFS);
      setStatusMessage({ type: 'success', text: 'IPFS CID copied to clipboard.' });
    }
  };

  const buildUnlistTransaction = (workflow: WorkflowInfo): TransactionConfig => ({
    cadence: `
      import ForteHubRegistry from ${FORTEHUB_REGISTRY}

      transaction(workflowId: UInt64) {
        prepare(signer: auth(Storage) &Account) {
          ForteHubRegistry.setWorkflowListing(workflowId: workflowId, creator: signer.address, isListed: false)
        }
      }
    `,
    limit: 5000,
    args: (arg, t) => [arg(workflow.workflowId.toString(), t.UInt64)]
  });

  const handleReschedule = async (workflow: WorkflowInfo, frequencySeconds: number) => {
    if (!userAddress || !workflow.contractName) return;

    // For now, show placeholder - full implementation needs deployed contract name
    setStatusMessage({
      type: 'info',
      text: 'Reschedule feature requires deployed contract access - coming soon'
    });
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors: Record<string, string> = {
      yield: 'bg-green-100 text-green-800',
      dca: 'bg-blue-100 text-blue-800',
      rebalancing: 'bg-purple-100 text-purple-800',
      arbitrage: 'bg-orange-100 text-orange-800',
      lending: 'bg-yellow-100 text-yellow-800',
      liquidation: 'bg-red-100 text-red-800',
      governance: 'bg-indigo-100 text-indigo-800',
      nft: 'bg-pink-100 text-pink-800',
      bridge: 'bg-cyan-100 text-cyan-800',
    };
    return colors[category?.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading workflow details...</p>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b bg-white sticky top-0 z-40">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between max-w-7xl">
          <Button
            variant="ghost"
            onClick={() => router.push('/discover')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="text-xl font-bold text-slate-900">{workflow?.name || 'Workflow'}</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {statusMessage && (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm font-medium ${statusMessage.type === 'error'
              ? 'border-red-300 bg-red-50 text-red-700'
              : statusMessage.type === 'success'
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-blue-300 bg-blue-50 text-blue-700'
              }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Content (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image Card */}
            <Card className="overflow-hidden">
              <img
                src={workflow.imageIPFS || 'https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq'}
                alt={workflow.name}
                className="w-full h-80 object-cover bg-slate-200"
                onError={(e) => {
                  e.currentTarget.src = 'https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq';
                }}
              />
            </Card>

            {/* Description Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">{workflow.name}</CardTitle>
                <CardDescription className="text-base">{workflow.description}</CardDescription>
              </CardHeader>
            </Card>

            {/* Key Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Clones</p>
                    <p className="text-2xl font-bold text-slate-900">{workflow.cloneCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Forks</p>
                    <p className="text-2xl font-bold text-slate-900">{workflow.forkCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Workflow ID</p>
                    <p className="text-lg font-bold text-slate-900">#{workflow.workflowId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Hash Status</p>
                    <p className="text-lg font-bold">
                      {hashValid === null ? (
                        <span className="text-slate-400">Checking...</span>
                      ) : hashValid ? (
                        <span className="text-green-600">✓ Verified</span>
                      ) : (
                        <span className="text-red-600">⚠ Unverified</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Cloning Status */}
                <div className="border-t mt-4 pt-4">
                  <p className="text-sm text-slate-600 font-medium mb-2">Cloning Status</p>
                  <Badge variant={cloningLocked ? 'outline' : isListed ? 'default' : 'secondary'}>
                    {cloningLocked ? 'Locked' : isListed ? 'Open' : 'Unlisted'}
                  </Badge>
                </div>

                {/* Parent Workflow */}
                {workflow.parentWorkflowId !== null && workflow.parentWorkflowId !== undefined && (
                  <div className="border-t mt-4 pt-4">
                    <p className="text-sm text-slate-600 font-medium mb-1">Forked From</p>
                    <p className="text-sm text-slate-700">Workflow ID #{workflow.parentWorkflowId}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Hash Verification Details */}
            {workflow && workflow.sourceCodeHash && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Code Verification</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="bg-slate-50 rounded-lg p-3 space-y-2 font-mono text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-slate-600 flex-shrink-0">IPFS Hash:</span>
                      <code className="flex-1 text-xs break-all text-slate-800">{computedIpfsHash || 'Computing...'}</code>
                    </div>
                    <div className="border-t border-slate-200" />
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-slate-600 flex-shrink-0">Registry Hash:</span>
                      <code className="flex-1 text-xs break-all text-slate-800">{workflow.sourceCodeHash}</code>
                    </div>
                    <div className="border-t border-slate-200" />
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-slate-600 flex-shrink-0">Status:</span>
                      <span className={`font-semibold ${hashValid === true ? 'text-green-600' : hashValid === false ? 'text-red-600' : 'text-slate-500'}`}>
                        {hashValid === null ? '⏳ Verifying...' : hashValid ? '✓ Match' : '✗ Mismatch'}
                      </span>
                    </div>
                  </div>

                  {/* Hash Warning */}
                  {hashValid === false && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-red-800 text-xs">Hash Mismatch</p>
                        <p className="text-red-700 text-xs">Code may have been modified after registration. Do not clone.</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* IPFS Storage */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">IPFS Storage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-100 p-2 rounded text-xs font-mono break-all text-slate-700">
                    {workflow.sourceCodeIPFS}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyIPFS}
                    title="Copy IPFS CID"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `https://gateway.pinata.cloud/ipfs/${workflow.sourceCodeIPFS}`,
                        '_blank'
                      )
                    }
                    title="View on IPFS"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Actions & Metadata (1/3 width) */}
          <div className="space-y-6">
            {/* Creator Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Creator</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <p className="text-slate-600 mb-1">Created by</p>
                  <p className="font-mono text-xs bg-slate-100 p-2 rounded break-all text-slate-800">
                    {workflow.creator}
                  </p>
                </div>
                <Button variant="outline" className="w-full" size="sm">
                  View Creator Profile
                </Button>
              </CardContent>
            </Card>

            {/* Pricing Info Card */}
            {workflow.price !== null && workflow.price !== undefined && workflow.price > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Clone Price</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-600">{workflow.price} FLOW</p>
                  <p className="text-xs text-slate-600 mt-2">per clone</p>
                </CardContent>
              </Card>
            )}

            {/* Clone Button */}
            {!cloningLocked && userAddress && workflow.creator.toLowerCase() !== userAddress.toLowerCase() && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-6">
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => {
                      setIsBuildingCloneTx(true);
                      setConfigModalOpen(true);
                    }}
                    disabled={isBuildingCloneTx}
                  >
                    {isBuildingCloneTx ? 'Preparing...' : 'Clone Workflow'}
                  </Button>
                  <p className="text-xs text-slate-600 mt-3 text-center">
                    Clone this workflow to your wallet and customize it
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Creator Controls - Only Show if Owner */}
            {workflow && userAddress && workflow.creator.toLowerCase() === userAddress.toLowerCase() && (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="text-base">Creator Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    size="sm"
                    onClick={() => setUnlistModal(workflow)}
                  >
                    {workflow.isListed ? '📋 Unlist' : '✓ List'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    size="sm"
                    onClick={() => setRescheduleModal(workflow)}
                  >
                    ⏱️ Reschedule
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Locked Notice */}
            {cloningLocked && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-800 text-sm">Cloning Locked</p>
                      <p className="text-xs text-red-700 mt-1">
                        This workflow cannot be cloned at this time
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Marketplace Listings */}
        <Card>
          <CardHeader>
            <CardTitle>Marketplace Listings</CardTitle>
            <CardDescription>
              Peer-to-peer instances of this workflow currently for sale
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-slate-600 mb-3">No active marketplace listings for this workflow</p>
              <p className="text-sm text-slate-500">
                Clone this workflow, then list your instance for sale in the marketplace
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sales History */}
        <Card>
          <CardHeader>
            <CardTitle>Sales History & Activity</CardTitle>
            <CardDescription>
              Recent marketplace transactions for this workflow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-600 font-medium">Total Clones</p>
                  <p className="text-3xl font-bold text-blue-900 mt-2">{workflow?.cloneCount || 0}</p>
                  <p className="text-xs text-blue-700 mt-2">Times cloned from original</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                  <p className="text-sm text-green-600 font-medium">Forks Created</p>
                  <p className="text-3xl font-bold text-green-900 mt-2">{workflow?.forkCount || 0}</p>
                  <p className="text-xs text-green-700 mt-2">Derivatives from this workflow</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                  <p className="text-sm text-purple-600 font-medium">Marketplace Sales</p>
                  <p className="text-3xl font-bold text-purple-900 mt-2">0</p>
                  <p className="text-xs text-purple-700 mt-2">Coming in Phase 3</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 font-medium mb-2">📊 Activity Status</p>
                <p className="text-sm text-blue-700">
                  Sales history and marketplace activity tracking coming in Phase 3.
                  Real-time event data will show all P2P transactions for this workflow.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Source Code */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Source Code</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopySource}
                disabled={loadingSource}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Source
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingSource ? (
              <div className="text-center py-8 text-gray-600">Loading source code...</div>
            ) : (
              <pre className="bg-slate-950 text-slate-50 p-6 rounded-lg overflow-x-auto text-sm font-mono">
                {sourceCode}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unlist Modal */}
      <Modal
        open={!!unlistModal}
        onClose={() => setUnlistModal(null)}
      >
        <ModalHeader
          title="Remove from Registry"
          description="This workflow will no longer be publicly discoverable"
          onClose={() => setUnlistModal(null)}
        />
        <ModalBody>
          <p className="text-sm text-gray-600">
            Are you sure you want to remove "{unlistModal?.name}" from the public registry? You can list it again later.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setUnlistModal(null)}>
            Cancel
          </Button>
          {unlistModal && (
            <TransactionButton
              transaction={buildUnlistTransaction(unlistModal)}
              label="Unlist"
              mutation={{
                onSuccess: (txId: string) => {
                  beginTransactionTracking(txId, { type: 'unlist', workflowName: unlistModal.name });
                  setUnlistModal(null);
                },
                onError: (error: Error) => {
                  setStatusMessage({
                    type: 'error',
                    text: `Failed: ${error.message}`
                  });
                }
              }}
            />
          )}
        </ModalFooter>
      </Modal>

      {/* Reschedule Modal */}
      <Modal
        open={!!rescheduleModal}
        onClose={() => setRescheduleModal(null)}
      >
        <ModalHeader
          title="Reschedule Execution"
          description="Update how often this workflow runs"
          onClose={() => setRescheduleModal(null)}
        />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="frequency">Execution Frequency (seconds)</Label>
              <Input
                id="frequency"
                type="number"
                value={rescheduleFrequency}
                onChange={(e) => setRescheduleFrequency(Number(e.target.value))}
                placeholder="86400"
                min="60"
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-2">
                Examples: 60 (every minute) | 3600 (hourly) | 86400 (daily) | 604800 (weekly)
              </p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setRescheduleModal(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (rescheduleModal) {
                handleReschedule(rescheduleModal, rescheduleFrequency);
              }
            }}
          >
            Update Schedule
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={!!confirmModal}
        onClose={() => {
          if (!confirmLoading) {
            setConfirmModal(null);
          }
        }}
      >
        <ModalHeader
          title={confirmModal?.title || 'Confirm'}
          onClose={!confirmLoading ? () => setConfirmModal(null) : undefined}
        />
        <ModalBody>
          <p className="text-sm text-gray-600">{confirmModal?.description}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setConfirmModal(null)} disabled={confirmLoading}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!confirmModal) return;
              setConfirmLoading(true);
              try {
                await confirmModal.onConfirm();
              } finally {
                setConfirmLoading(false);
              }
            }}
            disabled={confirmLoading}
          >
            {confirmLoading ? 'Working…' : 'Continue'}
          </Button>
        </ModalFooter>
      </Modal>

      <TransactionDialog
        open={isTransactionDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsTransactionDialogOpen(open);
          if (!open) {
            setTransactionDialogTxId(null);
            setTransactionSuccessMeta(null);
          }
        }}
        txId={transactionDialogTxId || undefined}
        pendingTitle={
          transactionSuccessMeta?.type === 'unlist'
            ? 'Updating registry...'
            : 'Cloning workflow...'
        }
        pendingDescription="Waiting for Flow to seal the transaction."
        successTitle={
          transactionSuccessMeta?.type === 'unlist'
            ? 'Workflow unlisted'
            : 'Workflow cloned'
        }
        successDescription={
          transactionSuccessMeta?.type === 'clone'
            ? `Workflow "${transactionSuccessMeta?.workflowName ?? 'Workflow'}" is now available on your account.`
            : 'Registry updated successfully.'
        }
        closeOnSuccess
        onSuccess={handleTransactionSuccess}
      />

      <ConfigurableVariablesModal
        open={variablesModalOpen}
        onClose={() => {
          setVariablesModalOpen(false);
          setCloneTransactionBuilder(null);
          setDeploymentSummary(null);
          setConfigurableVariables({});
        }}
        variables={configurableVariables}
        workflowName={workflow?.name}
        deploymentSummary={deploymentSummary || undefined}
        transactionBuilder={cloneTransactionBuilder || undefined}
        onDeploySuccess={(txId: string) => {
          beginTransactionTracking(txId, {
            type: 'clone',
            workflowName: workflow?.name
          });
        }}
        onDeployError={(error: Error) => {
          setStatusMessage({
            type: 'error',
            text: `Failed to clone workflow: ${error.message}`
          });
        }}
      />
    </div>
  );
}

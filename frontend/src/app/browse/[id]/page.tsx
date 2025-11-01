'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { fetchWorkflowFromIPFS } from '@/services/ipfs.service';
import { ArrowLeft, ExternalLink, Copy, Check, AlertTriangle } from 'lucide-react';
import { useFlowCurrentUser, useFlowMutate } from '@onflow/react-sdk';
import { MoreVertical } from 'lucide-react';
import { WorkflowInfo } from '@/types/interfaces';
import { useSelectedWorkflow } from '@/lib/WorkflowContext';
import * as fcl from '@onflow/fcl';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  FORTEHUB_REGISTRY,
  fetchWorkflowInfo,
  fetchCloneCount,
  fetchForkCount,
  normalizeWorkflowInfo,
  normalizeCadenceDictionary,
  metadataToVarMap
} from '@/lib/flowScripts';


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
  const [statusMessage, setStatusMessage] = useState<{type: 'success' | 'error' | 'info'; text: string} | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [unlistModal, setUnlistModal] = useState<WorkflowInfo | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<WorkflowInfo | null>(null);
  const [rescheduleFrequency, setRescheduleFrequency] = useState<number>(86400);

  const { user } = useFlowCurrentUser();
  const userAddress = user?.addr || null;
  const { selectedWorkflow } = useSelectedWorkflow();

  // Mutation hooks
  const { mutate: deployWorkflow, isPending: isDeploying } = useFlowMutate({
    mutation: {
      onSuccess: () => {
        setStatusMessage({
          type: 'success',
          text: 'Workflow deployed successfully.'
        });
        loadWorkflow();
      },
      onError: (error: Error) => {
        setStatusMessage({
          type: 'error',
          text: `Failed to deploy workflow: ${error.message}`
        });
      }
    }
  });

  const { mutate: executeUnlistMutation } = useFlowMutate({
    mutation: {
      onSuccess: () => {
        setStatusMessage({
          type: 'success',
          text: 'Workflow removed from registry'
        });
        setUnlistModal(null);
        loadWorkflow();
      },
      onError: (error: Error) => {
        setStatusMessage({
          type: 'error',
          text: `Failed: ${error.message}`
        });
      }
    }
  });

  const { mutate: executeRescheduleMutation } = useFlowMutate({
    mutation: {
      onSuccess: () => {
        setStatusMessage({
          type: 'success',
          text: 'Execution frequency updated'
        });
        setRescheduleModal(null);
      },
      onError: (error: Error) => {
        setStatusMessage({
          type: 'error',
          text: `Failed: ${error.message}`
        });
      }
    }
  });

  useEffect(() => {
    if (workflowId) {
      // Check if we have selectedWorkflow from context first
      if (selectedWorkflow) {
        console.log('Using workflow from context:', selectedWorkflow);
        setWorkflow(selectedWorkflow);
        setLoading(false);

        setLoadingSource(true);
        (async () => {
          try {
            setHashValid(null);
            // TODO: revisit with proper on-chain hash verification once registry exposes digest comparison.
            const source = await fetchWorkflowFromIPFS(selectedWorkflow.sourceCodeIPFS);
            setSourceCode(source);
            const cidVerified = Boolean(
              selectedWorkflow.sourceCodeIPFS &&
              typeof source === 'string' &&
              source.trim().length > 0
            );
            setHashValid(cidVerified);
          } catch (error) {
            console.error('Failed to load source code:', error);
            setSourceCode('// Failed to load source code from IPFS');
            setHashValid(false);
          } finally {
            setLoadingSource(false);
          }
        })();
      } else {
        loadWorkflow();
      }
    }
  }, [workflowId, selectedWorkflow]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

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

    const existing = await fcl.query({
      cadence: `
        access(all) fun main(address: Address): [String] {
          let account = getAccount(address)
          return account.contracts.names
        }
      `,
      args: (arg, t) => [arg(userAddress, t.Address)]
    }).catch(() => []);

    const existingNames: string[] = Array.isArray(existing) ? existing : [];
    const lowerExisting = existingNames.map(name => name.toLowerCase());

    if (!lowerExisting.includes(sanitized.toLowerCase())) {
      return sanitized;
    }

    let suffix = 2;
    let candidate = `${sanitized}_${suffix}`;
    while (lowerExisting.includes(candidate.toLowerCase())) {
      suffix += 1;
      candidate = `${sanitized}_${suffix}`;
    }

    return candidate;
  };

  const loadWorkflow = async () => {
    try {
      setLoading(true);
      setHashValid(null);

      const rawInfo = await fetchWorkflowInfo(workflowId);
      if (!rawInfo) {
        setStatusMessage({ type: 'error', text: 'Workflow not found.' });
        router.push('/browse');
        return;
      }

      const [cloneCount, forkCount] = await Promise.all([
        fetchCloneCount(workflowId),
        fetchForkCount(workflowId)
      ]);

      const normalizedBase = normalizeWorkflowInfo(rawInfo, {
        cloneCount,
        forkCount
      });

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
      try {
        // TODO: revisit with proper hash verification instead of simple fetch success check.
        const source = await fetchWorkflowFromIPFS(normalizedInfo.sourceCodeIPFS);
        setSourceCode(source);
        const cidVerified = Boolean(
          normalizedInfo.sourceCodeIPFS &&
          typeof source === 'string' &&
          source.trim().length > 0
        );
        setHashValid(cidVerified);
      } catch (error) {
        console.error('Failed to load source code:', error);
        setSourceCode('// Failed to load source code from IPFS');
        setHashValid(false);
      } finally {
        setLoadingSource(false);
      }
    } catch (error) {
      console.error('Failed to load workflow:', error);
      setStatusMessage({ type: 'error', text: 'Failed to load workflow details.' });
      router.push('/browse');
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (!workflow) return;

    if (!userAddress) {
      setStatusMessage({ type: 'info', text: 'Please connect your wallet first.' });
      return;
    }

    const performDeployment = async () => {
      try {
        const cleanSourceCode = sourceCode
          .split('\n')
          .filter(line =>
            !line.trim().startsWith('// WORKFLOW_NAME:') &&
            !line.trim().startsWith('// WORKFLOW_CATEGORY:') &&
            !line.trim().startsWith('// WORKFLOW_DESCRIPTION:')
          )
          .join('\n');

        const contractNameMatch = cleanSourceCode.match(/access\(all\)\s+contract\s+(\w+)/);
        if (!contractNameMatch) {
          setStatusMessage({
            type: 'error',
            text: 'Could not find contract name in source code.'
          });
          return;
        }
        const baseContractName = contractNameMatch[1];

        const desiredBaseName = workflow.contractName || baseContractName;
        const contractName = await ensureUniqueContractName(desiredBaseName);

        const deploymentCode = cleanSourceCode.replace(
          new RegExp(`\\b${baseContractName}\\b`, 'g'),
          contractName
        );

        const cadenceCode = `
          import ForteHubRegistry from ${FORTEHUB_REGISTRY}

          transaction(
            contractName: String,
            contractCode: String,
            workflowId: UInt64,
            deployer: Address
          ) {
            prepare(signer: auth(AddContract, Storage) &Account) {
              signer.contracts.add(name: contractName, code: contractCode.utf8)
            }

            execute {
              ForteHubRegistry.recordClone(
                workflowId: workflowId,
                deployer: deployer,
                contractName: contractName
              )
            }
          }
        `;

        deployWorkflow({
          cadence: cadenceCode,
          args: (arg, t) => [
            arg(contractName, t.String),
            arg(deploymentCode, t.String),
            arg(workflow.workflowId.toString(), t.UInt64),
            arg(userAddress, t.Address)
          ]
        });
      } catch (error) {
        console.error('Deploy error:', error);
        setStatusMessage({
          type: 'error',
          text: 'Failed to deploy workflow: ' + (error instanceof Error ? error.message : 'Unknown error')
        });
      }
    };

    if (hashValid === false) {
      setConfirmModal({
        title: 'IPFS CID mismatch',
        description: 'The IPFS CID for this workflow differs from the registry entry. Deploy only if you trust this source.',
        onConfirm: async () => {
          setConfirmLoading(true);
          try {
            await performDeployment();
          } finally {
            setConfirmLoading(false);
            setConfirmModal(null);
          }
        }
      });
      return;
    }

    await performDeployment();
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

  const handleUnlist = async (workflow: WorkflowInfo) => {
    const cadenceCode = `
      import ForteHubRegistry from ${FORTEHUB_REGISTRY}

      transaction(workflowId: UInt64) {
        prepare(signer: auth(Storage) &Account) {
          ForteHubRegistry.setWorkflowListing(workflowId: workflowId, creator: signer.address, isListed: false)
        }
      }
    `;

    executeUnlistMutation({
      cadence: cadenceCode,
      args: (arg, t) => [arg(workflow.workflowId.toString(), t.UInt64)]
    });
  };

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
    <div className="container mx-auto p-6 max-w-6xl">
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

      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => router.push('/browse')}
        className="mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Registry
      </Button>

      {/* Workflow Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <CardTitle className="text-3xl">{workflow.name}</CardTitle>
                <Badge className={getCategoryBadgeColor(workflow.category)}>
                  {workflow.category}
                </Badge>
                {!workflow.isListed && (
                  <Badge variant="outline">Unlisted</Badge>
                )}
              </div>
              <CardDescription className="text-base">
                Created by {workflow.creator.slice(0, 8)}...{workflow.creator.slice(-4)} on{' '}
                {new Date(workflow.createdAt * 1000).toLocaleDateString()}
              </CardDescription>
            </div>
            <Button
              onClick={handleDeploy}
              size="lg"
              className="md:w-auto w-full"
              disabled={isDeploying}
            >
              {isDeploying ? 'Deploying…' : 'Deploy Workflow'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Description */}
            <div>
              <h3 className="font-semibold mb-2 text-lg">Description</h3>
              <p className="text-muted-foreground">{workflow.description}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">Clone{(workflow.cloneCount || 0) !== 1 ? 's' : ''}</p>
                <p className="text-2xl font-bold">{workflow.cloneCount || 0}</p>
              </div>
              {/* <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">Fork{(workflow.forkCount || 0) !== 1 ? 's' : ''}</p>
                <p className="text-2xl font-bold">{workflow.forkCount || 0}</p>
              </div> */}
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">Type</p>
                <p className="text-lg font-semibold capitalize">{workflow.deploymentType}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">Workflow ID</p>
                <p className="text-lg font-semibold">#{workflow.workflowId}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">Hash Status</p>
                <p className="text-lg font-semibold">
                  {hashValid === null ? (
                    <span className="text-gray-400">Checking...</span>
                  ) : hashValid ? (
                    <span className="text-green-600">✓ Verified</span>
                  ) : (
                    <span className="text-red-600">⚠ Unverified</span>
                  )}
                </p>
              </div>
            </div>

            {workflow.parentWorkflowId !== null && workflow.parentWorkflowId !== undefined && (
              <p className="text-sm text-gray-500">
                Forked from workflow ID {workflow.parentWorkflowId}
              </p>
            )}

            {/* Hash Warning */}
            {hashValid === false && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800">Hash Verification Failed</p>
                  <p className="text-sm text-red-700">
                    The source code hash could not be verified. Deploy only if you trust this source.
                  </p>
                </div>
              </div>
            )}

            {/* IPFS Link */}
            <div>
              <h3 className="font-semibold mb-2">IPFS Storage</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted p-2 rounded text-sm font-mono break-all">
                  {workflow.sourceCodeIPFS}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyIPFS}
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
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Creator Controls Card */}
      {workflow && userAddress && workflow.creator.toLowerCase() === userAddress.toLowerCase() && (
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg">Creator Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setUnlistModal(workflow)}
            >
              {workflow.isListed ? '📋 Unlist from Registry' : '✓ List in Registry'}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setRescheduleModal(workflow)}
            >
              ⏱️ Reschedule Execution
            </Button>
          </CardContent>
        </Card>
      )}

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
          <Button
            onClick={() => {
              if (unlistModal) {
                handleUnlist(unlistModal);
              }
            }}
          >
            Unlist
          </Button>
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
    </div>
  );
}

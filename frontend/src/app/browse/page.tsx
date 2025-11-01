'use client';

import { useState, useEffect } from 'react';
import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { fetchWorkflowFromIPFS } from '@/services/ipfs.service';
import { useRouter } from 'next/navigation';
import { useFlowCurrentUser, useFlowQuery, useFlowMutate } from '@onflow/react-sdk';
import { WorkflowInfo } from '@/types/interfaces';
import { useSelectedWorkflow } from '@/lib/WorkflowContext';
import {
  FORTEHUB_REGISTRY,
  fetchWorkflowInfo,
  fetchCloneCount,
  fetchForkCount,
  normalizeWorkflowInfo
} from '@/lib/flowScripts';

let sanitizeCounter = 0;

export default function BrowsePage() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{type: 'success' | 'error' | 'info'; text: string} | null>(null);
  const [forkModal, setForkModal] = useState<WorkflowInfo | null>(null);
  const [forkLoading, setForkLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const router = useRouter();
  const { setSelectedWorkflow } = useSelectedWorkflow();

  const { user } = useFlowCurrentUser();
  const userAddress = user?.addr || '';
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const sanitizeContractName = (name: string): string => {
    const cleaned = name.replace(/[^A-Za-z0-9_]/g, '');
    if (!cleaned) {
      sanitizeCounter += 1;
      return `Workflow${sanitizeCounter}`;
    }
    if (!/^[A-Za-z_]/.test(cleaned)) {
      return `A${cleaned}`;
    }
    return cleaned;
  };

  const ensureUniqueContractName = async (baseName: string): Promise<string> => {
    const sanitized = sanitizeContractName(baseName);
    // Append timestamp-based suffix to ensure uniqueness
    const timestamp = Date.now().toString().slice(-6);
    return `${sanitized}_${timestamp}`;
  };

  // Fetch public workflow IDs - simple query
  const { data: workflowIds = [], isLoading: isLoadingIds } = useFlowQuery({
    cadence: `
      import ForteHubRegistry from ${FORTEHUB_REGISTRY}

      access(all) fun main(): [UInt64] {
        return ForteHubRegistry.listPublicWorkflows()
      }
    `,
    query: {
      queryKey: ['public-workflow-ids'],
      staleTime: 5000
    }
  });

  // Load workflow details when IDs are available
  useEffect(() => {
    if (isLoadingIds || !Array.isArray(workflowIds) || workflowIds.length === 0) {
      if (!isLoadingIds && Array.isArray(workflowIds) && workflowIds.length === 0) {
        setWorkflows([]);
        setLoading(false);
      }
      return;
    }

    setLoading(true);

    // Load each workflow's details
    const loadWorkflows = async () => {
      try {
        const details = await Promise.all(
          (workflowIds as number[]).map(async (id: number) => {
            try {
              const rawInfo = await fetchWorkflowInfo(id);
              if (!rawInfo || typeof rawInfo !== 'object') {
                console.warn(`Workflow ${id} returned no data`, rawInfo);
                return null;
              }

              const [cloneCount, forkCount] = await Promise.all([
                fetchCloneCount(id),
                fetchForkCount(id)
              ]);

              return normalizeWorkflowInfo(rawInfo, {
                cloneCount,
                forkCount
              });
            } catch (error) {
              console.error(`Error loading workflow ${id}:`, error);
              return null;
            }
          })
        );

        const filtered = details.filter((w): w is WorkflowInfo => w !== null);
        setWorkflows(filtered);
      } catch (error) {
        console.error('Error loading workflows:', error);
        setWorkflows([]);
      } finally {
        setLoading(false);
      }
    };

    loadWorkflows();
  }, [isLoadingIds, workflowIds]);


  // Deploy mutation hook
  const { mutate: deployWorkflow, isPending: isDeploying } = useFlowMutate({
    mutation: {
      onSuccess: async (txId: string) => {
        try {
          setStatusMessage({
            type: 'success',
            text: 'Workflow deployed successfully.'
          });
        } catch (error) {
          console.error('Error waiting for seal:', error);
        }
      },
      onError: (error: Error) => {
        console.error('Deploy error:', error);
        setStatusMessage({
          type: 'error',
          text: `Failed to deploy workflow: ${error.message}`
        });
      }
    }
  });

  const handleDeploy = async (workflow: WorkflowInfo) => {
    if (!userAddress) {
      setStatusMessage({
        type: 'info',
        text: 'Please connect your wallet to deploy a workflow.'
      });
      return;
    }

    try {
      const hasCid = Boolean(workflow.sourceCodeIPFS && workflow.sourceCodeIPFS.trim().length > 0);
      if (!hasCid) {
        setStatusMessage({
          type: 'error',
          text: 'Cannot clone: workflow is missing an IPFS CID.'
        });
        return;
      }

      const sourceCode = await fetchWorkflowFromIPFS(workflow.sourceCodeIPFS);

      if (!sourceCode || sourceCode.trim().length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'Source code is empty. The IPFS upload may have failed.'
        });
        return;
      }

      const deployWithSource = async () => {
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
      };

      // TODO: Reinstate full hash verification once CID/hash mismatches are resolved.
      setConfirmModal({
        title: 'Clone workflow?',
        description: `Deploy "${workflow.name}" from IPFS (${workflow.sourceCodeIPFS.slice(0, 8)}...).`,
        onConfirm: async () => {
          await deployWithSource();
        }
      });
    } catch (error) {
      console.error('Deploy error:', error);
      setStatusMessage({
        type: 'error',
        text: `Failed to deploy workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  const handleViewSource = async (workflow: WorkflowInfo) => {
    try {
      console.log('Fetching from IPFS:', workflow.sourceCodeIPFS);
      const sourceCode = await fetchWorkflowFromIPFS(workflow.sourceCodeIPFS);
      console.log('Fetched source code length:', sourceCode.length);

      if (!sourceCode || sourceCode.trim().length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'Source code is empty. The IPFS upload may have failed.'
        });
        return;
      }

      // Open in a new window/modal to view
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`
          <html>
            <head>
              <title>${workflow.name} - Source Code</title>
              <style>
                body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
                pre { white-space: pre-wrap; word-wrap: break-word; }
                h1 { color: #4ec9b0; }
              </style>
            </head>
            <body>
              <h1>${workflow.name}</h1>
              <p>Creator: ${workflow.creator}</p>
              <p>IPFS CID: ${workflow.sourceCodeIPFS}</p>
              <p>Gateway: <a href="https://gateway.pinata.cloud/ipfs/${workflow.sourceCodeIPFS}" target="_blank">View on Pinata</a></p>
              <hr>
              <pre>${sourceCode}</pre>
            </body>
          </html>
        `);
        win.document.close();
      }
    } catch (error) {
      console.error('Failed to load source:', error);
      setStatusMessage({
        type: 'error',
        text: `Failed to load source code: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      });
    }
  };

  const executeFork = async (workflow: WorkflowInfo) => {
    try {
      setForkLoading(true);
      const sourceCode = await fetchWorkflowFromIPFS(workflow.sourceCodeIPFS);
      if (!sourceCode || sourceCode.trim().length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'Source code is empty. Unable to fork this workflow.'
        });
        setForkLoading(false);
        return;
      }

      localStorage.setItem('forkSource', sourceCode);
      localStorage.setItem('forkName', workflow.name);
      localStorage.setItem('forkDescription', workflow.description);
      localStorage.setItem('forkCategory', workflow.category);
      localStorage.setItem('forkFromWorkflowId', workflow.workflowId.toString());
      localStorage.setItem('forkParentName', workflow.name);
      if (workflow.metadataJSON) {
        localStorage.setItem('forkMetadataJSON', workflow.metadataJSON);
      } else {
        localStorage.removeItem('forkMetadataJSON');
      }

      setStatusMessage({
        type: 'info',
        text: 'Loaded fork template. Customize and deploy from the Create Workflow page.'
      });

      setForkModal(null);
      router.push('/create');
    } catch (error) {
      console.error('Fork error:', error);
      setStatusMessage({
        type: 'error',
        text: `Failed to prepare fork: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setForkLoading(false);
    }
  };

  const filteredWorkflows = filter === 'all'
    ? workflows
    : workflows.filter(w => w.category === filter);

  const getCategoryBadgeColor = (category: string | undefined) => {
    if (!category || typeof category !== 'string') {
      return 'bg-gray-100 text-gray-800';
    }
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
    return colors[category.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  // Get unique categories from loaded workflows
  const uniqueCategories = React.useMemo(() => {
    const categories = Array.from(
      new Set(workflows.map(w => w.category).filter((cat): cat is string => Boolean(cat)))
    );
    return ['all', ...categories] as const;
  }, [workflows]);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Workflow Registry</h1>
        <p className="text-gray-600">Browse and deploy workflows created by the community</p>
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

      <div className="mb-6 flex gap-2 flex-wrap">
        {uniqueCategories.map((cat) => (
          <Button
            key={cat}
            variant={filter === cat ? 'default' : 'outline'}
            onClick={() => setFilter(cat)}
          >
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading workflows...</p>
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No workflows found. Be the first to create one!</p>
          <Button className="mt-4" onClick={() => router.push('/create')}>
            Create Workflow
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWorkflows.map((workflow) => (
            <Card key={workflow.workflowId} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{workflow.name}</CardTitle>
                  <Badge className={getCategoryBadgeColor(workflow.category)}>
                    {workflow.category}
                  </Badge>
                </div>
                <CardDescription>
                  by {workflow.creator ? `${workflow.creator.slice(0, 8)}...${workflow.creator.slice(-4)}` : 'Unknown'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-4 line-clamp-3">{workflow.description}</p>

                <div className="flex justify-between items-center text-sm text-gray-600 mb-2 flex-wrap gap-2">
                  <span>
                    Cloned {workflow.cloneCount || 0} time{(workflow.cloneCount || 0) !== 1 ? 's' : ''}
                  </span>
                  {/* <span>
                    Forked {workflow.forkCount || 0} time{(workflow.forkCount || 0) !== 1 ? 's' : ''}
                  </span> */}
                  <span className="text-xs text-gray-400 ml-auto">
                    {new Date(workflow.createdAt * 1000).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() => {
                      setSelectedWorkflow(workflow);
                      router.push(`/browse/${workflow.workflowId}`);
                    }}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    More Info
                  </Button>
                  <Button
                    onClick={() => handleDeploy(workflow)}
                    size="sm"
                    className="flex-1"
                  >
                    Clone
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
              setConfirmModal(null);
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

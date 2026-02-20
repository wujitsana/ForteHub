'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFlowCurrentUser, useFlowQuery } from '@onflow/react-sdk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowCard } from '@/components/marketplace/WorkflowCard';
import { WorkflowInfo } from '@/types/interfaces';
import { normalizeWorkflowInfo } from '@/lib/flowScripts';
import { useSelectedWorkflow } from '@/lib/WorkflowContext';
import { prepareCloneTransaction } from '@/lib/cloneUtils';
import { ConfigurableVariablesModal, type ConfigurableVariable } from '@/components/workflow/ConfigurableVariablesModal';
import { TransactionDialog } from '@onflow/react-sdk';
import { Copy, ExternalLink } from 'lucide-react';
import type { ComponentProps } from 'react';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const profileAddress = (params.address as string)?.toLowerCase();

  const { user } = useFlowCurrentUser();
  const userAddress = user?.addr?.toLowerCase() || '';
  const isOwnProfile = userAddress === profileAddress;

  const { setSelectedWorkflow } = useSelectedWorkflow();

  // State management
  const [createdWorkflows, setCreatedWorkflows] = useState<WorkflowInfo[]>([]);
  const [clonedWorkflows, setClonedWorkflows] = useState<WorkflowInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [stats, setStats] = useState({
    created: 0,
    cloned: 0,
    totalClones: 0,
    avgClonePrice: 0
  });

  // Transaction state
  const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [configurableVariables, setConfigurableVariables] = useState<Record<string, ConfigurableVariable>>({});
  const [variablesModalOpen, setVariablesModalOpen] = useState(false);
  const [pendingTransactionBuilder, setPendingTransactionBuilder] = useState<((overrides: Record<string, ConfigurableVariable>) => ComponentProps<any>['transaction']) | null>(null);
  const [deploymentSummary, setDeploymentSummary] = useState<{ contractName: string; description?: string } | null>(null);
  const [pendingWorkflowName, setPendingWorkflowName] = useState<string | null>(null);

  // Auto-dismiss status message
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Query workflows created by this address
  const { data: rawCreatedWorkflows = [], isLoading: loadingCreated } = useFlowQuery({
    cadence: `
      import ForteHubRegistry from ${FORTEHUB_REGISTRY}

      access(all) fun main(creatorAddress: Address): [ForteHubRegistry.WorkflowInfo] {
        let ids = ForteHubRegistry.listPublicWorkflows()
        let results: [ForteHubRegistry.WorkflowInfo] = []
        for id in ids {
          if let info = ForteHubRegistry.getWorkflowInfo(workflowId: id) {
            if info.creator == creatorAddress {
              results.append(info)
            }
          }
        }
        return results
      }
    `,
    args: (arg: any, t: any) => [arg(profileAddress, t.Address)],
    query: {
      enabled: !!profileAddress,
      staleTime: 30000
    }
  });

  // Normalize created workflows
  useEffect(() => {
    if (loadingCreated) {
      setLoading(true);
      return;
    }

    if (Array.isArray(rawCreatedWorkflows) && rawCreatedWorkflows.length > 0) {
      const normalized = rawCreatedWorkflows
        .map((raw: any) => {
          try {
            return normalizeWorkflowInfo(raw);
          } catch (error) {
            console.error('Error normalizing workflow:', error);
            return null;
          }
        })
        .filter((w): w is WorkflowInfo => w !== null);

      setCreatedWorkflows(normalized);

      // Calculate stats
      const totalClones = normalized.reduce((sum, w) => sum + (w.cloneCount || 0), 0);
      const avgPrice = normalized.length > 0
        ? normalized.reduce((sum, w) => sum + (w.price || 0), 0) / normalized.length
        : 0;

      setStats(prev => ({
        ...prev,
        created: normalized.length,
        totalClones,
        avgClonePrice: avgPrice
      }));
    } else {
      setCreatedWorkflows([]);
    }

    setLoading(false);
  }, [loadingCreated, rawCreatedWorkflows]);

  // Handle clone action
  const handleClone = async (workflow: WorkflowInfo) => {
    if (!userAddress) {
      setStatusMessage({
        type: 'info',
        text: 'Please connect your wallet to clone a workflow.'
      });
      return;
    }

    if (workflow.isListed === false) {
      setStatusMessage({
        type: 'error',
        text: 'This workflow has been unlisted by its creator.'
      });
      return;
    }

    try {
      const clonePrep = await prepareCloneTransaction(workflow);
      setConfigurableVariables(clonePrep.configVariables);
      setPendingTransactionBuilder(() => clonePrep.transactionBuilder);
      setPendingWorkflowName(workflow.name);

      const priceText = workflow.price === null || workflow.price === undefined || workflow.price === 0
        ? 'FREE clone'
        : `${workflow.price} FLOW clone fee`;

      setDeploymentSummary({
        contractName: workflow.contractName,
        description: `Clone "${workflow.name}" to your account. ${priceText}.`
      });
      setVariablesModalOpen(true);
    } catch (error) {
      console.error('Clone error:', error);
      setStatusMessage({
        type: 'error',
        text: `Failed to clone workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  // Copy address to clipboard
  const copyAddressToClipboard = () => {
    if (profileAddress) {
      navigator.clipboard.writeText(profileAddress).then(() => {
        setStatusMessage({
          type: 'success',
          text: 'Address copied to clipboard!'
        });
      });
    }
  };

  // Format address for display
  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!profileAddress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">Invalid profile address</p>
          <Button onClick={() => router.push('/discover')}>Back to Discover</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b bg-white sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {isOwnProfile ? 'My Portfolio' : 'Creator Profile'}
              </h1>
              <p className="text-slate-600 text-sm mt-1">
                {isOwnProfile ? 'Manage your created and cloned workflows' : `View ${formatAddress(profileAddress)}'s workflows`}
              </p>
            </div>
            <div className="flex gap-2">
              {!isOwnProfile && (
                <Button
                  variant="outline"
                  onClick={() => router.push('/discover')}
                >
                  Back to Discover
                </Button>
              )}
              {isOwnProfile && (
                <Button
                  onClick={() => router.push('/create')}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                >
                  Create Workflow
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
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

        {/* Profile Info Card */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
              {/* Avatar Section */}
              <div className="flex-shrink-0">
                <ProfileAvatar address={profileAddress} size="md" />
              </div>

              {/* Profile Details */}
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  {isOwnProfile ? 'Your Portfolio' : 'Creator Profile'}
                </h2>
                <p className="text-slate-600 mb-6">
                  {isOwnProfile
                    ? 'Your unique profile generated from your wallet address'
                    : `Creator profile for ${formatAddress(profileAddress)}`}
                </p>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Created</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.created}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Cloned</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.cloned}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Total Clones</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.totalClones}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Avg Price</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.avgClonePrice.toFixed(2)} FLOW</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  {!isOwnProfile && (
                    <a
                      href={`https://testnet.flowscan.org/account/${profileAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View on Flowscan
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Workflows Tabs */}
        <Tabs defaultValue="created" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="created">
              Created Workflows ({stats.created})
            </TabsTrigger>
            {isOwnProfile && (
              <TabsTrigger value="cloned">
                My Clones (Coming Soon)
              </TabsTrigger>
            )}
          </TabsList>

          {/* Created Workflows Tab */}
          <TabsContent value="created">
            {loading ? (
              <div className="text-center py-12">
                <p className="text-slate-600">Loading workflows...</p>
              </div>
            ) : createdWorkflows.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-600 mb-4">
                  {isOwnProfile
                    ? 'You haven\'t created any workflows yet.'
                    : 'This creator hasn\'t published any workflows yet.'}
                </p>
                {isOwnProfile && (
                  <Button onClick={() => router.push('/create')}>
                    Create Your First Workflow
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {createdWorkflows.map((workflow) => (
                  <div key={workflow.workflowId} className="h-full">
                    <WorkflowCard
                      workflow={workflow}
                      isCreator={isOwnProfile}
                      onClone={() => handleClone(workflow)}
                      onBuy={() => {
                        // Marketplace coming soon
                      }}
                      onInfo={() => {
                        setSelectedWorkflow(workflow);
                        router.push(`/discover/${workflow.workflowId}`);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Cloned Workflows Tab (Phase 2) */}
          {isOwnProfile && (
            <TabsContent value="cloned">
              <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-600 mb-4">Your cloned workflows coming soon!</p>
                <p className="text-sm text-slate-500">Phase 2: Track all workflows you've cloned from other creators</p>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Modals */}
      <TransactionDialog
        open={isTransactionDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsTransactionDialogOpen(open);
          if (!open) {
            setTransactionDialogTxId(null);
            setStatusMessage({
              type: 'success',
              text: 'Workflow cloned successfully!'
            });
          }
        }}
        txId={transactionDialogTxId || undefined}
        pendingTitle="Cloning workflow..."
        pendingDescription="Waiting for Flow to seal the transaction."
        successTitle="Clone complete!"
        successDescription="Your workflow has been successfully cloned to your account."
        closeOnSuccess
      />

      <ConfigurableVariablesModal
        open={variablesModalOpen}
        onClose={() => {
          setVariablesModalOpen(false);
          setPendingTransactionBuilder(null);
          setDeploymentSummary(null);
          setPendingWorkflowName(null);
          setConfigurableVariables({});
        }}
        variables={configurableVariables}
        workflowName={pendingWorkflowName || undefined}
        deploymentSummary={deploymentSummary || undefined}
        transactionBuilder={pendingTransactionBuilder ?? undefined}
        onDeploySuccess={(txId: string) => {
          setTransactionDialogTxId(txId);
          setIsTransactionDialogOpen(true);
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

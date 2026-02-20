'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ComponentProps } from 'react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFlowCurrentUser, useFlowQuery, TransactionButton, TransactionDialog } from '@onflow/react-sdk';
import { WorkflowInfo, MarketplaceListing } from '@/types/interfaces';
import { useSelectedWorkflow } from '@/lib/WorkflowContext';
import { prepareCloneTransaction } from '@/lib/cloneUtils';
import { normalizeWorkflowInfo } from '@/lib/flowScripts';
import { ConfigurableVariablesModal, type ConfigurableVariable } from '@/components/workflow/ConfigurableVariablesModal';
import { User, ShoppingCart } from 'lucide-react';
import { WorkflowCard } from '@/components/marketplace/WorkflowCard';
import { MarketplaceListingCard } from '@/components/marketplace/MarketplaceListingCard';
import { PurchaseModal } from '@/components/marketplace/PurchaseModal';
import { UnlistModal } from '@/components/marketplace/UnlistModal';

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');
const FORTEHUB_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_FORTEHUB_MARKET_ADDRESS || '0xbd4c3996265ed830').replace('0X', '0x');

import { useMarketplaceEvents } from '@/hooks/useMarketplaceEvents';

export default function DiscoverPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filter, setFilter] = useState<string>('all');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const router = useRouter();
  const { setSelectedWorkflow } = useSelectedWorkflow();

  const { user } = useFlowCurrentUser();
  const userAddress = user?.addr || '';

  type TransactionConfig = ComponentProps<typeof TransactionButton>['transaction'];

  const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [transactionSuccessMeta, setTransactionSuccessMeta] = useState<{
    type: 'purchase' | 'unlist' | 'config';
    workflowId?: number;
    workflowName?: string;
  } | null>(null);
  const [configurableVariables, setConfigurableVariables] = useState<Record<string, ConfigurableVariable>>({});
  const [variablesModalOpen, setVariablesModalOpen] = useState(false);
  const [pendingTransactionBuilder, setPendingTransactionBuilder] = useState<((overrides: Record<string, ConfigurableVariable>) => TransactionConfig) | null>(null);
  const [deploymentSummary, setDeploymentSummary] = useState<{ contractName: string; description?: string } | null>(null);
  const [pendingWorkflowName, setPendingWorkflowName] = useState<string | null>(null);

  // Marketplace State
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);
  const [selectedWorkflowForBuy, setSelectedWorkflowForBuy] = useState<WorkflowInfo | null>(null);
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [unlistModalOpen, setUnlistModalOpen] = useState(false);
  const [selectedListingForUnlist, setSelectedListingForUnlist] = useState<MarketplaceListing | null>(null);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Fetch all public workflows AND marketplace listings in one query
  const { data: queryData, isLoading } = useFlowQuery({
    cadence: `
      import ForteHub from ${FORTEHUB_REGISTRY}
      import ForteHubMarket from ${FORTEHUB_MARKET_ADDRESS}

      access(all) fun main(): {String: AnyStruct} {
        // 1. Get all public workflows
        let publicWorkflowIds = ForteHub.listPublicWorkflows()
        let workflowsDict: {UInt64: ForteHub.WorkflowInfo} = {}
        
        for id in publicWorkflowIds {
          if let info = ForteHub.getWorkflowInfo(workflowId: id) {
            workflowsDict[id] = info
          }
        }

        // 2. Get all marketplace listings
        let listingIds = ForteHubMarket.getListingIDs()
        let listings: [ForteHubMarket.ListingDetails] = []
        
        for id in listingIds {
          if let listing = ForteHubMarket.getListing(listingID: id) {
            listings.append(listing)
            
            // Ensure we have workflow info for this listing
            if workflowsDict[listing.workflowId] == nil {
                if let info = ForteHub.getWorkflowInfo(workflowId: listing.workflowId) {
                    workflowsDict[listing.workflowId] = info
                }
            }
          }
        }

        return {
          "workflows": workflowsDict.values,
          "listings": listings
        }
      }
    `,
    args: () => [],
    query: {
      staleTime: 30000
    }
  });

  // Fetch user's owned workflows to check ownership
  const { data: myWorkflowsRaw } = useFlowQuery({
    cadence: `
      import ForteHub from ${FORTEHUB_REGISTRY}

      access(all) fun main(address: Address): [ForteHub.WorkflowInfo?]? {
        let account = getAccount(address)
        let cap = account.capabilities.get<&ForteHub.Manager>(ForteHub.FORTEHUB_MANAGER_PUBLIC)
        if !cap.check() { return nil }
        
        let managerRef = cap.borrow()!
        let ids = managerRef.listWorkflowIds()
        let results: [ForteHub.WorkflowInfo?] = []
        
        for id in ids {
          results.append(ForteHub.getWorkflowInfo(workflowId: id))
        }
        return results
      }
    `,
    args: (arg, t) => [arg(userAddress, t.Address)],
    query: {
      enabled: !!userAddress,
      staleTime: 10000
    }
  });

  const myWorkflows = useMemo(() => {
    if (!Array.isArray(myWorkflowsRaw)) return [];
    return myWorkflowsRaw
      .filter((w: any) => w != null)
      .map((w: any) => normalizeWorkflowInfo(w));
  }, [myWorkflowsRaw]);

  // Listen for real-time marketplace events and refetch data
  useMarketplaceEvents(() => {
    console.log('Marketplace event detected - refreshing Discover page data');
    // Note: useFlowQuery doesn't expose refetch directly, but polling will pick up changes
  });

  // Normalize workflows
  const workflows = useMemo(() => {
    const rawWorkflows = (queryData as any)?.workflows || [];
    if (!rawWorkflows || !Array.isArray(rawWorkflows) || rawWorkflows.length === 0) {
      return [];
    }

    return rawWorkflows
      .map((raw: any) => {
        try {
          return normalizeWorkflowInfo(raw);
        } catch (error) {
          console.error('Error normalizing workflow:', error);
          return null;
        }
      })
      .filter((w): w is WorkflowInfo => w !== null);
  }, [queryData]);

  // Normalize listings
  useEffect(() => {
    const rawListings = (queryData as any)?.listings || [];
    if (!rawListings || !Array.isArray(rawListings) || rawListings.length === 0) {
      setMarketplaceListings([]);
      return;
    }

    const normalizedListings: MarketplaceListing[] = rawListings.map((listing: any) => ({
      listingId: listing.listingId,
      workflowId: listing.workflowId,
      seller: listing.seller, // listing.seller is already the address string
      price: parseFloat(listing.price),
      active: true,
      workflowInfo: null
    }));

    const listingsWithWorkflowInfo = normalizedListings.map(listing => {
      const workflow = workflows.find(w => w.workflowId.toString() === listing.workflowId.toString());
      return {
        ...listing,
        workflowInfo: workflow || null
      };
    }).filter(listing => listing.workflowInfo !== null) as MarketplaceListing[];

    setMarketplaceListings(listingsWithWorkflowInfo);
  }, [queryData, workflows]);

  const handleDeploy = async (workflow: WorkflowInfo) => {
    console.log('handleDeploy called with workflow:', workflow);
    if (!userAddress) {
      setStatusMessage({
        type: 'info',
        text: 'Please connect your wallet to clone a workflow.'
      });
      return;
    }

    if (workflow.clonesLocked) {
      setStatusMessage({
        type: 'error',
        text: 'Cloning has been locked by the creator.'
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
      console.log('Calling prepareCloneTransaction...');
      const clonePrep = await prepareCloneTransaction(workflow);
      console.log('Clone prep result:', clonePrep);

      setConfigurableVariables(clonePrep.configVariables);
      setPendingTransactionBuilder(() => clonePrep.transactionBuilder);
      setPendingWorkflowName(workflow.name);
      const priceText = workflow.price === null || workflow.price === undefined || parseFloat(workflow.price) === 0
        ? 'FREE clone'
        : `${workflow.price} FLOW clone fee`;
      setDeploymentSummary({
        contractName: workflow.contractName,
        description: `Clone "${workflow.name}" to your account. ${priceText}.`
      });
      setVariablesModalOpen(true);
    } catch (error) {
      console.error('Deploy error:', error);
      setStatusMessage({
        type: 'error',
        text: `Failed to clone workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  const filteredWorkflows = (filter === 'all'
    ? workflows
    : workflows.filter(w => w.category === filter)
  ).filter(w => w.isListed !== false || w.creator?.toLowerCase() === userAddress?.toLowerCase());

  const filteredListings = (filter === 'all'
    ? marketplaceListings
    : marketplaceListings.filter(l => l.workflowInfo?.category === filter)
  );

  const uniqueCategories = useMemo(() => {
    const categories = Array.from(
      new Set(workflows.map(w => w.category).filter((cat): cat is string => Boolean(cat)))
    );
    return ['all', ...categories] as const;
  }, [workflows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b bg-white sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Discover Workflows</h1>
              <p className="text-slate-600 text-sm">Find and clone DeFi automation templates</p>
            </div>
            <div className="flex gap-2">
              {userAddress && (
                <Link href={`/profile/${userAddress}`}>
                  <Button variant="outline" className="gap-2">
                    <User className="w-4 h-4" />
                    My Portfolio
                  </Button>
                </Link>
              )}
              <Button
                onClick={() => router.push('/create')}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                Create Workflow
              </Button>
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

        {/* Category Filter */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            {uniqueCategories.map((cat) => (
              <Button
                key={cat}
                variant={filter === cat ? 'default' : 'outline'}
                onClick={() => setFilter(cat)}
                className="rounded-full"
              >
                {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* SECTION 1: Templates to Clone */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Templates to Clone</h2>
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-slate-600">Loading templates...</p>
            </div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg">
              <p className="text-slate-600 mb-4">No templates found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4 min-w-min">
                {filteredWorkflows.map((workflow) => (
                  <div key={workflow.workflowId} className="flex-shrink-0 w-80">
                    <WorkflowCard
                      workflow={workflow}
                      isCreator={workflow.creator?.toLowerCase() === userAddress?.toLowerCase()}
                      onClone={() => handleDeploy(workflow)}
                      onBuy={() => handleDeploy(workflow)}
                      onInfo={() => {
                        setSelectedWorkflow(workflow);
                        router.push(`/discover/${workflow.workflowId}`);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: Marketplace Listings */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Marketplace Listings</h2>
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-slate-600">Loading listings...</p>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg">
              <p className="text-slate-600 mb-4">No active listings found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredListings.map((listing) => (
                <div key={listing.listingId} className="w-full">
                  <MarketplaceListingCard
                    listing={listing}
                    isOwner={user?.addr === listing.seller}
                    isOwned={myWorkflows.some((w: any) => w.workflowId === listing.workflowId)}
                    onBuy={() => {
                      setSelectedListing(listing);
                      setSelectedWorkflowForBuy(listing.workflowInfo);
                      setBuyModalOpen(true);
                    }}
                    onUnlist={() => {
                      setSelectedListingForUnlist(listing);
                      setUnlistModalOpen(true);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <TransactionDialog
        open={isTransactionDialogOpen}
        onOpenChange={useCallback((open: boolean) => {
          setIsTransactionDialogOpen(open);
          if (!open) {
            setTransactionDialogTxId(null);
          }
        }, [])}
        txId={transactionDialogTxId || undefined}
        pendingTitle="Processing Transaction..."
        pendingDescription="Waiting for Flow to seal the transaction."
        successTitle="Transaction Successful!"
        successDescription="Your transaction has been sealed on the blockchain."
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

      <PurchaseModal
        open={buyModalOpen}
        onClose={() => {
          setBuyModalOpen(false);
          setSelectedWorkflowForBuy(null);
          setSelectedListing(null);
        }}
        workflow={selectedWorkflowForBuy}
        listingId={selectedListing?.listingId}
        price={selectedListing?.price?.toString()}
        sellerAddress={selectedListing?.seller}
        onPurchaseSuccess={(txId) => {
          setTransactionDialogTxId(txId);
          setIsTransactionDialogOpen(true);
          setBuyModalOpen(false);
        }}
      />

      <UnlistModal
        open={unlistModalOpen}
        onClose={() => {
          setUnlistModalOpen(false);
          setSelectedListingForUnlist(null);
        }}
        listing={selectedListingForUnlist}
        onUnlistSuccess={(txId) => {
          setTransactionDialogTxId(txId);
          setIsTransactionDialogOpen(true);
          setUnlistModalOpen(false);
          setSelectedListingForUnlist(null);
        }}
      />
    </div>
  );
}

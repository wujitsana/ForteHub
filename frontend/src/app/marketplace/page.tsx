'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ComponentProps } from 'react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFlowCurrentUser, useFlowQuery, TransactionDialog, useFlowTransaction } from '@onflow/react-sdk';
import { WorkflowInfo, MarketplaceListing } from '@/types/interfaces';
import { useSelectedWorkflow } from '@/lib/WorkflowContext';
import { normalizeWorkflowInfo } from '@/lib/flowScripts';
import { ShoppingCart, User } from 'lucide-react';
import { PurchaseModal } from '@/components/marketplace/PurchaseModal';
import { MarketplaceListingCard } from '@/components/marketplace/MarketplaceListingCard';
import { purchaseListingTransaction, createListingTransaction } from '@/lib/marketplaceTransactions';
import { WorkflowSelectionModal } from '@/components/marketplace/WorkflowSelectionModal';
import { UnlistModal } from '@/components/marketplace/UnlistModal';
import { ListingModal } from '@/components/marketplace/ListingModal'; // Assuming ListingModal is also needed

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');
const FORTEHUB_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_FORTEHUB_MARKET_ADDRESS || '0xbd4c3996265ed830').replace('0X', '0x');

import { useMarketplaceEvents } from '@/hooks/useMarketplaceEvents';

export default function MarketplacePage() {
    const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);
    const [filter, setFilter] = useState<string>('all');
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const router = useRouter();
    const { setSelectedWorkflow } = useSelectedWorkflow();

    const { user } = useFlowCurrentUser();
    const userAddress = user?.addr || '';

    const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
    const [selectedWorkflowForBuy, setSelectedWorkflowForBuy] = useState<WorkflowInfo | null>(null);
    const [buyModalOpen, setBuyModalOpen] = useState(false);
    const [purchaseLoading, setPurchaseLoading] = useState(false);
    const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);

    // Listing Flow State
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
    const [selectedWorkflowForListing, setSelectedWorkflowForListing] = useState<WorkflowInfo | null>(null);
    const [myWorkflows, setMyWorkflows] = useState<WorkflowInfo[]>([]);

    // Unlist Flow State
    const [unlistModalOpen, setUnlistModalOpen] = useState(false);
    const [selectedListingForUnlist, setSelectedListingForUnlist] = useState<MarketplaceListing | null>(null);

    // Fetch user's workflows for listing
    const { data: userWorkflowsData } = useFlowQuery({
        cadence: `
            import ForteHub from ${FORTEHUB_REGISTRY}
            
            access(all) fun main(address: Address): [ForteHub.WorkflowInfo?]? {
                let account = getAccount(address)
                
                // Check for public capability
                let cap = account.capabilities.get<&ForteHub.Manager>(ForteHub.FORTEHUB_MANAGER_PUBLIC)
                if !cap.check() {
                    return nil
                }

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

    useEffect(() => {
        if (userWorkflowsData === null) {
            setMyWorkflows([]);
            return;
        }

        if (userWorkflowsData && Array.isArray(userWorkflowsData)) {
            const normalized = userWorkflowsData
                .map((raw: any) => {
                    try {
                        return normalizeWorkflowInfo(raw);
                    } catch (e) {
                        return null;
                    }
                })
                .filter((w): w is WorkflowInfo => w !== null);
            setMyWorkflows(normalized);
        }
    }, [userWorkflowsData]);

    // Transaction state managed by TransactionButton components
    // const [listTxId, listTxStatus, executeListing] = useFlowTransaction(createListingTransaction);

    // const handleListWorkflow = async () => { ... } - Replaced by TransactionButton

    useEffect(() => {
        if (!statusMessage) return;
        const timer = setTimeout(() => setStatusMessage(null), 4000);
        return () => clearTimeout(timer);
    }, [statusMessage]);

    // Fetch all public workflows and marketplace listings in one query
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

    // Normalize workflows when loaded
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

    // Listen for real-time marketplace events
    useMarketplaceEvents(() => {
        console.log('Marketplace event detected - refreshing Marketplace page data');
        // Note: useFlowQuery doesn't expose refetch directly, but polling will pick up changes
    });

    // Normalize marketplace listings when loaded
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
            active: true, // Listings returned by the script are always active
            workflowInfo: null // Will be populated below
        }));

        // Match listings with their workflow info
        const listingsWithWorkflowInfo = normalizedListings.map(listing => {
            const workflow = workflows.find(w => w.workflowId.toString() === listing.workflowId.toString());
            return {
                ...listing,
                workflowInfo: workflow || null
            };
        }).filter(listing => listing.workflowInfo !== null) as MarketplaceListing[];

        setMarketplaceListings(listingsWithWorkflowInfo);
    }, [queryData, workflows]);

    // Purchase transaction is now handled within PurchaseModal using TransactionButton

    const filteredMarketplaceListings = useMemo(() => {
        let listings = marketplaceListings.filter(listing => listing.active);

        if (filter !== 'all') {
            listings = listings.filter(listing => listing.workflowInfo?.category === filter);
        }

        return listings;
    }, [marketplaceListings, filter]);

    const uniqueCategories = useMemo(() => {
        const categories = Array.from(
            new Set(marketplaceListings.map(l => l.workflowInfo?.category).filter((cat): cat is string => Boolean(cat)))
        );
        return ['all', ...categories] as const;
    }, [marketplaceListings]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <div className="border-b bg-white sticky top-0 z-50">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Marketplace</h1>
                            <p className="text-slate-600 text-sm">Buy active workflows directly from other users</p>
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

                {/* Marketplace Listings */}
                <div className="mb-12">
                    {isLoading ? (
                        <div className="text-center py-12">
                            <p className="text-slate-600">Loading listings...</p>
                        </div>
                    ) : filteredMarketplaceListings.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-lg">
                            <p className="text-slate-600 mb-4">No active listings found.</p>
                            <Button onClick={() => setIsSelectionModalOpen(true)}>
                                List Your Workflow
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredMarketplaceListings.map((listing) => (
                                <div key={listing.listingId} className="w-full">
                                    <MarketplaceListingCard
                                        listing={listing}
                                        isOwner={user?.addr === listing.seller}
                                        isOwned={myWorkflows?.some(w => w.workflowId === listing.workflowId)}
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

            <WorkflowSelectionModal
                open={isSelectionModalOpen}
                onClose={() => setIsSelectionModalOpen(false)}
                workflows={myWorkflows}
                onSelect={(workflow) => {
                    setSelectedWorkflowForListing(workflow);
                    setIsSelectionModalOpen(false);
                    setIsPriceModalOpen(true);
                }}
            />

            <ListingModal
                open={isPriceModalOpen}
                onClose={() => {
                    setIsPriceModalOpen(false);
                    setSelectedWorkflowForListing(null);
                }}
                workflow={selectedWorkflowForListing}
                onListingSuccess={(txId) => {
                    setTransactionDialogTxId(txId);
                    setIsTransactionDialogOpen(true);
                    setIsPriceModalOpen(false);
                    setSelectedWorkflowForListing(null);
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

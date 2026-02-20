'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPrice, formatAddress } from '@/lib/marketplaceEvents';
import { ShoppingCart, DollarSign, Trash2, Edit2 } from 'lucide-react';
import { WorkflowInfo, MarketplaceListingDetails } from '@/types/interfaces';

interface SellerListingsPanelProps {
  userWorkflows: WorkflowInfo[];
  userAddress: string;
  onListWorkflow: (workflow: WorkflowInfo, price: string) => void;
  onUnlistWorkflow: (listing: MarketplaceListingDetails) => void;
  onUpdatePrice: (listing: MarketplaceListingDetails, newPrice: string) => void;
  isLoading?: boolean;
}

export function SellerListingsPanel({
  userWorkflows,
  userAddress,
  onListWorkflow,
  onUnlistWorkflow,
  onUpdatePrice,
  isLoading = false
}: SellerListingsPanelProps) {
  const [listModal, setListModal] = useState<WorkflowInfo | null>(null);
  const [listPrice, setListPrice] = useState('0.1');
  const [editModal, setEditModal] = useState<MarketplaceListingDetails | null>(null);
  const [editPrice, setEditPrice] = useState('0.1');
  const [userListings, setUserListings] = useState<Map<number, MarketplaceListingDetails>>(new Map());

  // TODO: Fetch user's active listings from marketplace
  useEffect(() => {
    // Query ForteHubMarket for user's listings
    // setUserListings(...)
  }, [userAddress]);

  const listedWorkflowIds = new Set(
    Array.from(userListings.values()).map(l => l.workflowId)
  );

  const unlistedWorkflows = userWorkflows.filter(
    w => !listedWorkflowIds.has(w.workflowId)
  );

  const handleList = (workflow: WorkflowInfo) => {
    setListModal(workflow);
    setListPrice('0.1');
  };

  const confirmList = () => {
    if (listModal && listPrice) {
      onListWorkflow(listModal, listPrice);
      setListModal(null);
    }
  };

  const handleUnlist = (listing: MarketplaceListingDetails) => {
    if (window.confirm(`Unlist workflow for sale? You'll get it back in your manager.`)) {
      onUnlistWorkflow(listing);
    }
  };

  const handleEditPrice = (listing: MarketplaceListingDetails) => {
    setEditModal(listing);
    setEditPrice(listing.price);
  };

  const confirmEditPrice = () => {
    if (editModal && editPrice) {
      onUpdatePrice(editModal, editPrice);
      setEditModal(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Listings */}
      {userListings.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Active Marketplace Listings
            </CardTitle>
            <CardDescription>
              {userListings.size} workflow{userListings.size !== 1 ? 's' : ''} for sale
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from(userListings.values()).map((listing) => (
                <div
                  key={listing.listingId}
                  className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      Workflow #{listing.workflowId}
                    </p>
                    <p className="text-sm text-slate-600">
                      Listing #{listing.listingId} • {formatPrice(listing.price)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditPrice(listing)}
                      disabled={isLoading}
                      className="gap-1"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleUnlist(listing)}
                      disabled={isLoading}
                      className="gap-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      Unlist
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available to List */}
      {unlistedWorkflows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Available to List
            </CardTitle>
            <CardDescription>
              {unlistedWorkflows.length} workflow{unlistedWorkflows.length !== 1 ? 's' : ''} not currently for sale
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unlistedWorkflows.map((workflow) => (
                <div
                  key={workflow.workflowId}
                  className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {workflow.name}
                    </p>
                    <p className="text-sm text-slate-600 line-clamp-1">
                      {workflow.description}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleList(workflow)}
                    disabled={isLoading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    List for Sale
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {userListings.size === 0 && unlistedWorkflows.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center">
            <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-4">No workflows to list yet</p>
            <p className="text-sm text-slate-500">
              Create or clone workflows to start selling on the marketplace
            </p>
          </CardContent>
        </Card>
      )}

      {/* List Modal */}
      <Modal open={Boolean(listModal)} onOpenChange={() => setListModal(null)}>
        <ModalHeader>
          <h2 className="text-xl font-bold">List Workflow for Sale</h2>
          <p className="text-sm text-slate-600 mt-1">
            {listModal?.name}
          </p>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-700 mb-4">
                Set the price for this workflow. Other users will be able to purchase it directly from the marketplace.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-900 mb-2">Platform Fee</p>
              <p className="text-sm text-blue-800">
                The platform takes 2% of the sale price. You'll receive the remaining 98%.
              </p>
            </div>

            <div>
              <Label htmlFor="list-price">Price (FLOW)</Label>
              <Input
                id="list-price"
                type="number"
                step="0.001"
                min="0.001"
                max="9999"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                placeholder="0.1"
                disabled={isLoading}
              />
              <p className="text-xs text-slate-600 mt-2">
                You will receive approximately {(parseFloat(listPrice) * 0.98).toFixed(3)} FLOW after fees
              </p>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setListModal(null)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmList}
            disabled={isLoading || !listPrice || parseFloat(listPrice) <= 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? 'Listing...' : 'Confirm Listing'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Price Modal */}
      <Modal open={Boolean(editModal)} onOpenChange={() => setEditModal(null)}>
        <ModalHeader>
          <h2 className="text-xl font-bold">Update Listing Price</h2>
          <p className="text-sm text-slate-600 mt-1">
            Listing #{editModal?.listingId}
          </p>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-price">New Price (FLOW)</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.001"
                min="0.001"
                max="9999"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setEditModal(null)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmEditPrice}
            disabled={isLoading || !editPrice || parseFloat(editPrice) <= 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? 'Updating...' : 'Update Price'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

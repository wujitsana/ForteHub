'use client';

import { useState } from 'react';
import { WorkflowInfo } from '@/types/interfaces';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, DollarSign, Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SellerToolsPanelProps {
  workflows: WorkflowInfo[];
  onListWorkflow: (workflow: WorkflowInfo) => void;
  onManageListings: () => void;
}

export function SellerToolsPanel({
  workflows,
  onListWorkflow,
  onManageListings
}: SellerToolsPanelProps) {
  const [selectedForListing, setSelectedForListing] = useState<number | null>(null);

  // Workflows that could be listed (have been cloned or created)
  const listableWorkflows = workflows.filter(w => w.cloneCount > 0 || w.creator === undefined);

  return (
    <div className="space-y-6">
      {/* Marketplace Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Marketplace Tools
          </CardTitle>
          <CardDescription>
            List your workflows for sale and manage marketplace listings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-medium text-blue-900">List a Workflow</p>
              </div>
              <p className="text-xs text-blue-700 mb-3">
                Transfer a cloned workflow to the marketplace and set a price
              </p>
              <Button
                onClick={onManageListings}
                size="sm"
                variant="outline"
                className="w-full"
              >
                <Plus className="w-3 h-3 mr-1" />
                New Listing
              </Button>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-900">Manage Listings</p>
              </div>
              <p className="text-xs text-green-700 mb-3">
                Update prices and manage your active marketplace listings
              </p>
              <Button
                onClick={onManageListings}
                size="sm"
                variant="outline"
                className="w-full"
              >
                View Listings
              </Button>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-4 h-4 text-purple-600" />
                <p className="text-sm font-medium text-purple-900">How It Works</p>
              </div>
              <p className="text-xs text-purple-700 mb-3">
                Clone a workflow, list it for sale, and earn FLOW from buyers
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
              >
                Learn More
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Workflows for Listing */}
      <Card>
        <CardHeader>
          <CardTitle>Available for Listing</CardTitle>
          <CardDescription>
            Workflows you can list on the marketplace
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listableWorkflows.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-600 mb-3">No workflows available to list</p>
              <p className="text-sm text-slate-500 mb-4">
                Clone a workflow first, then you can list it for sale on the marketplace
              </p>
            </div>
          ) : (
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ({listableWorkflows.length})</TabsTrigger>
                <TabsTrigger value="created">Created</TabsTrigger>
                <TabsTrigger value="cloned">Cloned</TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <div className="space-y-3">
                  {listableWorkflows.map((workflow) => (
                    <div
                      key={workflow.workflowId}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900">{workflow.name}</h4>
                        <p className="text-sm text-slate-600">{workflow.category}</p>
                      </div>
                      <Button
                        onClick={() => {
                          setSelectedForListing(workflow.workflowId);
                          onListWorkflow(workflow);
                        }}
                        size="sm"
                        className="gap-2"
                      >
                        <Plus className="w-3 h-3" />
                        List for Sale
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="created">
                <div className="space-y-3">
                  {listableWorkflows
                    .filter(w => w.creator === undefined)
                    .map((workflow) => (
                      <div
                        key={workflow.workflowId}
                        className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50"
                      >
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-900">{workflow.name}</h4>
                          <p className="text-sm text-slate-600">{workflow.category}</p>
                        </div>
                        <Button
                          onClick={() => {
                            setSelectedForListing(workflow.workflowId);
                            onListWorkflow(workflow);
                          }}
                          size="sm"
                          className="gap-2"
                        >
                          <Plus className="w-3 h-3" />
                          List for Sale
                        </Button>
                      </div>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="cloned">
                <div className="space-y-3">
                  {listableWorkflows
                    .filter(w => w.cloneCount > 0)
                    .map((workflow) => (
                      <div
                        key={workflow.workflowId}
                        className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50"
                      >
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-900">{workflow.name}</h4>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {workflow.cloneCount} clones
                            </Badge>
                            {workflow.price && workflow.price > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {workflow.price} FLOW
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            setSelectedForListing(workflow.workflowId);
                            onListWorkflow(workflow);
                          }}
                          size="sm"
                          className="gap-2"
                        >
                          <Plus className="w-3 h-3" />
                          List for Sale
                        </Button>
                      </div>
                    ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Marketplace Info */}
      <Card>
        <CardHeader>
          <CardTitle>How the Marketplace Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <span className="text-sm font-semibold text-blue-700">1</span>
                </div>
              </div>
              <div>
                <p className="font-medium text-slate-900">Clone a Workflow</p>
                <p className="text-sm text-slate-600">
                  Clone any public workflow from the Discover page to your wallet
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <span className="text-sm font-semibold text-blue-700">2</span>
                </div>
              </div>
              <div>
                <p className="font-medium text-slate-900">List for Sale</p>
                <p className="text-sm text-slate-600">
                  Transfer your cloned workflow to the marketplace and set your asking price
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <span className="text-sm font-semibold text-blue-700">3</span>
                </div>
              </div>
              <div>
                <p className="font-medium text-slate-900">Earn FLOW</p>
                <p className="text-sm text-slate-600">
                  When someone purchases your listing, you receive FLOW minus a platform fee
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

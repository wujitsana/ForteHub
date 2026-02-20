'use client';

import { useState } from 'react';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { WorkflowInfo } from '@/types/interfaces';
import { purchaseListingTransaction } from '@/lib/marketplaceTransactions';
import { formatFlow } from '@/lib/formatters';
import { TransactionButton, TransactionDialog } from '@onflow/react-sdk';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';


interface PurchaseModalProps {
  open: boolean;
  onClose: () => void;
  workflow: WorkflowInfo | null;
  listingId?: number;
  price?: string;
  sellerAddress?: string;
  onPurchaseSuccess: (txId: string) => void;
}

export function PurchaseModal({
  open,
  onClose,
  workflow,
  listingId,
  price,
  sellerAddress,
  onPurchaseSuccess,
}: PurchaseModalProps) {
  const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  if (!workflow) return null;

  const creatorAddress = workflow.creator
    ? `${workflow.creator.slice(0, 8)}...${workflow.creator.slice(-4)} `
    : 'Unknown';

  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader
        title={workflow.name}
        description={`by ${creatorAddress} `}
        onClose={onClose}
      />

      <ModalBody>
        <div className="space-y-4">
          {/* Description */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Description</h3>
            <p className="text-sm text-slate-700">
              {workflow.description}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-900">
                {workflow.cloneCount || 0}
              </p>
              <p className="text-xs text-slate-600">Clones</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-900">
                {workflow.forkCount || 0}
              </p>
              <p className="text-xs text-slate-600">Forks</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-sm font-bold text-slate-900">
                {new Date(workflow.createdAt * 1000).toLocaleDateString()}
              </p>
              <p className="text-xs text-slate-600">Created</p>
            </div>
          </div>

          {/* Price Info */}
          {price && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-blue-900">Price</span>
                <span className="text-lg font-bold text-blue-900">{price} FLOW</span>
              </div>
            </div>
          )}

          {/* Features */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3">Features</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm text-slate-700">Audited source code</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm text-slate-700">IPFS verified deployment</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm text-slate-700">Wallet-owned execution</span>
              </div>
            </div>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <TransactionButton
          transaction={{
            cadence: purchaseListingTransaction,
            args: (arg, t) => [
              arg(listingId?.toString() || '0', t.UInt64),
              arg(sellerAddress || '', t.Address),
              arg(parseFloat(price || '0').toFixed(8), t.UFix64)
            ],
            limit: 1000
          }}
          label="Confirm Purchase"
          disabled={!workflow || !listingId || !sellerAddress}
          mutation={{
            onSuccess: (txId) => {
              // Don't call success yet - wait for TransactionDialog to confirm sealed
              setTransactionDialogTxId(txId);
              setIsTransactionDialogOpen(true);
            },
            onError: (error) => {
              console.error("Purchase failed:", error);
            }
          }}
        />
      </ModalFooter>

      {/* Transaction Status Dialog - waits for sealed before calling success */}
      {isTransactionDialogOpen && transactionDialogTxId && (
        <TransactionDialog
          transactionId={transactionDialogTxId}
          onClose={() => {
            setIsTransactionDialogOpen(false);
            setTransactionDialogTxId(null);
            // Only call success callback after transaction is sealed
            onPurchaseSuccess(transactionDialogTxId);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

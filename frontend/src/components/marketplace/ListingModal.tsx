import { useState } from 'react';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { TransactionButton, TransactionDialog } from '@onflow/react-sdk';
import { createListingTransaction } from '@/lib/marketplaceTransactions';
import { WorkflowInfo } from '@/types/interfaces';

interface ListingModalProps {
    open: boolean;
    onClose: () => void;
    workflow: WorkflowInfo | null;
    onListingSuccess: (txId: string) => void;
}

export function ListingModal({
    open,
    onClose,
    workflow,
    onListingSuccess
}: ListingModalProps) {
    const [priceInput, setPriceInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);

    const handleClose = () => {
        setPriceInput('');
        setError(null);
        onClose();
    };

    return (
        <Modal open={open} onClose={handleClose}>
            <ModalHeader
                title="List Workflow for Sale"
                description={workflow ? `List "${workflow.name}" for sale` : ''}
                onClose={handleClose}
            />
            <ModalBody>
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Set the price for this unique workflow instance. Once listed, it will be removed from your dashboard until cancelled or sold.
                    </p>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Price (FLOW)</label>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="0.0"
                            className="w-full p-2 border rounded-md"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
            </ModalBody>
            <ModalFooter>
                <Button variant="outline" onClick={handleClose}>
                    Cancel
                </Button>
                <TransactionButton
                    transaction={{
                        cadence: createListingTransaction,
                        args: (arg, t) => [
                            arg(workflow?.workflowId?.toString() || '0', t.UInt64),
                            arg(parseFloat(priceInput || '0').toFixed(8), t.UFix64)
                        ],
                        limit: 1000
                    }}
                    label="Confirm Listing"
                    disabled={!priceInput || !workflow}
                    mutation={{
                        onSuccess: (txId) => {
                            // Don't call success yet - wait for TransactionDialog to confirm sealed
                            setTransactionDialogTxId(txId);
                            setIsTransactionDialogOpen(true);
                        },
                        onError: (error) => {
                            console.error("Listing failed:", error);
                            setError(error.message);
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
                        onListingSuccess(transactionDialogTxId);
                        handleClose();
                    }}
                />
            )}
        </Modal>
    );
}

import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { TransactionButton, TransactionDialog } from '@onflow/react-sdk';
import { useState } from 'react';
import { cancelListingTransaction } from '@/lib/marketplaceTransactions';
import { MarketplaceListing } from '@/types/interfaces';

interface UnlistModalProps {
    open: boolean;
    onClose: () => void;
    listing: MarketplaceListing | null;
    onUnlistSuccess: (txId: string) => void;
}

export function UnlistModal({
    open,
    onClose,
    listing,
    onUnlistSuccess
}: UnlistModalProps) {
    const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);

    if (!listing) return null;

    return (
        <Modal open={open} onClose={onClose}>
            <ModalHeader
                title="Unlist Workflow"
                description={`Are you sure you want to remove "${listing.workflowInfo?.name}" from the marketplace?`}
                onClose={onClose}
            />
            <ModalBody>
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        This will remove the listing and return the workflow to your dashboard. You can list it again at any time.
                    </p>
                    <div className="bg-yellow-50 border border-yellow-100 rounded-md p-3">
                        <p className="text-sm text-yellow-800">
                            Note: The workflow will be returned to your account's Manager.
                        </p>
                    </div>
                </div>
            </ModalBody>
            <ModalFooter>
                <Button variant="outline" onClick={onClose}>
                    Cancel
                </Button>
                <TransactionButton
                    transaction={{
                        cadence: cancelListingTransaction,
                        args: (arg, t) => [
                            arg(listing.listingId.toString(), t.UInt64)
                        ],
                        limit: 1000
                    }}
                    label="Confirm Unlist"
                    mutation={{
                        onSuccess: (txId) => {
                            // Don't call success yet - wait for TransactionDialog to confirm sealed
                            setTransactionDialogTxId(txId);
                            setIsTransactionDialogOpen(true);
                        },
                        onError: (error) => {
                            console.error("Unlisting failed:", error);
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
                        onUnlistSuccess(transactionDialogTxId);
                        onClose();
                    }}
                />
            )}
        </Modal>
    );
}

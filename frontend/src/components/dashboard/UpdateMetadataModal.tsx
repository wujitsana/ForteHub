'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { TransactionButton, useFlowCurrentUser, type TransactionButton as TransactionButtonType } from '@onflow/react-sdk';
import { AlertCircle } from 'lucide-react';
import { UPDATE_METADATA_TRANSACTION, buildUpdateMetadataArgs, validateMetadataUpdates } from '@/lib/updateMetadataTransaction';
import { WorkflowInfo } from '@/types/interfaces';
import type { ComponentProps } from 'react';

type TransactionConfig = ComponentProps<typeof TransactionButton>['transaction'];

interface UpdateMetadataModalProps {
  workflow: WorkflowInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export default function UpdateMetadataModal({
  workflow,
  isOpen,
  onClose,
  onSuccess,
  onError
}: UpdateMetadataModalProps) {
  const { user } = useFlowCurrentUser();
  const userAddress = user?.addr || null;

  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    // Clear error when user starts typing
    if (errors.name) {
      setErrors(prev => ({ ...prev, name: undefined }));
    }
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    // Clear error when user starts typing
    if (errors.description) {
      setErrors(prev => ({ ...prev, description: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors = validateMetadataUpdates(name, description);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildUpdateTransaction = (): TransactionConfig | null => {
    if (!workflow || !userAddress) return null;

    try {
      return {
        cadence: UPDATE_METADATA_TRANSACTION,
        limit: 9999,
        args: (arg: any, t: any) =>
          buildUpdateMetadataArgs(
            workflow.workflowId.toString(),
            name,
            description,
            JSON.stringify(workflow.metadata || {}),
            arg,
            t
          )
      };
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to build transaction');
      return null;
    }
  };

  const handleClose = () => {
    // Reset form
    setName(workflow?.name || '');
    setDescription(workflow?.description || '');
    setErrors({});
    setIsSubmitting(false);
    onClose();
  };

  // Can only update if user is the creator
  const isCreator = workflow && userAddress && workflow.creator === userAddress;

  if (!workflow) {
    return null;
  }

  return (
    <Modal open={isOpen} onClose={handleClose}>
      <ModalHeader
        title="Update Workflow Metadata"
        description="Update your workflow's name and description. These changes will be visible to future cloners."
        onClose={handleClose}
      />
      <ModalBody>
        <div className="space-y-4">
          {!isCreator && (
            <div className="p-3 bg-red-50 border border-red-200 rounded flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                Only the workflow creator can update metadata.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="name" className="text-sm font-medium">
              Workflow Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter workflow name"
              disabled={!isCreator || isSubmitting}
              className="mt-1"
            />
            {errors.name && (
              <p className="text-sm text-red-600 mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <Label htmlFor="description" className="text-sm font-medium">
              Workflow Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Enter workflow description"
              disabled={!isCreator || isSubmitting}
              rows={4}
              className="mt-1"
            />
            {errors.description && (
              <p className="text-sm text-red-600 mt-1">{errors.description}</p>
            )}
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> Changes will trigger a WorkflowMetadataUpdated event.
              Future cloners will see these new defaults, but existing clones keep their original snapshot.
            </p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="outline"
          onClick={handleClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        {isCreator ? (
          <TransactionButton
            transaction={buildUpdateTransaction() || { cadence: '', limit: 0, args: () => [] }}
            label="Update Metadata"
            disabled={!isCreator || isSubmitting}
            mutation={{
              onSuccess: () => {
                onSuccess?.();
                handleClose();
              },
              onError: (error: Error) => {
                onError?.(error.message);
              }
            }}
          />
        ) : (
          <Button disabled>Update Metadata</Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

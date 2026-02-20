'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import {
  TransactionButton,
  TransactionDialog,
  type TransactionConfig,
  useFlowScheduledTransactionList,
  useFlowScheduledTransactionCancel
} from '@onflow/react-sdk';
import { WorkflowInfo } from '@/types/interfaces';

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');

interface SchedulingControlsProps {
  workflow: WorkflowInfo;
  userAddress: string;
  onSchedulingChanged?: () => void;
  onStatusMessage?: (type: 'success' | 'error', text: string) => void;
}

export default function SchedulingControls({
  workflow,
  userAddress,
  onSchedulingChanged,
  onStatusMessage
}: SchedulingControlsProps) {
  const [isEnableModalOpen, setIsEnableModalOpen] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [schedulingAction, setSchedulingAction] = useState<'enable' | 'disable' | null>(null);

  // Extract default frequency from workflow configDefaults
  const defaultFrequency = useMemo(() => {
    try {
      // Check configDefaults first (this is where it's stored in registration)
      if (workflow.configDefaults?.frequency) {
        const freq = parseFloat(workflow.configDefaults.frequency);
        if (!isNaN(freq)) return freq;
      }
      // Fallback to metadata
      const metadata = workflow.metadataJSON ? JSON.parse(workflow.metadataJSON) : {};
      if (metadata.frequency) {
        const freq = parseFloat(metadata.frequency);
        if (!isNaN(freq)) return freq;
      }
    } catch (e) {
      console.error('Error parsing frequency:', e);
    }
    return 3600; // Default 1 hour
  }, [workflow]);

  // Check if workflow is schedulable (has frequency in configDefaults or metadata)
  const isSchedulable = useMemo(() => {
    // Check configDefaults first
    if (workflow.configDefaults?.frequency !== undefined) {
      return true;
    }
    // Check metadata as fallback
    try {
      const metadata = workflow.metadataJSON ? JSON.parse(workflow.metadataJSON) : {};
      if (metadata.frequency !== undefined || metadata.isSchedulable === true) {
        return true;
      }
    } catch { }
    // Check capabilities
    if (workflow.capabilities?.isSchedulable === true) {
      return true;
    }
    return false;
  }, [workflow]);

  console.log('SchedulingControls - workflow:', workflow.name);
  console.log('  configDefaults:', workflow.configDefaults);
  console.log('  isSchedulable:', isSchedulable);
  console.log('  defaultFrequency:', defaultFrequency);

  const [useDefaultFrequency, setUseDefaultFrequency] = useState(true);
  const [customFrequencyValue, setCustomFrequencyValue] = useState<string>('1');
  const [customFrequencyUnit, setCustomFrequencyUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks'>('hours');

  // Query scheduled tasks for this account using Flow SDK hook
  // NOTE: Disabled on testnet due to REST API 400 errors - will need testnet support
  const { data: scheduledTasks = [], isLoading: isLoadingTasks } = useFlowScheduledTransactionList({
    account: userAddress || '',
    query: {
      enabled: false, // TODO: Re-enable when testnet supports this query
      staleTime: 30000
    }
  });

  // Mutation hook for canceling scheduled transactions
  const { cancelTransactionAsync } = useFlowScheduledTransactionCancel();

  // Find if this workflow is currently scheduled
  const isScheduled = useMemo(() => {
    return scheduledTasks.some(task => {
      // Match task by workflow ID encoded in the task data or metadata
      // This is a simplified check - actual implementation would need to store
      // workflow ID in the scheduled task's metadata
      return task.metadata?.workflowId === workflow.workflowId.toString();
    });
  }, [scheduledTasks, workflow.workflowId]);

  const scheduledTask = useMemo(() => {
    return scheduledTasks.find(task =>
      task.metadata?.workflowId === workflow.workflowId.toString()
    );
  }, [scheduledTasks, workflow.workflowId]);

  const buildEnableSchedulingTransaction = (frequencySeconds: number): TransactionConfig => {
    if (!userAddress) {
      throw new Error('Please connect your wallet.');
    }

    return {
      cadence: `
        import ForteHub from 0xbd4c3996265ed830

        transaction(workflowId: UInt64, frequencySeconds: UFix64) {
          prepare(signer: auth(Storage, Capabilities) &Account) {
            let managerRef = signer.storage.borrow<&ForteHub.Manager>(
              from: ForteHub.FORTEHUB_MANAGER_STORAGE
            ) ?? panic("ForteHub not initialized")

            ForteHub.scheduleWorkflow(
              managerRef: managerRef,
              workflowId: workflowId,
              frequencySeconds: frequencySeconds,
              account: signer
            )

            log("Workflow scheduled with frequency: ".concat(frequencySeconds.toString()))
          }
        }
      `,
      limit: 9999,
      args: (arg: any, t: any) => [
        arg(workflow.workflowId.toString(), t.UInt64),
        arg(frequencySeconds.toFixed(1), t.UFix64)
      ]
    };
  };

  const buildDisableSchedulingTransaction = (taskId: string): TransactionConfig => {
    if (!userAddress) {
      throw new Error('Please connect your wallet.');
    }

    // Convert taskId string to UInt64
    const taskIdNum = BigInt(taskId);

    return {
      cadence: `
        import ForteHub from 0xbd4c3996265ed830
        import FlowTransactionSchedulerUtils from 0x8c5303eaa26202d6

        transaction(workflowId: UInt64, taskId: UInt64) {
          prepare(signer: auth(Storage) &Account) {
            let managerRef = signer.storage.borrow<&ForteHub.Manager>(
              from: ForteHub.FORTEHUB_MANAGER_STORAGE
            ) ?? panic("ForteHub not initialized")

            // Cancel the scheduled task with FlowTransactionScheduler
            let schedulerRef = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
              from: FlowTransactionSchedulerUtils.managerStoragePath
            ) ?? panic("FlowTransactionScheduler Manager not found")

            let taskToCancel <- schedulerRef.cancel(id: taskId)
            destroy taskToCancel

            // Clean up the workflow handler and manager metadata
            ForteHub.unscheduleWorkflow(
              managerRef: managerRef,
              workflowId: workflowId,
              account: signer
            )

            log("Workflow scheduling disabled")
          }
        }
      `,
      limit: 9999,
      args: (arg: any, t: any) => [
        arg(workflow.workflowId.toString(), t.UInt64),
        arg(taskId, t.UInt64)
      ]
    };
  };

  // Helper to format frequency in human-readable form
  const formatFrequency = (seconds: number): string => {
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days`;
    return `${Math.floor(seconds / 604800)} weeks`;
  };

  // Helper to convert custom input to seconds
  const convertToSeconds = (value: number, unit: 'minutes' | 'hours' | 'days' | 'weeks'): number => {
    switch (unit) {
      case 'minutes': return value * 60;
      case 'hours': return value * 3600;
      case 'days': return value * 86400;
      case 'weeks': return value * 604800;
    }
  };

  const getFrequencyLabel = (seconds: number): string => {
    const preset = FREQUENCY_PRESETS.find(p => p.value === seconds);
    if (preset) return preset.label;

    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  if (isLoadingTasks) {
    return (
      <div className="p-3 bg-gray-50 rounded text-sm">
        <p className="text-gray-600">Loading scheduling status...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 pt-2 border-t">
        {isScheduled && scheduledTask ? (
          <>
            <Badge variant="outline" className="bg-green-50 border-green-200 text-green-800">
              Scheduled • {getFrequencyLabel(scheduledTask.frequency || 86400)}
            </Badge>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setSelectedTaskId(scheduledTask.id);
                setIsDisableModalOpen(true);
              }}
            >
              Disable Scheduling
            </Button>
          </>
        ) : (
          <>
            <Badge variant="outline" className="bg-gray-100">Not Scheduled</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedFrequency(null);
                setCustomFrequency('');
                setIsEnableModalOpen(true);
              }}
            >
              Enable Scheduling
            </Button>
          </>
        )}
      </div>

      {/* Enable Scheduling Modal */}
      <Modal
        open={isEnableModalOpen}
        onClose={() => setIsEnableModalOpen(false)}
      >
        <ModalHeader
          title="Enable Workflow Scheduling"
          description={`Schedule "${workflow.name}" to run autonomously`}
          onClose={() => setIsEnableModalOpen(false)}
        />
        <ModalBody>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-3">Choose how often this workflow should run automatically:</p>

            {/* Default Frequency Option */}
            <div
              onClick={() => setUseDefaultFrequency(true)}
              className={`p-3 rounded border cursor-pointer transition ${useDefaultFrequency ? 'border-blue-600 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={useDefaultFrequency}
                  onChange={() => setUseDefaultFrequency(true)}
                  className="cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">Use Default Frequency</p>
                  <p className="text-xs text-gray-600">Every {formatFrequency(defaultFrequency)} ({defaultFrequency} seconds)</p>
                </div>
              </div>
            </div>

            {/* Custom Frequency Option */}
            <div
              onClick={() => setUseDefaultFrequency(false)}
              className={`p-3 rounded border cursor-pointer transition ${!useDefaultFrequency ? 'border-blue-600 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="radio"
                  checked={!useDefaultFrequency}
                  onChange={() => setUseDefaultFrequency(false)}
                  className="cursor-pointer"
                />
                <p className="text-sm font-medium">Custom Frequency</p>
              </div>

              {!useDefaultFrequency && (
                <div className="ml-6 flex gap-2 items-center">
                  <span className="text-sm text-gray-600">Every</span>
                  <input
                    type="number"
                    min="1"
                    value={customFrequencyValue}
                    onChange={(e) => setCustomFrequencyValue(e.target.value)}
                    className="w-20 px-2 py-1 border rounded text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <select
                    value={customFrequencyUnit}
                    onChange={(e) => setCustomFrequencyUnit(e.target.value as 'minutes' | 'hours' | 'days' | 'weeks')}
                    className="px-2 py-1 border rounded text-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                </div>
              )}
            </div>

            {!useDefaultFrequency && !customFrequencyValue && (
              <p className="text-xs text-red-600">Please enter a frequency value</p>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setIsEnableModalOpen(false)}
          >
            Cancel
          </Button>
          {(useDefaultFrequency || customFrequencyValue) ? (
            <TransactionButton
              transaction={buildEnableSchedulingTransaction(
                useDefaultFrequency
                  ? defaultFrequency
                  : convertToSeconds(parseInt(customFrequencyValue) || 1, customFrequencyUnit)
              )}
              label="Enable Scheduling"
              mutation={{
                onSuccess: (txId: string) => {
                  setTransactionDialogTxId(txId);
                  setSchedulingAction('enable');
                  setIsTransactionDialogOpen(true);
                  setIsEnableModalOpen(false);
                },
                onError: (error: Error) => {
                  onStatusMessage?.('error', `Failed to enable scheduling: ${error.message}`);
                }
              }}
            />
          ) : (
            <Button disabled>Enable Scheduling</Button>
          )}
        </ModalFooter>
      </Modal>

      {/* Disable Scheduling Modal */}
      <Modal
        open={isDisableModalOpen && !!selectedTaskId}
        onClose={() => !isTransactionDialogOpen && setIsDisableModalOpen(false)}
      >
        <ModalHeader
          title="Disable Workflow Scheduling"
          description={`Stop autonomous execution of "${workflow.name}"`}
          onClose={() => !isTransactionDialogOpen && setIsDisableModalOpen(false)}
        />
        <ModalBody>
          <p className="text-sm text-gray-600">
            This will cancel the scheduled task and stop the workflow from running automatically. You can re-enable scheduling anytime.
          </p>
          {scheduledTask && (
            <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
              <p className="text-gray-700">
                <span className="font-semibold">Current frequency:</span> {getFrequencyLabel(scheduledTask.frequency || 86400)}
              </p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setIsDisableModalOpen(false)}
            disabled={isTransactionDialogOpen}
          >
            Cancel
          </Button>
          {selectedTaskId ? (
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  const txId = await cancelTransactionAsync(selectedTaskId);
                  setTransactionDialogTxId(txId);
                  setSchedulingAction('disable');
                  setIsTransactionDialogOpen(true);
                  setIsDisableModalOpen(false);
                } catch (error) {
                  onStatusMessage?.('error', `Failed to disable scheduling: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
              disabled={isTransactionDialogOpen}
            >
              Disable Scheduling
            </Button>
          ) : (
            <Button disabled variant="destructive">Disable Scheduling</Button>
          )}
        </ModalFooter>
      </Modal>

      {/* Transaction Dialog - For both enable and disable */}
      {isTransactionDialogOpen && transactionDialogTxId && (
        <TransactionDialog
          transactionId={transactionDialogTxId}
          onClose={() => {
            setIsTransactionDialogOpen(false);
            setTransactionDialogTxId(null);

            const message = schedulingAction === 'enable'
              ? `${workflow.name} is now scheduled!`
              : `${workflow.name} scheduling disabled.`;

            onStatusMessage?.('success', message);
            onSchedulingChanged?.();
            setSchedulingAction(null);
          }}
        />
      )}
    </>
  );
}

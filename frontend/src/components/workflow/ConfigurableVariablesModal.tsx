'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ComponentProps } from 'react';
import { TransactionButton, TransactionDialog } from '@onflow/react-sdk';

export interface ConfigurableVariable {
  value: string;
  type: string;
  label?: string;
  min?: string;
  max?: string;
}

export interface ConfigurableVariablesModalProps {
  open: boolean;
  onClose: () => void;
  variables: Record<string, ConfigurableVariable>;
  workflowName?: string;
  deploymentSummary?: {
    contractName: string;
    description?: string;
  };
  transactionBuilder?: (overrides: Record<string, ConfigurableVariable>) => ComponentProps<typeof TransactionButton>['transaction'];
  onDeploySuccess?: (txId: string) => void;
  onDeployError?: (error: Error) => void;
  isDeploying?: boolean;
}

export function ConfigurableVariablesModal({
  open,
  onClose,
  variables,
  workflowName,
  deploymentSummary,
  transactionBuilder,
  onDeploySuccess,
  onDeployError,
  isDeploying = false
}: ConfigurableVariablesModalProps) {
  const [editedVariables, setEditedVariables] = useState<Record<string, ConfigurableVariable>>(variables);
  const [enableScheduling, setEnableScheduling] = useState(true); // Default true
  const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);

  // Extract default frequency from workflow variables
  const defaultFrequency = useMemo(() => {
    if ('frequency' in variables && variables.frequency.value) {
      return parseFloat(variables.frequency.value);
    }
    return 3600; // Default to 1 hour if not specified
  }, [variables]);

  const [schedulingFrequency, setSchedulingFrequency] = useState<number>(defaultFrequency);
  const [useDefaultFrequency, setUseDefaultFrequency] = useState(true);
  const [customFrequencyValue, setCustomFrequencyValue] = useState<string>('1');
  const [customFrequencyUnit, setCustomFrequencyUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks'>('hours');

  // Check if workflow is schedulable (has frequency variable)
  const isSchedulable = useMemo(() => {
    return 'frequency' in variables;
  }, [variables]);

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

  useEffect(() => {
    setEditedVariables(variables);
    setEnableScheduling(true); // Default to enabled when modal opens
    setSchedulingFrequency(defaultFrequency);
    setUseDefaultFrequency(true);
  }, [variables, open, defaultFrequency]);

  const handleVariableChange = (key: string, newValue: string) => {
    setEditedVariables(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        value: newValue
      }
    }));
  };

  const buildTransaction = () => {
    console.log('buildTransaction called');
    console.log('transactionBuilder exists:', !!transactionBuilder);
    console.log('editedVariables:', editedVariables);
    console.log('enableScheduling:', enableScheduling);
    console.log('schedulingFrequency:', schedulingFrequency);

    if (!transactionBuilder) {
      console.log('No transactionBuilder, returning undefined');
      return undefined;
    }

    try {
      // Pass scheduling params to transaction builder
      const result = transactionBuilder(editedVariables, enableScheduling, schedulingFrequency);
      console.log('Transaction built successfully:', result);
      return result;
    } catch (error) {
      console.error('Error building transaction:', error);
      throw error;
    }
  };

  const variableCount = Object.keys(variables).length;
  const hasVariables = variableCount > 0;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader
        title="Clone Workflow"
        description={workflowName || 'Configure and clone workflow'}
        onClose={onClose}
      />
      <ModalBody>
        <div className="space-y-6">
          {/* Deployment Summary */}
          {deploymentSummary && (
            <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
              <h3 className="font-semibold text-sm mb-3 text-gray-800">Clone Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Workflow</span>
                  <span className="font-medium">{workflowName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Contract</span>
                  <span className="font-mono text-xs">{deploymentSummary.contractName}</span>
                </div>
                {deploymentSummary.description && (
                  <div className="text-xs text-gray-600 pt-2 border-t border-blue-200">
                    {deploymentSummary.description}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Optional Scheduling (only for workflows with frequency variable) */}
          {isSchedulable && (
            <div className="border rounded-lg p-4 bg-green-50 border-green-200">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="enableScheduling"
                  checked={enableScheduling}
                  onChange={(e) => setEnableScheduling(e.target.checked)}
                  className="rounded"
                  disabled={isDeploying}
                />
                <label htmlFor="enableScheduling" className="font-semibold text-sm text-gray-800 cursor-pointer">
                  🔁 Enable Auto-Scheduling
                </label>
              </div>

              {enableScheduling && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600">Choose scheduling frequency:</p>

                  {/* Default Frequency Option */}
                  <div
                    onClick={() => {
                      setUseDefaultFrequency(true);
                      setSchedulingFrequency(defaultFrequency);
                    }}
                    className={`p-3 rounded border cursor-pointer transition ${useDefaultFrequency
                      ? 'border-green-600 bg-green-100'
                      : 'border-gray-300 hover:border-green-400'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={useDefaultFrequency}
                        onChange={() => {
                          setUseDefaultFrequency(true);
                          setSchedulingFrequency(defaultFrequency);
                        }}
                        className="cursor-pointer"
                        disabled={isDeploying}
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
                    className={`p-3 rounded border cursor-pointer transition ${!useDefaultFrequency
                      ? 'border-green-600 bg-green-100'
                      : 'border-gray-300 hover:border-green-400'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="radio"
                        checked={!useDefaultFrequency}
                        onChange={() => setUseDefaultFrequency(false)}
                        className="cursor-pointer"
                        disabled={isDeploying}
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
                          onChange={(e) => {
                            setCustomFrequencyValue(e.target.value);
                            const value = parseInt(e.target.value) || 1;
                            setSchedulingFrequency(convertToSeconds(value, customFrequencyUnit));
                          }}
                          className="w-20 px-2 py-1 border rounded text-sm"
                          disabled={isDeploying}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <select
                          value={customFrequencyUnit}
                          onChange={(e) => {
                            const unit = e.target.value as 'minutes' | 'hours' | 'days' | 'weeks';
                            setCustomFrequencyUnit(unit);
                            const value = parseInt(customFrequencyValue) || 1;
                            setSchedulingFrequency(convertToSeconds(value, unit));
                          }}
                          className="px-2 py-1 border rounded text-sm"
                          disabled={isDeploying}
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
                </div>
              )}
            </div>
          )}

          {/* Configurable Variables */}
          {hasVariables && (
            <div>
              <h3 className="font-semibold text-sm mb-3 text-gray-800">
                Configuration ({Object.keys(editedVariables).filter(k => k !== 'frequency').length} variable{Object.keys(editedVariables).filter(k => k !== 'frequency').length !== 1 ? 's' : ''})
              </h3>
              <div className="space-y-4">
                {Object.entries(editedVariables)
                  .filter(([key]) => key !== 'frequency') // Hide frequency - it's in scheduling section
                  .map(([key, variable]) => (
                    <div key={key} className="border rounded-lg p-3 bg-slate-50">
                      <Label className="text-sm font-medium text-gray-700 block mb-2">
                        {variable.label || key.replace(/([A-Z])/g, ' $1').trim()}
                      </Label>
                      <Input
                        type={variable.type === 'number' ? 'number' : 'text'}
                        value={variable.value}
                        onChange={(e) => handleVariableChange(key, e.target.value)}
                        placeholder={`Enter ${variable.label || key}`}
                        min={variable.min}
                        max={variable.max}
                        className="w-full"
                        disabled={isDeploying}
                      />
                      {(variable.min || variable.max) && (
                        <p className="text-xs text-gray-500 mt-1">
                          {variable.min && `Min: ${variable.min}`}
                          {variable.min && variable.max && ' | '}
                          {variable.max && `Max: ${variable.max}`}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {!hasVariables && (
            <p className="text-sm text-gray-500">No configurable variables for this workflow.</p>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={isDeploying}>
          Cancel
        </Button>
        {transactionBuilder && onDeploySuccess ? (() => {
          const transaction = buildTransaction();
          if (!transaction) {
            return <Button onClick={onClose}>Close</Button>;
          }
          return (
            <TransactionButton
              transaction={transaction}
              label="Clone Workflow"
              disabled={isDeploying}
              mutation={{
                onSuccess: (txId: string) => {
                  console.log('Clone transaction submitted! txId:', txId);
                  // Don't call success yet - wait for TransactionDialog to confirm sealed
                  setTransactionDialogTxId(txId);
                  setIsTransactionDialogOpen(true);
                },
                onError: (error: Error) => {
                  console.error('Clone transaction ERROR:', error);
                  if (onDeployError) {
                    onDeployError(error);
                  }
                }
              }}
            />
          );
        })() : (
          <Button onClick={onClose}>Close</Button>
        )}
      </ModalFooter>

      {/* Transaction Status Dialog - waits for sealed before calling success */}
      {isTransactionDialogOpen && transactionDialogTxId && (
        <TransactionDialog
          transactionId={transactionDialogTxId}
          onClose={() => {
            setIsTransactionDialogOpen(false);
            setTransactionDialogTxId(null);
            // Only call success callback after transaction is sealed
            if (onDeploySuccess) {
              onDeploySuccess(transactionDialogTxId);
            }
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

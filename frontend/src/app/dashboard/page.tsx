'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkflowInfo, MetadataConfigField, TokenBalance } from '@/types/interfaces';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { useRouter } from 'next/navigation';
import { useFlowCurrentUser, useFlowQuery, useFlowMutate } from '@onflow/react-sdk';
import {
  FORTEHUB_REGISTRY,
  fetchWorkflowInfo,
  fetchCloneCount,
  fetchForkCount,
  normalizeWorkflowInfo,
  metadataToVarMap,
  normalizeCadenceDictionary
} from '@/lib/flowScripts';

export default function Dashboard() {
  const [myCreatedWorkflows, setMyCreatedWorkflows] = useState<WorkflowInfo[]>([]);
  const [myDeployedWorkflows, setMyDeployedWorkflows] = useState<WorkflowInfo[]>([]);
  const [loadingCreated, setLoadingCreated] = useState(true);
  const [loadingDeployed, setLoadingDeployed] = useState(true);
  const [flowBalance, setFlowBalance] = useState<number>(0);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [expandedWorkflowConfig, setExpandedWorkflowConfig] = useState<number | null>(null);
  const [updatableVars, setUpdatableVars] = useState<{[key: number]: {[key: string]: string}}>({});
  const [workflowPauseStatus, setWorkflowPauseStatus] = useState<{[key: number]: boolean}>({});
  const [varInputs, setVarInputs] = useState<{[key: number]: {[key: string]: string}}>({});
  const [deployedContractNames, setDeployedContractNames] = useState<{[key: string]: string}>({});
  const [workflowContractMapping, setWorkflowContractMapping] = useState<{[key: number]: string}>({});
  const [pauseSupported, setPauseSupported] = useState<{[key: number]: boolean}>({});
  const [statusMessage, setStatusMessage] = useState<{type: 'success' | 'error'; text: string} | null>(null);
  const [confirmState, setConfirmState] = useState<{
    type: 'pause' | 'burn' | 'unlist';
    workflow: WorkflowInfo;
    isPaused?: boolean;
  } | null>(null);
  const [unlistAlsoBurn, setUnlistAlsoBurn] = useState(false);
  const [varErrors, setVarErrors] = useState<{[key: number]: {[key: string]: string}}>({});
  const [reviewWorkflow, setReviewWorkflow] = useState<WorkflowInfo | null>(null);
  const [reviewChanges, setReviewChanges] = useState<Array<{name: string; value: string; type: string}>>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isSubmittingChanges, setIsSubmittingChanges] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const router = useRouter();

  const { user } = useFlowCurrentUser();
  const userAddress = user?.addr || '';

  const getMetadataField = (workflow: WorkflowInfo, fieldName: string): MetadataConfigField | undefined => {
    return workflow.metadata?.configFields.find((field) => field.name === fieldName);
  };

  const sanitizeContractName = (name: string): string | null => {
    return /^[A-Za-z_]\w*$/.test(name) ? name : null;
  };

  const findMatchingContractName = (
    baseContractName: string,
    availableContracts: string[]
  ): string | null => {
    if (!baseContractName) {
      return null;
    }

    const normalized = baseContractName.toLowerCase();
    const exactMatch = availableContracts.find(
      name => name.toLowerCase() === normalized
    );
    if (exactMatch) {
      return exactMatch;
    }

    const suffixedMatch = availableContracts.find(name =>
      name.toLowerCase().startsWith(`${normalized}_`)
    );

    if (suffixedMatch) {
      return suffixedMatch;
    }

    return null;
  };

  const formatVarName = (name: string): string => {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\w/g, (c) => c.toUpperCase());
  };

  // Query to get created workflow IDs
  const { data: createdWorkflowIds = [], isLoading: isLoadingCreatedIds } = useFlowQuery({
    cadence: `
      import ForteHubRegistry from ${FORTEHUB_REGISTRY}

      access(all) fun main(creator: Address): [UInt64] {
        return ForteHubRegistry.getWorkflowsByCreator(creator: creator)
      }
    `,
    args: (arg, t) => [arg(userAddress, t.Address)],
    query: {
      queryKey: ['created-workflow-ids', userAddress],
      enabled: !!userAddress,
      staleTime: 30000
    }
  });

  // Query to get deployed contract names
  const { data: deployedContractList = [], isLoading: isLoadingContracts } = useFlowQuery({
    cadence: `
      access(all) fun main(address: Address): [String] {
        let account = getAccount(address)
        let namesRef = account.contracts.names
        let result: [String] = []
        for name in namesRef {
          result.append(name)
        }
        return result
      }
    `,
    args: (arg, t) => [arg(userAddress, t.Address)],
    query: {
      queryKey: ['deployed-contracts', userAddress],
      enabled: !!userAddress,
      staleTime: 30000
    }
  });

  // Build contract mapping
  useEffect(() => {
    const contractMapping: {[key: string]: string} = {};
    (deployedContractList as string[]).forEach((name: string) => {
      if (typeof name === 'string') {
        contractMapping[name] = name;
      }
    });
    setDeployedContractNames(contractMapping);
  }, [deployedContractList]);

  // Load created workflows details
  // Memoize the createdWorkflowIds to prevent infinite loops from array reference changes
  const createdWorkflowIdsStr = useMemo(() => JSON.stringify(createdWorkflowIds), [createdWorkflowIds]);

  useEffect(() => {
    if (!isLoadingCreatedIds && Array.isArray(createdWorkflowIds) && createdWorkflowIds.length >= 0) {
      (async () => {
        setLoadingCreated(true);
        try {
          const updatableVarsAccum: {[key: number]: {[key: string]: string}} = {};

          const details = await Promise.all(
            (createdWorkflowIds as number[]).map(async (id: number) => {
              try {
                const rawInfo = await fetchWorkflowInfo(id);
                if (!rawInfo || typeof rawInfo !== 'object') {
                  return null;
                }

                const [cloneCount, forkCount] = await Promise.all([
                  fetchCloneCount(id),
                  fetchForkCount(id)
                ]);

                const normalizedBase = normalizeWorkflowInfo(rawInfo, {
                  cloneCount,
                  forkCount
                });

                let registryVars = normalizedBase.metadata
                  ? metadataToVarMap(normalizedBase.metadata)
                  : {};
                if ((!registryVars || Object.keys(registryVars).length === 0) && rawInfo.updatableVariables) {
                  registryVars = normalizeCadenceDictionary(rawInfo.updatableVariables);
                }

                if (registryVars && Object.keys(registryVars).length > 0) {
                  updatableVarsAccum[id] = registryVars;
                }

                const workflow: WorkflowInfo = {
                  ...normalizedBase,
                  updatableVariables:
                    registryVars && Object.keys(registryVars).length > 0
                      ? registryVars
                      : normalizedBase.updatableVariables
                };

                return workflow;
              } catch (error) {
                console.error('Error fetching workflow', id, error);
                return null;
              }
            })
          );

          const filtered = details.filter((w): w is WorkflowInfo => w !== null);
          setMyCreatedWorkflows(filtered);

          // Update all accumulated vars at once after fetch completes
          if (Object.keys(updatableVarsAccum).length > 0) {
            setUpdatableVars(prev => ({
              ...prev,
              ...updatableVarsAccum
            }));
          }
        } finally {
          setLoadingCreated(false);
        }
      })();
    }
  }, [isLoadingCreatedIds, createdWorkflowIdsStr]);

  // Load deployed workflows (stub for now - would need registry queries)
  useEffect(() => {
    setMyDeployedWorkflows([]);
    setLoadingDeployed(false);
  }, []);

  // Load balances
  useEffect(() => {
    if (!userAddress) return;

    const loadFlowBalance = async () => {
      try {
        const response = await fetch(`/api/balance?address=${userAddress}`);
        if (response.ok) {
          const data = await response.json();
          let balance = 0;
          if (typeof data.balance === 'object' && data.balance.value) {
            balance = parseFloat(data.balance.value) || 0;
          } else if (typeof data.balance === 'number') {
            balance = data.balance;
          }
          setFlowBalance(balance);
        }
      } catch (error) {
        console.error('Failed to load FLOW balance:', error);
      }
    };

    const loadTokenBalances = async () => {
      try {
        setLoadingTokens(true);
        setTokenBalances([
          {
            symbol: 'FLOW',
            name: 'Flow Token',
            balance: flowBalance.toString()
          }
        ]);
      } catch (error) {
        console.error('Failed to load token balances:', error);
      } finally {
        setLoadingTokens(false);
      }
    };

    loadFlowBalance();
    loadTokenBalances();
  }, [userAddress]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Mutation hooks
  const { mutate: executePauseMutation } = useFlowMutate({
    mutation: {
      onSuccess: () => {
        setStatusMessage({
          type: 'success',
          text: 'Workflow state updated successfully.'
        });
      },
      onError: (error: Error) => {
        setStatusMessage({
          type: 'error',
          text: `Failed to update workflow: ${error.message}`
        });
      }
    }
  });

  const { mutate: executeBurnMutation } = useFlowMutate({
    mutation: {
      onSuccess: () => {
        setStatusMessage({
          type: 'success',
          text: 'Contract burned successfully.'
        });
      },
      onError: (error: Error) => {
        setStatusMessage({
          type: 'error',
          text: `Failed to burn contract: ${error.message}`
        });
      }
    }
  });

  const { mutate: executeUnlistMutation } = useFlowMutate({
    mutation: {
      onSuccess: () => {
        setStatusMessage({
          type: 'success',
          text: 'Workflow removed from registry.'
        });
      },
      onError: (error: Error) => {
        setStatusMessage({
          type: 'error',
          text: `Failed to remove from registry: ${error.message}`
        });
      }
    }
  });

  const { mutate: executeUpdateVarMutation } = useFlowMutate({
    mutation: {
      onSuccess: () => {
        setStatusMessage({
          type: 'success',
          text: 'Configuration updated successfully.'
        });
      },
      onError: (error: Error) => {
        setStatusMessage({
          type: 'error',
          text: `Failed to update configuration: ${error.message}`
        });
      }
    }
  });

  const executePauseResume = async (workflow: WorkflowInfo, isPaused: boolean) => {
    if (!userAddress) return;

    const contractName = workflowContractMapping[workflow.workflowId];
    if (!contractName) {
      setStatusMessage({
        type: 'error',
        text: 'Could not find deployed contract. Please refresh and try again.'
      });
      return;
    }

    const action = isPaused ? 'resume' : 'pause';

    try {
      const cadenceCode = `
        import ${contractName} from ${userAddress}

        transaction {
          execute {
            ${contractName}.${action}()
          }
        }
      `;

      executePauseMutation({
        cadence: cadenceCode,
        gasLimit: 9999,
      });

      setWorkflowPauseStatus(prev => ({
        ...prev,
        [workflow.workflowId]: !isPaused
      }));
    } catch (error) {
      console.error(`Error ${action}ing workflow:`, error);
      setStatusMessage({
        type: 'error',
        text: `Failed to ${action} workflow.`
      });
    }
  };

  const executeBurnWorkflow = async (workflow: WorkflowInfo) => {
    if (!userAddress) return;

    try {
      const contractName = workflowContractMapping[workflow.workflowId];
      if (!contractName) {
        setStatusMessage({
          type: 'error',
          text: 'Could not find deployed contract. Please refresh and try again.'
        });
        return;
      }

      const cadenceCode = `
        transaction(name: String) {
          prepare(signer: auth(RemoveContract) &Account) {
            signer.contracts.remove(name: name)
          }
        }
      `;

      executeBurnMutation({
        cadence: cadenceCode,
        gasLimit: 9999,
        args: (arg, t) => [arg(contractName, t.String)]
      });
    } catch (error) {
      console.error('Error burning contract:', error);
      setStatusMessage({
        type: 'error',
        text: 'Failed to burn contract.'
      });
    }
  };

  const executeRemoveFromRegistry = async (workflow: WorkflowInfo, options?: { burnAfter?: boolean }) => {
    if (!userAddress) return;

    try {
      const cadenceCode = `
        import ForteHubRegistry from ${FORTEHUB_REGISTRY}

        transaction(workflowId: UInt64) {
          prepare(signer: auth(Storage) &Account) {
            ForteHubRegistry.setWorkflowListing(workflowId: workflowId, creator: signer.address, isListed: false)
          }
        }
      `;

      executeUnlistMutation({
        cadence: cadenceCode,
        gasLimit: 9999,
        args: (arg, t) => [arg(workflow.workflowId.toString(), t.UInt64)]
      });

      if (options?.burnAfter) {
        await executeBurnWorkflow(workflow);
      }
    } catch (error) {
      console.error('Error removing from registry:', error);
      setStatusMessage({
        type: 'error',
        text: `Failed to remove from registry: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  const handleUpdateVariable = async (
    workflow: WorkflowInfo,
    variableName: string,
    newValue: string,
    varType: string
  ) => {
    if (!userAddress) return;

    try {
      const contractName = workflowContractMapping[workflow.workflowId];
      if (!contractName) {
        setStatusMessage({
          type: 'error',
          text: 'Could not find deployed contract. Please refresh and try again.'
        });
        throw new Error('Missing contract name');
      }

      const functionName = `update${variableName.charAt(0).toUpperCase() + variableName.slice(1)}`;

      const cadenceCode = `
        import ${contractName} from ${userAddress}

        transaction(newValue: ${varType}) {
          execute {
            ${contractName}.${functionName}(newValue: newValue)
          }
        }
      `;

      const args = (arg: any, t: any) => {
        if (varType === 'UFix64') {
          return [arg(newValue, t.UFix64)];
        } else if (varType === 'UInt64') {
          return [arg(newValue, t.UInt64)];
        } else {
          return [arg(newValue, t.String)];
        }
      };

      executeUpdateVarMutation({
        cadence: cadenceCode,
        gasLimit: 9999,
        args
      });

      setVarInputs(prev => ({
        ...prev,
        [workflow.workflowId]: { ...prev[workflow.workflowId], [variableName]: '' }
      }));
    } catch (error) {
      console.error('Error updating variable:', error);
      setStatusMessage({
        type: 'error',
        text: `Failed to update ${formatVarName(variableName)}.`
      });
      throw error;
    }
  };

  const validateVariableValue = (
    workflow: WorkflowInfo,
    varName: string,
    value: string,
    varType: string,
    pendingMap: {[key: string]: string},
    field?: MetadataConfigField
  ): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Value cannot be empty';
    }

    if (varType === 'UInt64') {
      if (!/^\d+$/.test(trimmed)) {
        return 'Enter a whole number';
      }
      if (Number(trimmed) < 0) {
        return 'Value must be positive';
      }
      if (field?.min) {
        const minVal = Number(field.min);
        if (!Number.isNaN(minVal) && Number(trimmed) < minVal) {
          return `Value must be at least ${field.min}`;
        }
      }
      if (field?.max) {
        const maxVal = Number(field.max);
        if (!Number.isNaN(maxVal) && Number(trimmed) > maxVal) {
          return `Value must be at most ${field.max}`;
        }
      }
    }

    if (varType === 'UFix64') {
      if (!/^\d+(\.\d+)?$/.test(trimmed)) {
        return 'Enter a numeric value';
      }
      const num = Number(trimmed);
      if (Number.isNaN(num)) {
        return 'Enter a numeric value';
      }
      if (num < 0) {
        return 'Value must be non-negative';
      }

      if (varName === 'rebalanceThreshold' && num <= 0) {
        return 'Threshold must be greater than 0';
      }

      if (varName === 'executionFrequencySeconds' && num <= 0) {
        return 'Frequency must be greater than 0 seconds';
      }

      if (field?.min) {
        const minVal = Number(field.min);
        if (!Number.isNaN(minVal) && num < minVal) {
          return `Value must be at least ${field.min}`;
        }
      }
      if (field?.max) {
        const maxVal = Number(field.max);
        if (!Number.isNaN(maxVal) && num > maxVal) {
          return `Value must be at most ${field.max}`;
        }
      }

      if (varName === 'flowTargetPercent' || varName === 'usdcTargetPercent') {
        if (num < 0 || num > 1) {
          return 'Percentage must be between 0 and 1';
        }
        const otherKey = varName === 'flowTargetPercent' ? 'usdcTargetPercent' : 'flowTargetPercent';
        const otherValue = pendingMap[otherKey];
        if (!otherValue) {
          return 'Update both Flow and USDC percentages together';
        }
        const otherNum = Number(otherValue);
        if (Number.isNaN(otherNum) || otherNum < 0 || otherNum > 1) {
          return 'Percentages must be between 0 and 1';
        }
        if (Math.abs(num + otherNum - 1) > 0.0001) {
          return 'Flow and USDC percentages must add up to 1.0';
        }
      }
    }

    if (varType === 'Address') {
      if (!/^0x[0-9a-fA-F]{16}$/.test(trimmed)) {
        return 'Enter a valid Flow address (0x + 16 hex characters)';
      }
    }

    if (varType === 'String' && !trimmed.length) {
      return 'Value cannot be empty';
    }

    return null;
  };

  const handleReviewVariableUpdates = (workflow: WorkflowInfo) => {
    const pendingEntries = Object.entries(varInputs[workflow.workflowId] || {}).filter(([, value]) => {
      return typeof value === 'string' && value.trim().length > 0;
    });

    if (pendingEntries.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Enter values for at least one configurable variable.'
      });
      return;
    }

    const pendingMap = pendingEntries.reduce<{[key: string]: string}>((acc, [key, val]) => {
      acc[key] = (val as string).trim();
      return acc;
    }, {});

    const errors: {[key: string]: string} = {};
    for (const [varName, value] of pendingEntries) {
      const varType = updatableVars[workflow.workflowId]?.[varName];
      if (!varType) {
        continue;
      }
      const metaField = getMetadataField(workflow, varName);
      const error = validateVariableValue(workflow, varName, value as string, varType, pendingMap, metaField);
      if (error) {
        errors[varName] = error;
        if (varName === 'flowTargetPercent' || varName === 'usdcTargetPercent') {
          const otherKey = varName === 'flowTargetPercent' ? 'usdcTargetPercent' : 'flowTargetPercent';
          if (!errors[otherKey] && (error.includes('percentages') || error.includes('both'))) {
            errors[otherKey] = error;
          }
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setVarErrors(prev => ({
        ...prev,
        [workflow.workflowId]: {
          ...(prev[workflow.workflowId] || {}),
          ...errors,
        }
      }));
      setStatusMessage({
        type: 'error',
        text: 'Please resolve the highlighted field errors before submitting.'
      });
      return;
    }

    setVarErrors(prev => ({
      ...prev,
      [workflow.workflowId]: {}
    }));

    const changes = pendingEntries.map(([name, value]) => ({
      name,
      value: (value as string).trim(),
      type: updatableVars[workflow.workflowId]?.[name] || 'String'
    }));

    setReviewWorkflow(workflow);
    setReviewChanges(changes);
    setIsReviewModalOpen(true);
  };

  const closeReviewModal = () => {
    setIsReviewModalOpen(false);
    setReviewWorkflow(null);
    setReviewChanges([]);
  };

  const submitVariableUpdates = async () => {
    if (!reviewWorkflow || reviewChanges.length === 0) {
      closeReviewModal();
      return;
    }

    setIsSubmittingChanges(true);
    try {
      for (const change of reviewChanges) {
        await handleUpdateVariable(reviewWorkflow, change.name, change.value, change.type);
      }

      setVarInputs(prev => ({
        ...prev,
        [reviewWorkflow.workflowId]: {}
      }));
      setVarErrors(prev => ({
        ...prev,
        [reviewWorkflow.workflowId]: {}
      }));
      setStatusMessage({
        type: 'success',
        text: 'Workflow configuration updated successfully!'
      });
      closeReviewModal();
    } catch (error) {
      console.error('Failed to submit variable updates:', error);
      setStatusMessage({
        type: 'error',
        text: 'Failed to update configuration.'
      });
    } finally {
      setIsSubmittingChanges(false);
    }
  };

  const openPauseResumeModal = (workflow: WorkflowInfo, isPaused: boolean) => {
    setConfirmState({ type: 'pause', workflow, isPaused });
  };

  const openBurnModal = (workflow: WorkflowInfo) => {
    setConfirmState({ type: 'burn', workflow });
  };

  const openUnlistModal = (workflow: WorkflowInfo) => {
    setUnlistAlsoBurn(false);
    setConfirmState({ type: 'unlist', workflow });
  };

  const closeConfirmModal = () => {
    if (confirmLoading) return;
    setConfirmState(null);
    setUnlistAlsoBurn(false);
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    setConfirmLoading(true);
    try {
      if (confirmState.type === 'pause') {
        await executePauseResume(confirmState.workflow, confirmState.isPaused || false);
      } else if (confirmState.type === 'burn') {
        await executeBurnWorkflow(confirmState.workflow);
      } else if (confirmState.type === 'unlist') {
        await executeRemoveFromRegistry(confirmState.workflow, { burnAfter: unlistAlsoBurn });
      }
      setConfirmState(null);
      setUnlistAlsoBurn(false);
    } catch (error) {
      console.error('Failed to perform confirmation action:', error);
    } finally {
      setConfirmLoading(false);
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors: Record<string, string> = {
      yield: 'bg-green-100 text-green-800',
      dca: 'bg-blue-100 text-blue-800',
      rebalancing: 'bg-purple-100 text-purple-800',
      arbitrage: 'bg-orange-100 text-orange-800',
      lending: 'bg-yellow-100 text-yellow-800',
      liquidation: 'bg-red-100 text-red-800',
      governance: 'bg-indigo-100 text-indigo-800',
      nft: 'bg-pink-100 text-pink-800',
      bridge: 'bg-cyan-100 text-cyan-800',
    };
    return colors[category?.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  if (!userAddress) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>My Workflows</CardTitle>
            <CardDescription>View and manage your created workflows</CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <p className="text-gray-600 mb-4">Connect your wallet to view your workflows</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {statusMessage && (
        <div
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${
            statusMessage.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-inherit/80 hover:text-inherit"
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">My Workflows</h1>
        <p className="text-gray-600">View and manage your created workflows</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Wallet Address</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono">
              {userAddress.slice(0, 8)}...{userAddress.slice(-4)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Workflows Created</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{myCreatedWorkflows.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Workflows You Created</CardTitle>
          <CardDescription>Original workflows you've published to the registry</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCreated ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading your created workflows...</p>
            </div>
          ) : myCreatedWorkflows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">You haven't created any workflows yet</p>
              <Button onClick={() => router.push('/create')}>
                Create Your First Workflow
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {myCreatedWorkflows.map((workflow) => (
                <div
                  key={workflow.workflowId}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold">{workflow.name}</h3>
                        <Badge className={getCategoryBadgeColor(workflow.category)}>
                          {workflow.category}
                        </Badge>
                        {!workflow.isListed && (
                          <Badge variant="outline">Unlisted</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {workflow.description}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-sm">
                    <div>
                      <p className="text-gray-500">Clone Count</p>
                      <p className="font-semibold">{workflow.cloneCount ?? 0} times</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Fork Count</p>
                      <p className="font-semibold">{workflow.forkCount ?? 0} forks</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Type</p>
                      <p className="font-semibold capitalize">{workflow.deploymentType}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Created</p>
                      <p className="font-semibold">
                        {new Date(workflow.createdAt * 1000).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {workflow.parentWorkflowId !== null && workflow.parentWorkflowId !== undefined && (
                    <p className="text-xs text-gray-500 mb-3">
                      Forked from workflow ID {workflow.parentWorkflowId}
                    </p>
                  )}

                  <div className="space-y-2 pt-3 border-t">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`https://gateway.pinata.cloud/ipfs/${workflow.sourceCodeIPFS}`, '_blank')}
                      >
                        View Source
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(workflow.sourceCodeIPFS);
                          setStatusMessage({
                            type: 'success',
                            text: 'IPFS CID copied to clipboard.'
                          });
                        }}
                      >
                        Copy IPFS CID
                      </Button>
                    </div>

                    {updatableVars[workflow.workflowId] && Object.keys(updatableVars[workflow.workflowId]).length > 0 && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setExpandedWorkflowConfig(expandedWorkflowConfig === workflow.workflowId ? null : workflow.workflowId)}
                        >
                          {expandedWorkflowConfig === workflow.workflowId ? 'Hide Configuration' : 'Configure Variables'}
                        </Button>
                        {expandedWorkflowConfig === workflow.workflowId && (
                          <div className="mt-2 p-3 bg-gray-50 rounded text-sm space-y-2">
                            <p className="text-gray-600 font-semibold">Updatable Variables:</p>
                            {Object.entries(updatableVars[workflow.workflowId]).map(([varName, varType]) => {
                              const metaField = getMetadataField(workflow, varName);
                              const label = metaField?.label || formatVarName(varName);
                              const description = metaField?.description;
                              return (
                                <div key={varName} className="border rounded p-2 bg-white">
                                  <label className="text-xs font-semibold text-gray-700 flex flex-col gap-1">
                                    <span>{label}</span>
                                    <span className="text-[11px] font-normal text-gray-500">
                                      Type: {varType}
                                      {metaField?.min ? ` • Min: ${metaField.min}` : ''}
                                      {metaField?.max ? ` • Max: ${metaField.max}` : ''}
                                    </span>
                                  </label>
                                  {description && (
                                    <p className="text-[11px] text-gray-500 mb-1">{description}</p>
                                  )}
                                  <input
                                    type={varType === 'UInt64' ? 'number' : 'text'}
                                    placeholder={`Enter new ${label}`}
                                    className="w-full px-2 py-1 border rounded mb-2 text-sm"
                                    value={varInputs[workflow.workflowId]?.[varName] || ''}
                                    onChange={(e) => {
                                      setVarInputs(prev => ({
                                        ...prev,
                                        [workflow.workflowId]: {
                                          ...prev[workflow.workflowId],
                                          [varName]: e.target.value
                                        }
                                      }));
                                    }}
                                  />
                                  {varErrors[workflow.workflowId]?.[varName] && (
                                    <p className="text-xs text-red-600 mb-2">
                                      {varErrors[workflow.workflowId]?.[varName]}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-full"
                              onClick={() => handleReviewVariableUpdates(workflow)}
                            >
                              Review Changes
                            </Button>
                          </div>
                        )}
                      </>
                    )}

                    {workflow.isListed && (workflow.cloneCount ?? 0) === 0 && (
                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openUnlistModal(workflow)}
                        >
                          Remove from Registry
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={isReviewModalOpen && !!reviewWorkflow}
        onClose={() => {
          if (!isSubmittingChanges) closeReviewModal();
        }}
      >
        <ModalHeader
          title="Review Configuration Updates"
          description={reviewWorkflow ? `Changes for ${reviewWorkflow.name}` : undefined}
          onClose={!isSubmittingChanges ? closeReviewModal : undefined}
        />
        <ModalBody>
          {reviewChanges.length > 0 ? (
            <ul className="divide-y border rounded-md">
              {reviewChanges.map((change) => {
                const label = reviewWorkflow ? getMetadataField(reviewWorkflow, change.name)?.label : null;
                return (
                  <li key={change.name} className="p-3 text-sm space-y-1">
                    <p className="font-medium">{label || formatVarName(change.name)}</p>
                    <p className="text-gray-500">Type: {change.type}</p>
                    <p className="text-gray-700">
                      New Value: <span className="font-mono">{change.value}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">No changes queued.</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={closeReviewModal} disabled={isSubmittingChanges}>
            Cancel
          </Button>
          <Button onClick={submitVariableUpdates} disabled={isSubmittingChanges || reviewChanges.length === 0}>
            {isSubmittingChanges ? 'Applying…' : 'Confirm Updates'}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={!!confirmState}
        onClose={() => {
          if (!confirmLoading) closeConfirmModal();
        }}
      >
        <ModalHeader
          title={
            confirmState?.type === 'pause'
              ? confirmState.isPaused
                ? 'Resume Workflow'
                : 'Pause Workflow'
              : confirmState?.type === 'burn'
              ? 'Burn Contract'
              : 'Remove from Registry'
          }
          onClose={!confirmLoading ? closeConfirmModal : undefined}
        />
        <ModalBody>
          {confirmState?.type === 'pause' && confirmState.workflow && (
            <p className="text-sm text-gray-600">
              {confirmState.isPaused
                ? `Resume automated execution for ${confirmState.workflow.name}.`
                : `Pause automated execution for ${confirmState.workflow.name}. You can resume later.`}
            </p>
          )}
          {confirmState?.type === 'burn' && confirmState.workflow && (
            <p className="text-sm text-gray-600">
              {`Burning "${confirmState.workflow.name}" permanently removes this contract from your account. This cannot be undone.`}
            </p>
          )}
          {confirmState?.type === 'unlist' && confirmState.workflow && (
            <div className="space-y-4 text-sm text-gray-600">
              <p>
                {`Unlisting removes "${confirmState.workflow.name}" from the public registry so others can no longer clone it. You can relist by registering again.`}
              </p>
              <label className="flex items-center gap-3 text-sm text-gray-700">
                <Checkbox
                  checked={unlistAlsoBurn}
                  onCheckedChange={(checked) => setUnlistAlsoBurn(checked === true)}
                  disabled={confirmLoading}
                  id="unlist-also-burn"
                />
                <span>Also burn the contract from my account after unlisting</span>
              </label>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={closeConfirmModal} disabled={confirmLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirmAction} disabled={confirmLoading}>
            {confirmLoading ? 'Working…' : confirmState?.type === 'pause' ? (confirmState.isPaused ? 'Resume' : 'Pause') : confirmState?.type === 'burn' ? 'Burn Contract' : 'Confirm Unlist'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

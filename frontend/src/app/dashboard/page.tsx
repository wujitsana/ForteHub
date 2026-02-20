'use client';

import { useState, useEffect, useMemo, useCallback, type ComponentProps } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkflowInfo, MetadataConfigField } from '@/types/interfaces';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User } from 'lucide-react';
import {
  useFlowCurrentUser,
  useFlowQuery,
  useFlowAccount,
  TransactionButton,
  TransactionDialog,
  useFlowEvents,
  useFlowTransaction,
} from '@onflow/react-sdk';

import {
  normalizeWorkflowInfo,
  metadataToVarMap,
  normalizeCadenceDictionary
} from '@/lib/flowScripts';
import SchedulingControls from '@/components/dashboard/SchedulingControls';
import { Avatar } from '@/components/profile/ProfileAvatar';
import { ListingModal } from '@/components/marketplace/ListingModal';

import { runWorkflowTransaction } from '@/lib/runWorkflowTransaction';
import { createListingTransaction, cancelListingTransaction } from '@/lib/marketplaceTransactions';

const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0X', '0x');

type TransactionConfig = ComponentProps<typeof TransactionButton>['transaction'];

export default function Dashboard() {
  const [myCreatedWorkflows, setMyCreatedWorkflows] = useState<WorkflowInfo[]>([]);
  const [myDeployedWorkflows, setMyDeployedWorkflows] = useState<WorkflowInfo[]>([]);
  const [loadingCreated, setLoadingCreated] = useState(true);
  const [loadingDeployed, setLoadingDeployed] = useState(true);
  const [expandedWorkflowConfig, setExpandedWorkflowConfig] = useState<number | null>(null);
  const [updatableVars, setUpdatableVars] = useState<{ [key: number]: { [key: string]: string } }>({});
  const [varInputs, setVarInputs] = useState<{ [key: number]: { [key: string]: string } }>({});
  const [workflowContractMapping, setWorkflowContractMapping] = useState<{ [key: number]: string }>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'loading'; text: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    type: 'burn' | 'unlist' | 'setPrice' | 'lockClones' | 'list';
    workflow: WorkflowInfo;
  } | null>(null);
  const [unlistAlsoBurn, setUnlistAlsoBurn] = useState(false);
  const [priceInput, setPriceInput] = useState<string>('');
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [varErrors, setVarErrors] = useState<{ [key: number]: { [key: string]: string } }>({});
  const [reviewWorkflow, setReviewWorkflow] = useState<WorkflowInfo | null>(null);
  const [reviewChanges, setReviewChanges] = useState<Array<{ name: string; value: string; type: string }>>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isSubmittingChanges, setIsSubmittingChanges] = useState(false);
  const [varTransaction, setVarTransaction] = useState<TransactionConfig | null>(null);
  const [varTransactionTarget, setVarTransactionTarget] = useState<{ workflowId: number; workflowName: string } | null>(null);
  const [isVarTransactionModalOpen, setIsVarTransactionModalOpen] = useState(false);
  const [isListingModalOpen, setIsListingModalOpen] = useState(false);
  const [selectedWorkflowForListing, setSelectedWorkflowForListing] = useState<WorkflowInfo | null>(null);
  const [transactionDialogTxId, setTransactionDialogTxId] = useState<string | null>(null);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [transactionSuccessMeta, setTransactionSuccessMeta] = useState<{
    type: 'burn' | 'unlist' | 'config' | 'lockClones';
    workflowId?: number;
    workflowName?: string;
  } | null>(null);
  const [walletVaults, setWalletVaults] = useState<Array<{ symbol: string; path: string; balance: string }>>([]);
  const [isVaultsLoading, setIsVaultsLoading] = useState(false);
  const [vaultsError, setVaultsError] = useState<string | null>(null);
  const [updatedParentWorkflowIds, setUpdatedParentWorkflowIds] = useState<Set<string>>(new Set());
  const [isDashboardSetup, setIsDashboardSetup] = useState(true);

  const router = useRouter();

  const { user } = useFlowCurrentUser();
  const isUserLoading = !user; // Approximate loading state
  const userAddress = user?.addr || '';

  const { data: account, isLoading: isAccountLoading } = useFlowAccount({
    address: userAddress || undefined,
    query: {
      enabled: !!userAddress,
      staleTime: 30000
    }
  });

  // Listen for WorkflowMetadataUpdated events for parent workflows
  // Disabled: WebSocket connection issues - will improve in Phase 3
  // useFlowEvents({
  //   eventType: `A.${FORTEHUB_REGISTRY.slice(2)}.ForteHub.WorkflowMetadataUpdated`,
  //   onEvent: useCallback((event: any) => {
  //     // Extract workflowId from event data
  //     const workflowId = event?.data?.workflowId;
  //     if (workflowId) {
  //       // Check if this is a parent workflow (has clones)
  //       const workflowIdStr = workflowId.toString();
  //       setUpdatedParentWorkflowIds(prev => {
  //         const newSet = new Set(prev);
  //         newSet.add(workflowIdStr);
  //         return newSet;
  //       });

  //       // Show notification about parent workflow update
  //       setStatusMessage({
  //         type: 'success',
  //         text: `Parent workflow ${workflowId} has been updated by its creator. Check for new defaults.`
  //       });
  //     }
  //   }, [])
  // });

  const flowVaultBalance = useMemo(() => {
    const flowEntry = walletVaults.find(
      (vault) => vault.symbol?.toUpperCase() === 'FLOW'
    );
    if (!flowEntry) {
      return 0;
    }
    const parsed = parseFloat(flowEntry.balance);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [walletVaults]);
  const flowAccountBalance = useMemo(() => {
    if (!account?.balance) return null;
    const parsed =
      typeof account.balance === 'string'
        ? parseFloat(account.balance)
        : Number(account.balance);
    return Number.isFinite(parsed) ? parsed : null;
  }, [account?.balance]);
  const displayFlowBalance = flowAccountBalance ?? flowVaultBalance;
  const isFlowBalanceLoading =
    !!userAddress &&
    ((flowAccountBalance === null && isAccountLoading) ||
      (flowAccountBalance === null && flowVaultBalance === 0 && isVaultsLoading));
  const nonFlowVaults = useMemo(
    () => walletVaults.filter((vault) => vault.symbol?.toUpperCase() !== 'FLOW'),
    [walletVaults]
  );

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

  const handleTransactionDialogChange = useCallback((open: boolean) => {
    setIsTransactionDialogOpen(open);
    if (!open) {
      setTransactionDialogTxId(null);
      setTransactionSuccessMeta(null);
    }
  }, []);

  // Fetch all created workflows in one query
  const { data: rawCreatedWorkflows = [], isLoading: isLoadingCreated, error: queryError } = useFlowQuery({
    cadence: `
      import ForteHub from ${FORTEHUB_REGISTRY}

      access(all) fun main(creator: Address): [ForteHub.WorkflowInfo?] {
        let ids = ForteHub.getWorkflowsByCreator(creator: creator)
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
      staleTime: 30000
    }
  });

  // Normalize workflows when loaded
  useEffect(() => {
    if (isLoadingCreated) {
      setLoadingCreated(true);
      return;
    }

    if (queryError) {
      console.error('Query error:', queryError);
      setLoadingCreated(false);
      setMyCreatedWorkflows([]);
      return;
    }

    if (Array.isArray(rawCreatedWorkflows) && rawCreatedWorkflows.length > 0) {
      const normalized = rawCreatedWorkflows
        .map((raw: any) => {
          try {
            if (!raw) return null;
            return normalizeWorkflowInfo(raw);
          } catch (error) {
            console.error('Error normalizing workflow:', error);
            return null;
          }
        })
        .filter((w): w is WorkflowInfo => w !== null);

      setMyCreatedWorkflows(normalized);

      // Extract updatable variables and contract mappings from workflow metadata
      normalized.forEach(workflow => {
        if (workflow.metadata && Object.keys(workflow.metadata).length > 0) {
          const registryVars = metadataToVarMap(workflow.metadata);
          if (registryVars && Object.keys(registryVars).length > 0) {
            setUpdatableVars(prev => ({
              ...prev,
              [workflow.workflowId]: registryVars
            }));
          }
        }

        const resolvedContractName = sanitizeContractName(workflow.contractName || '');
        if (resolvedContractName) {
          setWorkflowContractMapping(prev => ({
            ...prev,
            [workflow.workflowId]: resolvedContractName
          }));
        }
      });
    } else {
      setMyCreatedWorkflows([]);
    }

    setLoadingCreated(false);
  }, [isLoadingCreated, (rawCreatedWorkflows as any[])?.length, queryError?.message]);

  // Fetch deployed workflows (clones in user's Manager)
  const { data: rawDeployedWorkflows, isLoading: isLoadingDeployedQuery, error: deployedError, refetch: refetchDeployed } = useFlowQuery({
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
    if (isLoadingDeployedQuery) {
      setLoadingDeployed(true);
      return;
    }

    if (deployedError) {
      console.error('Deployed query error:', deployedError);
      setLoadingDeployed(false);
      // Don't clear workflows here to avoid flashing empty state if it's a transient error
      return;
    }

    // If result is null, it means manager is not setup/linked
    if (rawDeployedWorkflows === null) {
      setIsDashboardSetup(false);
      setMyDeployedWorkflows([]);
      setLoadingDeployed(false);
      return;
    }

    setIsDashboardSetup(true);

    if (Array.isArray(rawDeployedWorkflows) && rawDeployedWorkflows.length > 0) {
      const normalized = rawDeployedWorkflows
        .map((raw: any) => {
          try {
            if (!raw) return null;
            return normalizeWorkflowInfo(raw);
          } catch (error) {
            console.error('Error normalizing deployed workflow:', error);
            return null;
          }
        })
        .filter((w): w is WorkflowInfo => w !== null);

      setMyDeployedWorkflows(normalized);
    } else {
      setMyDeployedWorkflows([]);
    }

    setLoadingDeployed(false);
  }, [isLoadingDeployedQuery, rawDeployedWorkflows, deployedError]);




  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Query wallet vaults using useFlowQuery
  const { data: rawVaults = [], isLoading: isLoadingVaults, error: vaultsQueryError } = useFlowQuery({
    cadence: `
      import FungibleToken from 0x9a0766d93b6608b7

      access(all) fun main(address: Address): [{String: String}] {
        let account = getAccount(address)
        let vaults: [{String: String}] = []

        // Tokens with public balance capability paths
        let tokenConfigs: [{String: String}] = [
          {"symbol": "FLOW", "public": "flowTokenBalance"},
          {"symbol": "USDC", "public": "usdcFlowBalance"},
          {"symbol": "USDCFlow", "public": "usdcFlowBalance"},
          {"symbol": "USDF", "public": "usdfBalance"},
          {"symbol": "stFlow", "public": "stFlowBalance"},
          {"symbol": "ankrFLOW", "public": "ankrFLOWBalance"},
          {"symbol": "MOET", "public": "moetBalance"},
          {"symbol": "WETH", "public": "wethBalance"},
          {"symbol": "WBTC", "public": "wbtcBalance"},
          {"symbol": "cbBTC", "public": "cbBTCBalance"},
          {"symbol": "USDT", "public": "usdtBalance"},
          {"symbol": "fuUSDT", "public": "fuUSDTVaultBalance"},
          {"symbol": "fuDAI", "public": "fuDAIVaultBalance"}
        ]

        for token in tokenConfigs {
          let symbol = token["symbol"]!
          let publicIdentifier = token["public"]!

          let publicPath = PublicPath(identifier: publicIdentifier)
          if publicPath == nil {
            continue
          }

          let capability = account.capabilities.get<&{FungibleToken.Balance}>(publicPath!)
          if !capability.check() {
            continue
          }

          if let balanceRef = capability.borrow() {
            let bal = balanceRef.balance
            if bal > 0.0 {
              vaults.append({
                "symbol": symbol,
                "path": publicPath!.toString(),
                "balance": bal.toString()
              })
            }
          }
        }

        return vaults
      }
    `,
    args: (arg: any, t: any) => [arg(userAddress, t.Address)],
    query: {
      enabled: !!userAddress,
      staleTime: 30000
    }
  });

  // Update wallet vaults state when query data changes
  useEffect(() => {
    if (isLoadingVaults) {
      setIsVaultsLoading(true);
      return;
    }

    const vaults = Array.isArray(rawVaults)
      ? rawVaults.map((item: any) => ({
        symbol: item.symbol || item['symbol'] || 'Unknown',
        path: item.path || item['path'] || '',
        balance: item.balance || item['balance'] || '0.0'
      }))
      : [];

    setWalletVaults(vaults);
    setVaultsError(vaultsQueryError ? 'Unable to load wallet token balances right now.' : null);
    setIsVaultsLoading(false);
  }, [isLoadingVaults]);

  const beginTransactionTracking = (
    txId: string,
    meta: {
      type: 'pause' | 'resume' | 'burn' | 'unlist' | 'config' | 'lockClones';
      workflowId?: number;
      workflowName?: string;
      nextPausedState?: boolean;
    }
  ) => {
    setTransactionDialogTxId(txId);
    setIsTransactionDialogOpen(true);
    // Only set transactionSuccessMeta for types that need success tracking
    if (meta.type === 'burn' || meta.type === 'unlist' || meta.type === 'config' || meta.type === 'lockClones') {
      setTransactionSuccessMeta({
        type: meta.type,
        workflowId: meta.workflowId,
        workflowName: meta.workflowName
      });
    }
  };

  const handleTransactionSuccess = () => {
    if (!transactionSuccessMeta) return;
    const name = transactionSuccessMeta.workflowName || 'Workflow';

    if (transactionSuccessMeta.type === 'burn') {
      setStatusMessage({
        type: 'success',
        text: `${name} contract burned successfully.`
      });
    } else if (transactionSuccessMeta.type === 'unlist') {
      setStatusMessage({
        type: 'success',
        text: `${name} removed from the public registry.`
      });
      if (transactionSuccessMeta.workflowId) {
        setMyCreatedWorkflows(prev =>
          prev.map((wf) =>
            wf.workflowId === transactionSuccessMeta.workflowId
              ? { ...wf, isListed: false }
              : wf
          )
        );
      }
    } else if (transactionSuccessMeta.type === 'lockClones') {
      setStatusMessage({
        type: 'success',
        text: `${name} cloning has been locked.`
      });
      if (transactionSuccessMeta.workflowId) {
        setMyCreatedWorkflows(prev =>
          prev.map((wf) =>
            wf.workflowId === transactionSuccessMeta.workflowId
              ? { ...wf, clonesLocked: true }
              : wf
          )
        );
      }
    } else if (transactionSuccessMeta.type === 'config') {
      setStatusMessage({
        type: 'success',
        text: `${name} configuration updated successfully.`
      });
      if (transactionSuccessMeta.workflowId !== undefined) {
        const workflowId = transactionSuccessMeta.workflowId;
        setVarInputs(prev => ({
          ...prev,
          [workflowId]: {}
        }));
        setVarErrors(prev => ({
          ...prev,
          [workflowId]: {}
        }));
      }
    }

    setTransactionSuccessMeta(null);
  };

  const resolveContractName = (workflow: WorkflowInfo): string => {
    return (
      workflowContractMapping[workflow.workflowId] ||
      sanitizeContractName(workflow.contractName || '') ||
      ''
    );
  };

  const buildBurnTransaction = (workflow: WorkflowInfo): TransactionConfig => {
    if (!userAddress) {
      throw new Error('Please connect your wallet.');
    }
    const contractName = resolveContractName(workflow);
    if (!contractName) {
      throw new Error('Could not find deployed contract. Please refresh and try again.');
    }
    return {
      cadence: `
        transaction(name: String) {
          prepare(signer: auth(RemoveContract) &Account) {
            signer.contracts.remove(name: name)
          }
        }
      `,
      limit: 9999,
      args: (arg: any, t: any) => [arg(contractName, t.String)]
    };
  };

  const buildUnlistTransaction = (workflow: WorkflowInfo, burnAfter: boolean): TransactionConfig => {
    if (!userAddress) {
      throw new Error('Please connect your wallet.');
    }
    const contractName = resolveContractName(workflow);
    if (burnAfter && !contractName) {
      throw new Error('Could not find deployed contract. Please refresh and try again.');
    }

    const cadence = burnAfter
      ? `
        import ForteHub from ${FORTEHUB_REGISTRY}

        transaction(workflowId: UInt64, contractName: String) {
          prepare(signer: auth(Storage, RemoveContract) &Account) {
            ForteHub.setWorkflowListing(workflowId: workflowId, creator: signer.address, isListed: false)
            signer.contracts.remove(name: contractName)
          }
        }
      `
      : `
        import ForteHub from ${FORTEHUB_REGISTRY}

        transaction(workflowId: UInt64) {
          prepare(signer: auth(Storage) &Account) {
            ForteHub.setWorkflowListing(workflowId: workflowId, creator: signer.address, isListed: false)
          }
        }
      `;

    return {
      cadence,
      limit: 9999,
      args: (arg: any, t: any) => {
        const baseArgs = [arg(workflow.workflowId.toString(), t.UInt64)];
        if (burnAfter) {
          baseArgs.push(arg(contractName, t.String));
        }
        return baseArgs;
      }
    };
  };

  const buildSetPriceTransaction = (workflow: WorkflowInfo, newPrice: string): TransactionConfig => {
    if (!userAddress) {
      throw new Error('Please connect your wallet.');
    }

    const priceValue = newPrice.trim() === '' ? null : newPrice;
    const cadence = `
      import ForteHub from ${FORTEHUB_REGISTRY}

      transaction(workflowId: UInt64, creator: Address, newPrice: UFix64?) {
        execute {
          ForteHub.setWorkflowPrice(workflowId: workflowId, creator: creator, newPrice: newPrice)
        }
      }
    `;

    return {
      cadence,
      limit: 9999,
      args: (arg: any, t: any) => [
        arg(workflow.workflowId.toString(), t.UInt64),
        arg(userAddress, t.Address),
        priceValue ? arg(priceValue, t.UFix64) : arg(null, t.Optional(t.UFix64))
      ]
    };
  };

  const buildVariableUpdateTransaction = (
    workflow: WorkflowInfo,
    changes: Array<{ name: string; value: string; type: string }>
  ): TransactionConfig => {
    if (!userAddress) {
      throw new Error('Please connect your wallet.');
    }
    const contractName = resolveContractName(workflow);
    if (!contractName) {
      throw new Error('Could not find deployed contract. Please refresh and try again.');
    }

    const params = changes
      .map((change, index) => `value${index}: ${change.type}`)
      .join(',\n          ');

    const statements = changes
      .map((change, index) => {
        const fn = `update${change.name.charAt(0).toUpperCase() + change.name.slice(1)}`;
        return `            ${contractName}.${fn}(newValue: value${index})`;
      })
      .join('\n');

    const cadence = `
      import ${contractName} from ${userAddress}

      transaction(
          ${params}
      ) {
        execute {
${statements}
        }
      }
    `;

    return {
      cadence,
      limit: 9999,
      args: (arg: any, t: any) =>
        changes.map((change) => {
          if (change.type === 'UFix64') {
            return arg(change.value, t.UFix64);
          }
          if (change.type === 'UInt64') {
            return arg(change.value, t.UInt64);
          }
          if (change.type === 'Address') {
            return arg(change.value, t.Address);
          }
          return arg(change.value, t.String);
        })
    };
  };

  const validateVariableValue = (
    workflow: WorkflowInfo,
    varName: string,
    value: string,
    varType: string,
    pendingMap: { [key: string]: string },
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

    const pendingMap = pendingEntries.reduce<{ [key: string]: string }>((acc, [key, val]) => {
      acc[key] = (val as string).trim();
      return acc;
    }, {});

    const errors: { [key: string]: string } = {};
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

  const submitVariableUpdates = () => {
    if (!reviewWorkflow || reviewChanges.length === 0) {
      closeReviewModal();
      return;
    }

    if (isUserLoading) {
      setStatusMessage({
        type: 'error',
        text: 'Wallet is connecting... Please wait.'
      });
      return;
    }

    setIsSubmittingChanges(true);
    try {
      const transaction = buildVariableUpdateTransaction(reviewWorkflow, reviewChanges);
      setVarTransaction(transaction);
      setVarTransactionTarget({
        workflowId: reviewWorkflow.workflowId,
        workflowName: reviewWorkflow.name
      });
      setIsVarTransactionModalOpen(true);
      setIsReviewModalOpen(false);
    } catch (error) {
      console.error('Failed to submit variable updates:', error);
      setStatusMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to update configuration.'
      });
    } finally {
      setIsSubmittingChanges(false);
    }
  };

  const openBurnModal = (workflow: WorkflowInfo) => {
    if (isUserLoading) {
      setStatusMessage({
        type: 'error',
        text: 'Wallet is connecting... Please wait.'
      });
      return;
    }
    setConfirmState({ type: 'burn', workflow });
  };

  const openUnlistModal = (workflow: WorkflowInfo) => {
    if (isUserLoading) {
      setStatusMessage({
        type: 'error',
        text: 'Wallet is connecting... Please wait.'
      });
      return;
    }
    setUnlistAlsoBurn(false);
    setConfirmState({ type: 'unlist', workflow });
  };

  const openPriceModal = (workflow: WorkflowInfo) => {
    if (isUserLoading) {
      setStatusMessage({
        type: 'error',
        text: 'Wallet is connecting... Please wait.'
      });
      return;
    }
    setPriceInput(workflow.price ? workflow.price.toString() : '');
    setConfirmState({ type: 'setPrice', workflow });
    setIsPriceModalOpen(true);
  };

  const openLockClonesModal = (workflow: WorkflowInfo) => {
    if (isUserLoading) {
      setStatusMessage({
        type: 'error',
        text: 'Wallet is connecting... Please wait.'
      });
      return;
    }
    setConfirmState({ type: 'lockClones', workflow });
  };

  const closeConfirmModal = () => {
    setConfirmState(null);
    setUnlistAlsoBurn(false);
  };

  const closePriceModal = () => {
    setIsPriceModalOpen(false);
    setPriceInput('');
    setConfirmState(null);
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

  const confirmTransactionInfo = (() => {
    if (!confirmState) {
      return {
        transaction: null as TransactionConfig | null,
        meta: null as { type: 'burn' | 'unlist' | 'lockClones'; workflowId?: number; workflowName?: string } | null,
        error: null as string | null
      };
    }
    try {
      if (confirmState.type === 'burn') {
        const transaction = buildBurnTransaction(confirmState.workflow);
        const meta = {
          type: 'burn' as const,
          workflowId: confirmState.workflow.workflowId,
          workflowName: confirmState.workflow.name
        };
        return { transaction, meta, error: null };
      }
      if (confirmState.type === 'unlist') {
        const transaction = buildUnlistTransaction(confirmState.workflow, unlistAlsoBurn);
        const meta = {
          type: 'unlist' as const,
          workflowId: confirmState.workflow.workflowId,
          workflowName: confirmState.workflow.name
        };
        return { transaction, meta, error: null };
      }
      if (confirmState.type === 'lockClones') {
        const transaction = buildLockClonesTransaction(confirmState.workflow);
        const meta = {
          type: 'lockClones' as const,
          workflowId: confirmState.workflow.workflowId,
          workflowName: confirmState.workflow.name
        };
        return { transaction, meta, error: null };
      }
      return { transaction: null, meta: null, error: 'Unsupported action.' };
    } catch (error) {
      return {
        transaction: null,
        meta: null,
        error: error instanceof Error ? error.message : 'Failed to build transaction.'
      };
    }
  })();

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
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${statusMessage.type === 'success'
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

      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">My Workflows</h1>
          <p className="text-gray-600">View and manage your created workflows</p>
        </div>
        <Link href={`/profile/${userAddress}`}>
          <Button variant="outline" className="gap-2">
            <User className="w-4 h-4" />
            View My Portfolio
          </Button>
        </Link>
      </div>

      {/* Profile Card with Avatar */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-3">
              <Avatar address={userAddress} size="md" />
              <Button
                variant="outline"
                size="sm"
                disabled
                title="Image upload coming soon"
                className="opacity-50 cursor-not-allowed"
              >
                Update Image
              </Button>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-2">Wallet Address</p>
              <p className="font-mono text-sm mb-4">{userAddress}</p>
              <p className="text-xs text-gray-500">
                Your generative avatar is created from your wallet address. Custom image upload coming soon.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>FLOW Balance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {isFlowBalanceLoading
                ? 'Loading…'
                : displayFlowBalance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4
                })}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Wallet Token Vaults</CardTitle>
          <CardDescription>Non-FLOW token balances detected in your wallet</CardDescription>
        </CardHeader>
        <CardContent>
          {!userAddress ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Connect your wallet to view token balances.</p>
            </div>
          ) : isVaultsLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Loading wallet vaults...</p>
            </div>
          ) : vaultsError ? (
            <div className="text-center py-8 text-sm text-red-600">{vaultsError}</div>
          ) : nonFlowVaults.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No non-FLOW token vaults with balances detected.</p>
              <p className="text-xs text-gray-500 mt-2">
                Tip: Create vaults by running a ForteHub workflow or using Flow Port.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {nonFlowVaults.map((vault) => {
                const balanceNum = parseFloat(vault.balance);
                const formatted = Number.isFinite(balanceNum)
                  ? balanceNum.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4
                  })
                  : vault.balance;
                return (
                  <div
                    key={`${vault.symbol}-${vault.path}`}
                    className="border rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition"
                  >
                    <p className="font-semibold text-sm">{vault.symbol}</p>
                    <p className="text-lg font-mono text-blue-600 my-1">{formatted}</p>
                    <p className="text-xs text-gray-500 truncate">{vault.path}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="created" className="mb-6">
        <TabsList className="grid grid-cols-2 w-full md:max-w-md mb-4">
          <TabsTrigger value="created">Created</TabsTrigger>
          <TabsTrigger value="cloned">Cloned</TabsTrigger>
        </TabsList>
        <TabsContent value="created">
          <Card>
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
                <div className="text-center py-12 space-y-4">
                  <p className="text-gray-600">You haven't created any workflows yet.</p>
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
                            {workflow.clonesLocked && (
                              <Badge variant="destructive">Cloning Locked</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {workflow.description}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3 text-sm">
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
                        <div>
                          <p className="text-gray-500">Clone Price</p>
                          <p className="font-semibold text-blue-600">
                            {workflow.price === null || workflow.price === undefined || workflow.price === '0'
                              ? 'Free'
                              : `${workflow.price} FLOW`}
                          </p>
                        </div>
                      </div>

                      {workflow.parentWorkflowId !== null && workflow.parentWorkflowId !== undefined && (
                        <p className="text-xs text-gray-500 mb-3">
                          Forked from workflow ID {workflow.parentWorkflowId}
                        </p>
                      )}

                      <div className="pt-3 border-t space-y-3">
                        {/* Scheduling Controls */}
                        <SchedulingControls
                          workflow={workflow}
                          userAddress={userAddress}
                          onStatusMessage={(type, text) => setStatusMessage({ type, text })}
                          onSchedulingChanged={() => {
                            // Trigger re-fetch of workflows to update scheduling status
                          }}
                        />

                        {/* Action Buttons - Compact Layout */}
                        <div className="grid grid-cols-2 gap-2">
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
                            Copy CID
                          </Button>

                          {updatableVars[workflow.workflowId] && Object.keys(updatableVars[workflow.workflowId]).length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setExpandedWorkflowConfig(expandedWorkflowConfig === workflow.workflowId ? null : workflow.workflowId)}
                            >
                              {expandedWorkflowConfig === workflow.workflowId ? 'Hide Config' : 'Config'}
                            </Button>
                          )}

                          {workflow.isListed && (workflow.cloneCount ?? 0) === 0 && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openUnlistModal(workflow)}
                            >
                              Remove
                            </Button>
                          )}


                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPriceModal(workflow)}
                          >
                            Set Price
                          </Button>
                          <Button
                            variant={workflow.clonesLocked ? 'outline' : 'destructive'}
                            size="sm"
                            disabled={workflow.clonesLocked || (workflow.cloneCount ?? 0) === 0}
                            onClick={() => openLockClonesModal(workflow)}
                            title={(workflow.cloneCount ?? 0) === 0 ? 'Locking only available after at least one clone' : undefined}
                          >
                            {workflow.clonesLocked ? 'Cloning Locked' : 'Lock Cloning'}
                          </Button>

                          {myDeployedWorkflows.some(w => w.workflowId === workflow.workflowId) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedWorkflowForListing(workflow);
                                setIsListingModalOpen(true);
                              }}
                            >
                              List for Sale
                            </Button>
                          )}
                        </div>

                        {/* Configuration Section - Only when expanded */}
                        {expandedWorkflowConfig === workflow.workflowId && updatableVars[workflow.workflowId] && Object.keys(updatableVars[workflow.workflowId]).length > 0 && (
                          <div className="p-3 bg-gray-50 rounded text-sm space-y-2">
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="cloned">


          <Card>
            <CardHeader>
              <CardTitle>Workflows You Cloned</CardTitle>
              <CardDescription>Contracts deployed from the community registry</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDeployed ? (
                <div className="text-center py-12">
                  <p className="text-gray-600">Checking your deployed clones...</p>
                </div>
              ) : myDeployedWorkflows.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <p className="text-gray-600">You haven't cloned any workflows yet.</p>
                  <Button variant="outline" onClick={() => router.push('/discover')}>
                    Explore Workflows
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myDeployedWorkflows.map((workflow) => (
                    <div key={workflow.workflowId} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-semibold">{workflow.name}</h3>
                          <p className="text-sm text-gray-600 line-clamp-2">{workflow.description}</p>
                        </div>
                        <Badge className={getCategoryBadgeColor(workflow.category)}>
                          {workflow.category}
                        </Badge>
                      </div>

                      <div className="flex justify-end gap-2">
                        {!workflow.metadata?.isSchedulable && (
                          <TransactionButton
                            className="bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                            label="Run Workflow"
                            transaction={{
                              cadence: runWorkflowTransaction,
                              args: (arg, t) => [arg(workflow.workflowId.toString(), t.UInt64)],
                              limit: 1000
                            }}
                            mutation={{
                              onSuccess: (txId) => {
                                setTransactionDialogTxId(txId);
                                setIsTransactionDialogOpen(true);
                              },
                              onError: (error) => {
                                console.error(error);
                                setStatusMessage({ type: 'error', text: 'Failed to initiate workflow run' });
                              }
                            }}
                          />
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedWorkflowForListing(workflow);
                            setIsListingModalOpen(true);
                          }}
                        >
                          List for Sale
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
        open={isVarTransactionModalOpen && Boolean(varTransaction && varTransactionTarget)}
        onClose={() => {
          setIsVarTransactionModalOpen(false);
          setVarTransaction(null);
          setVarTransactionTarget(null);
          setReviewWorkflow(null);
          setReviewChanges([]);
        }}
      >
        <ModalHeader
          title="Sign Configuration Update"
          description={varTransactionTarget ? `Apply changes to ${varTransactionTarget.workflowName}` : undefined}
          onClose={() => {
            setIsVarTransactionModalOpen(false);
            setVarTransaction(null);
            setVarTransactionTarget(null);
            setReviewWorkflow(null);
            setReviewChanges([]);
          }}
        />
        <ModalBody>
          <p className="text-sm text-gray-600 mb-3">
            This transaction will apply {reviewChanges.length} update{reviewChanges.length === 1 ? '' : 's'} to your workflow.
          </p>
          {reviewChanges.length > 0 && (
            <ul className="text-sm text-gray-700 space-y-1">
              {reviewChanges.map((change) => (
                <li key={change.name} className="flex justify-between gap-3">
                  <span>{formatVarName(change.name)}</span>
                  <span className="font-mono text-xs text-gray-500">{change.value}</span>
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsVarTransactionModalOpen(false);
              setVarTransaction(null);
              setVarTransactionTarget(null);
              setReviewWorkflow(null);
              setReviewChanges([]);
            }}
          >
            Cancel
          </Button>
          {varTransaction && varTransactionTarget ? (
            <TransactionButton
              transaction={varTransaction}
              label="Apply Changes"
              mutation={{
                onSuccess: (txId: string) => {
                  beginTransactionTracking(txId, {
                    type: 'config',
                    workflowId: varTransactionTarget.workflowId,
                    workflowName: varTransactionTarget.workflowName
                  });
                  setIsVarTransactionModalOpen(false);
                  setVarTransaction(null);
                  setVarTransactionTarget(null);
                  setReviewWorkflow(null);
                  setReviewChanges([]);
                },
                onError: (error: Error) => {
                  setStatusMessage({
                    type: 'error',
                    text: `Failed to submit transaction: ${error.message}`
                  });
                }
              }}
            />
          ) : (
            <Button disabled>Apply Changes</Button>
          )}
        </ModalFooter>
      </Modal>

      <Modal
        open={!!confirmState && confirmState.type !== 'setPrice'}
        onClose={closeConfirmModal}
      >
        <ModalHeader
          title={
            confirmState?.type === 'burn'
              ? 'Burn Contract'
              : confirmState?.type === 'lockClones'
                ? 'Lock Cloning'
                : 'Remove from Registry'
          }
          onClose={closeConfirmModal}
        />
        <ModalBody>
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
                  id="unlist-also-burn"
                />
                <span>Also burn the contract from my account after unlisting</span>
              </label>
            </div>
          )}
          {confirmState?.type === 'lockClones' && confirmState.workflow && (
            <p className="text-sm text-gray-600">
              {`Locking cloning for "${confirmState.workflow.name}" permanently prevents new editions. This cannot be undone.`}
            </p>
          )}
          {confirmTransactionInfo.error && (
            <p className="mt-4 text-sm text-red-600">{confirmTransactionInfo.error}</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={closeConfirmModal}>
            Cancel
          </Button>
          {confirmTransactionInfo.transaction && confirmTransactionInfo.meta ? (
            <TransactionButton
              transaction={confirmTransactionInfo.transaction}
              label={
                confirmState?.type === 'burn'
                  ? 'Burn Contract'
                  : confirmState?.type === 'lockClones'
                    ? 'Lock Cloning'
                    : unlistAlsoBurn
                      ? 'Unlist & Burn'
                      : 'Confirm Unlist'
              }
              mutation={{
                onSuccess: (txId: string) => {
                  beginTransactionTracking(txId, confirmTransactionInfo.meta!);
                  closeConfirmModal();
                },
                onError: (error: Error) => {
                  setStatusMessage({
                    type: 'error',
                    text: `Failed to submit transaction: ${error.message}`
                  });
                }
              }}
            />
          ) : (
            <Button disabled>
              {confirmState?.type === 'burn'
                ? 'Burn Contract'
                : confirmState?.type === 'lockClones'
                  ? 'Lock Cloning'
                  : 'Confirm Unlist'}
            </Button>
          )}
        </ModalFooter>
      </Modal>

      <Modal
        open={isPriceModalOpen}
        onClose={() => {
          setIsPriceModalOpen(false);
          setConfirmState(null);
          setPriceInput('');
        }}
      >
        <ModalHeader
          title="Set Clone Price"
          description={confirmState?.workflow.name}
          onClose={() => {
            setIsPriceModalOpen(false);
            setConfirmState(null);
            setPriceInput('');
          }}
        />
        <ModalBody>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Set the price in FLOW that others must pay to clone this workflow.
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
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsPriceModalOpen(false);
              setConfirmState(null);
              setPriceInput('');
            }}
          >
            Cancel
          </Button>
          {confirmState && (
            <TransactionButton
              label="Update Price"
              transaction={{
                cadence: buildSetPriceTransaction(confirmState.workflow, priceInput).cadence,
                args: buildSetPriceTransaction(confirmState.workflow, priceInput).args,
                limit: 1000
              }}
              mutation={{
                onSuccess: (txId) => {
                  setTransactionDialogTxId(txId);
                  setTransactionSuccessMeta({
                    type: 'config',
                    workflowId: confirmState.workflow.workflowId,
                    workflowName: confirmState.workflow.name
                  });
                  setIsTransactionDialogOpen(true);
                  setIsPriceModalOpen(false);
                  setConfirmState(null);
                  setPriceInput('');
                },
                onError: (error) => {
                  console.error(error);
                  setStatusMessage({ type: 'error', text: 'Transaction failed' });
                }
              }}
            />
          )}
        </ModalFooter>

      </Modal>

      <ListingModal
        open={isListingModalOpen}
        onClose={() => {
          setIsListingModalOpen(false);
          setSelectedWorkflowForListing(null);
        }}
        workflow={selectedWorkflowForListing}
        onListingSuccess={(txId) => {
          setStatusMessage({ type: 'success', text: 'Listing created successfully!' });
          setTransactionDialogTxId(txId);
          setIsTransactionDialogOpen(true);
          setIsListingModalOpen(false);
          setSelectedWorkflowForListing(null);
        }}
      />

      <TransactionDialog
        open={isTransactionDialogOpen}
        onOpenChange={handleTransactionDialogChange}
        txId={transactionDialogTxId || undefined}
        pendingTitle="Processing Transaction..."
        pendingDescription="Waiting for Flow to seal the transaction."
        successTitle="Transaction Successful!"
        successDescription="Your transaction has been sealed on the blockchain."
        closeOnSuccess={false}
      />
    </div >
  );
}
const buildLockClonesTransaction = (workflow: WorkflowInfo): TransactionConfig => ({
  cadence: `
      import ForteHub from ${FORTEHUB_REGISTRY}

      transaction(workflowId: UInt64) {
        prepare(signer: auth(Storage) &Account) {
          let managerRef = signer.storage.borrow<&ForteHub.Manager>(
            from: ForteHub.FORTEHUB_MANAGER_STORAGE
          ) ?? panic("ForteHub Manager not initialized")
          managerRef.lockWorkflowClones(workflowId: workflowId)
        }
      }
    `,
  limit: 9999,
  args: (arg: any, t: any) => [arg(workflow.workflowId.toString(), t.UInt64)]
});

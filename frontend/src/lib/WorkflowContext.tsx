'use client';

import React, { createContext, useContext, useState } from 'react';
import { WorkflowInfo } from '@/types/interfaces';

interface WorkflowContextType {
  selectedWorkflow: WorkflowInfo | null;
  setSelectedWorkflow: (workflow: WorkflowInfo | null) => void;
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowInfo | null>(null);

  return (
    <WorkflowContext.Provider value={{ selectedWorkflow, setSelectedWorkflow }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useSelectedWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useSelectedWorkflow must be used within WorkflowProvider');
  }
  return context;
}

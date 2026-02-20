import { useState } from 'react';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { WorkflowInfo } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';

interface WorkflowSelectionModalProps {
    open: boolean;
    onClose: () => void;
    workflows: WorkflowInfo[];
    onSelect: (workflow: WorkflowInfo) => void;
}

export function WorkflowSelectionModal({
    open,
    onClose,
    workflows,
    onSelect
}: WorkflowSelectionModalProps) {
    const [selectedId, setSelectedId] = useState<number | null>(null);

    const handleSelect = () => {
        const workflow = workflows.find(w => w.workflowId === selectedId);
        if (workflow) {
            onSelect(workflow);
            onClose();
        }
    };

    return (
        <Modal open={open} onClose={onClose}>
            <ModalHeader
                title="Select Workflow to List"
                description="Choose a workflow from your collection to list for sale."
                onClose={onClose}
            />
            <ModalBody>
                {workflows.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        You don't have any workflows available to list.
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {workflows.map((workflow) => (
                            <div
                                key={workflow.workflowId}
                                className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedId === workflow.workflowId
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'hover:bg-gray-50'
                                    }`}
                                onClick={() => setSelectedId(workflow.workflowId)}
                            >
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h4 className="font-medium text-sm">{workflow.name}</h4>
                                        <p className="text-xs text-gray-500 line-clamp-1">{workflow.description}</p>
                                    </div>
                                    <Badge variant="outline">{workflow.category}</Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ModalBody>
            <ModalFooter>
                <Button variant="outline" onClick={onClose}>
                    Cancel
                </Button>
                <Button onClick={handleSelect} disabled={selectedId === null}>
                    Continue
                </Button>
            </ModalFooter>
        </Modal>
    );
}

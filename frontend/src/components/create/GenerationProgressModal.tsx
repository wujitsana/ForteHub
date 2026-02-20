'use client';

import { useEffect, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";

interface GenerationProgressModalProps {
  open: boolean;
  providerLabel: string;
  strategy: string;
  extraNote?: string;
  onCancel?: () => void;
}

export function GenerationProgressModal({
  open,
  providerLabel,
  strategy,
  extraNote,
  onCancel,
}: GenerationProgressModalProps) {
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    if (!open) {
      setProgress(12);
      return;
    }

    let current = 12;
    const max = 92;

    const id = setInterval(() => {
      current += Math.floor(Math.random() * 6) + 2;
      if (current >= max) {
        current = max;
        clearInterval(id);
      }
      setProgress(current);
    }, 900);

    return () => clearInterval(id);
  }, [open]);

  const trimmedStrategy = strategy.trim();
  const preview =
    trimmedStrategy.length > 200
      ? `${trimmedStrategy.slice(0, 200)}…`
      : trimmedStrategy;

  return (
    <Modal open={open} onClose={onCancel ?? (() => {})}>
      <ModalHeader
        title={`Generating via ${providerLabel}`}
        description="We’re sending your workflow request to the selected provider."
        onClose={onCancel}
      />
      <ModalBody>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Preparing Cadence contract</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-slate-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                role="progressbar"
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Strategy preview</p>
            <p className="mt-2 whitespace-pre-wrap">{preview || "—"}</p>
          </div>
          <p className="text-xs text-gray-500">
            The generated Cadence contract and metadata will appear once the
            provider responds.
          </p>
          {extraNote && (
            <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-md p-2">
              {extraNote}
            </p>
          )}
          {onCancel && (
            <button
              type="button"
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
              onClick={onCancel}
            >
              Cancel request
            </button>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}

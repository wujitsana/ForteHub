import React from 'react';
import { twMerge } from 'tailwind-merge';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, children, className }: ModalProps) {
  if (!open) return null;

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={handleOverlayClick}
    >
      <div
        className={twMerge(
          'bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-lg',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface ModalHeaderProps {
  title: string;
  description?: string;
  onClose?: () => void;
}

export function ModalHeader({ title, description, onClose }: ModalHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3 border-b border-neutral-200 dark:border-neutral-800">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          aria-label="Close modal"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4 max-h-72 overflow-y-auto">{children}</div>;
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 pb-6 pt-3 flex flex-col sm:flex-row sm:justify-end sm:items-center gap-3 border-t border-neutral-200 dark:border-neutral-800">
      {children}
    </div>
  );
}

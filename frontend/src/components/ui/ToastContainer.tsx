'use client';

/**
 * ToastContainer Component
 *
 * Displays toast notifications at the bottom right of the screen.
 * Automatically manages visibility and dismissal.
 */

import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { toastService, Toast } from '@/services/toast';

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = toastService.subscribe((toast) => {
      setToasts((prev) => {
        const filtered = prev.filter((t) => t.id !== toast.id);
        if (toast.message) {
          return [...filtered, toast];
        }
        return filtered;
      });
    });

    return unsubscribe;
  }, []);

  const getIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getStyles = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getTextColor = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return 'text-green-900';
      case 'error':
        return 'text-red-900';
      case 'warning':
        return 'text-amber-900';
      case 'info':
      default:
        return 'text-blue-900';
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${getStyles(
            toast.type
          )} animate-in fade-in slide-in-from-bottom-4 pointer-events-auto shadow-lg`}
        >
          {getIcon(toast.type)}
          <p className={`text-sm font-medium ${getTextColor(toast.type)}`}>{toast.message}</p>
          <button
            onClick={() => toastService.dismiss(toast.id)}
            className="ml-auto p-1 hover:bg-black hover:bg-opacity-10 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

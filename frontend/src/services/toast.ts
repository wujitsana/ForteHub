/**
 * Toast Notification Service
 *
 * Simple toast notification system without external dependencies.
 * Manages notification queue and auto-dismissal.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastListener {
  (toast: Toast): void;
}

class ToastService {
  private listeners: Set<ToastListener> = new Set();
  private toasts: Map<string, Toast> = new Map();
  private nextId = 0;

  subscribe(listener: ToastListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(toast: Toast) {
    this.toasts.set(toast.id, toast);
    this.listeners.forEach((listener) => listener(toast));
  }

  private remove(id: string) {
    this.toasts.delete(id);
    this.listeners.forEach((listener) => {
      listener({ id, type: 'info', message: '', duration: 0 });
    });
  }

  show(message: string, type: ToastType = 'info', duration = 4000) {
    const id = `toast-${this.nextId++}`;
    const toast: Toast = { id, type, message, duration };

    this.notify(toast);

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }

    return id;
  }

  success(message: string, duration?: number) {
    return this.show(message, 'success', duration);
  }

  error(message: string, duration?: number) {
    return this.show(message, 'error', duration ?? 6000);
  }

  info(message: string, duration?: number) {
    return this.show(message, 'info', duration);
  }

  warning(message: string, duration?: number) {
    return this.show(message, 'warning', duration);
  }

  dismiss(id: string) {
    this.remove(id);
  }

  clear() {
    this.toasts.clear();
  }
}

export const toastService = new ToastService();

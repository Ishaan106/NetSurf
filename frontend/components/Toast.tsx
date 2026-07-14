import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import clsx from 'clsx';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastProps {
    toast: ToastData;
    onDismiss: (id: string) => void;
}

const toastConfig: Record<ToastType, { icon: React.ElementType; bgColor: string; borderColor: string }> = {
    success: { icon: Check, bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30' },
    error: { icon: AlertCircle, bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30' },
    warning: { icon: AlertTriangle, bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/30' },
    info: { icon: Info, bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' },
};

const iconColors: Record<ToastType, string> = {
    success: 'text-emerald-500',
    error: 'text-red-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500',
};

function Toast({ toast, onDismiss }: ToastProps) {
    const config = toastConfig[toast.type];
    const Icon = config.icon;

    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss(toast.id);
        }, toast.duration || 3000);

        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onDismiss]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm',
                config.bgColor,
                config.borderColor,
                'bg-chrome-surface'
            )}
        >
            <Icon className={clsx('w-5 h-5 flex-shrink-0', iconColors[toast.type])} />
            <p className="text-sm text-chrome-text flex-1">{toast.message}</p>
            <button
                onClick={() => onDismiss(toast.id)}
                className="p-1 rounded hover:bg-chrome-surface-hover transition-colors"
            >
                <X className="w-4 h-4 text-chrome-text-secondary" />
            </button>
        </motion.div>
    );
}

// Toast container and hook
let toastListeners: Array<(toasts: ToastData[]) => void> = [];
let toasts: ToastData[] = [];

export function showToast(type: ToastType, message: string, duration?: number) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast: ToastData = { id, type, message, duration };
    toasts = [...toasts, newToast];
    toastListeners.forEach((listener) => listener(toasts));
}

function dismissToast(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
    toastListeners.forEach((listener) => listener(toasts));
}

export function ToastContainer() {
    const [localToasts, setLocalToasts] = useState<ToastData[]>([]);

    useEffect(() => {
        toastListeners.push(setLocalToasts);
        return () => {
            toastListeners = toastListeners.filter((l) => l !== setLocalToasts);
        };
    }, []);

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
            <AnimatePresence>
                {localToasts.map((toast) => (
                    <div key={toast.id} className="pointer-events-auto">
                        <Toast toast={toast} onDismiss={dismissToast} />
                    </div>
                ))}
            </AnimatePresence>
        </div>
    );
}

export default ToastContainer;

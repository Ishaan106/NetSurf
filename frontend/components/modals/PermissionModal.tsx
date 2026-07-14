import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield, Check, X } from 'lucide-react';
import { useUIStore } from '@/store';
import clsx from 'clsx';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
}

export function Modal({ isOpen, onClose, children, title }: ModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className={clsx(
                            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101]',
                            'w-full max-w-md bg-chrome-surface rounded-xl shadow-chrome-xl',
                            'border border-chrome-border overflow-hidden'
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {title && (
                            <div className="flex items-center justify-between px-6 py-4 border-b border-chrome-border">
                                <h2 className="font-semibold text-lg">{title}</h2>
                                <button
                                    className="p-1 rounded hover:bg-chrome-surface-hover"
                                    onClick={onClose}
                                >
                                    <X className="w-5 h-5 text-chrome-text-secondary" />
                                </button>
                            </div>
                        )}
                        {children}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

interface PermissionModalProps {
    permission: string;
    origin: string;
    onAllow: () => void;
    onDeny: () => void;
    onAlwaysAllow?: () => void;
}

export function PermissionModal({
    permission,
    origin,
    onAllow,
    onDeny,
    onAlwaysAllow,
}: PermissionModalProps) {
    const closeModal = useUIStore((s) => s.closeModal);

    return (
        <Modal isOpen onClose={() => { onDeny(); closeModal(); }}>
            <div className="p-6">
                <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-agent-warning/20">
                    <Shield className="w-8 h-8 text-agent-warning" />
                </div>

                <h3 className="text-center text-lg font-semibold mb-2">
                    Permission Request
                </h3>

                <p className="text-center text-sm text-chrome-text-secondary mb-6">
                    <span className="font-medium text-chrome-text">{origin}</span>
                    <br />
                    wants to access your {permission}
                </p>

                <div className="flex flex-col gap-2">
                    <motion.button
                        className={clsx(
                            'w-full py-2.5 rounded-lg font-medium',
                            'bg-chrome-accent text-white hover:bg-chrome-accent-hover'
                        )}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => { onAllow(); closeModal(); }}
                    >
                        <Check className="w-4 h-4 inline-block mr-2" />
                        Allow
                    </motion.button>

                    {onAlwaysAllow && (
                        <motion.button
                            className={clsx(
                                'w-full py-2.5 rounded-lg font-medium',
                                'bg-chrome-surface-hover text-chrome-text hover:bg-chrome-surface-active'
                            )}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => { onAlwaysAllow(); closeModal(); }}
                        >
                            Always Allow
                        </motion.button>
                    )}

                    <motion.button
                        className={clsx(
                            'w-full py-2.5 rounded-lg font-medium',
                            'text-chrome-text-secondary hover:text-chrome-text hover:bg-chrome-surface-hover'
                        )}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => { onDeny(); closeModal(); }}
                    >
                        Deny
                    </motion.button>
                </div>
            </div>
        </Modal>
    );
}

interface AgentApprovalModalProps {
    action: string;
    description: string;
    risk: 'low' | 'medium' | 'high';
    onApprove: () => void;
    onReject: () => void;
}

export function AgentApprovalModal({
    action,
    description,
    risk,
    onApprove,
    onReject,
}: AgentApprovalModalProps) {
    const closeModal = useUIStore((s) => s.closeModal);

    const riskColors = {
        low: 'text-agent-success bg-agent-success/20',
        medium: 'text-agent-warning bg-agent-warning/20',
        high: 'text-agent-error bg-agent-error/20',
    };

    return (
        <Modal isOpen onClose={() => { onReject(); closeModal(); }} title="Agent Action Approval">
            <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className={clsx('p-2 rounded-lg', riskColors[risk])}>
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="font-medium">{action}</p>
                        <p className={clsx('text-xs capitalize', riskColors[risk].split(' ')[0])}>
                            {risk} risk action
                        </p>
                    </div>
                </div>

                <p className="text-sm text-chrome-text-secondary mb-6">
                    {description}
                </p>

                <div className="flex gap-3">
                    <motion.button
                        className={clsx(
                            'flex-1 py-2.5 rounded-lg font-medium',
                            'bg-chrome-surface-hover text-chrome-text hover:bg-chrome-surface-active'
                        )}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => { onReject(); closeModal(); }}
                    >
                        Reject
                    </motion.button>

                    <motion.button
                        className={clsx(
                            'flex-1 py-2.5 rounded-lg font-medium',
                            risk === 'high'
                                ? 'bg-agent-error text-white hover:bg-agent-error/90'
                                : 'bg-agent-success text-white hover:bg-agent-success/90'
                        )}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => { onApprove(); closeModal(); }}
                    >
                        Approve
                    </motion.button>
                </div>
            </div>
        </Modal>
    );
}

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react';
import { useTabStore, useAgentWorkspaceStore } from '@/store';
import clsx from 'clsx';

interface NavButtonProps {
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    label: string;
    isLoading?: boolean;
}

const NavButton = React.memo(function NavButton({
    icon,
    onClick,
    disabled = false,
    label,
    isLoading = false
}: NavButtonProps) {
    return (
        <motion.button
            className={clsx(
                'flex items-center justify-center w-7 h-7 rounded-lg',
                'transition-colors duration-150',
                disabled
                    ? 'text-chrome-text-secondary/40 cursor-not-allowed'
                    : 'text-chrome-text-secondary hover:text-chrome-text hover:bg-chrome-surface-hover'
            )}
            whileHover={disabled ? {} : { scale: 1.05 }}
            whileTap={disabled ? {} : { scale: 0.95 }}
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
        >
            {isLoading ? (
                <motion.div
                    className="flex items-center justify-center"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                    <X className="w-3.5 h-3.5" />
                </motion.div>
            ) : (
                icon
            )}
        </motion.button>
    );
});

export function NavigationControls() {
    const activeTabId = useTabStore((s) => s.activeTabId);
    const tabs = useTabStore((s) => s.tabs);
    const goBack = useTabStore((s) => s.goBack);
    const goForward = useTabStore((s) => s.goForward);
    const reload = useTabStore((s) => s.reload);
    const stop = useTabStore((s) => s.stop);

    const workspaceWebviews = useAgentWorkspaceStore((s) => s.webviews);
    const workspaceFocusedId = useAgentWorkspaceStore((s) => s.focusedId);

    const activeTab = tabs.find((t) => t.id === activeTabId);
    const isWorkspace = Boolean(activeTab?.url?.startsWith('workspace:'));
    const focusedWorkspaceWebview = isWorkspace
        ? (workspaceWebviews.find(w => w.id === workspaceFocusedId) || workspaceWebviews[0] || null)
        : null;

    const canGoBack = isWorkspace ? (focusedWorkspaceWebview?.canGoBack ?? false) : (activeTab?.canGoBack ?? false);
    const canGoForward = isWorkspace ? (focusedWorkspaceWebview?.canGoForward ?? false) : (activeTab?.canGoForward ?? false);
    const isLoading = isWorkspace ? (focusedWorkspaceWebview?.isLoading ?? false) : (activeTab?.isLoading ?? false);

    const dispatchWorkspaceNav = (eventName: string) => {
        const id = focusedWorkspaceWebview?.id;
        if (!id) return;
        window.dispatchEvent(new CustomEvent(eventName, { detail: { webviewId: id } }));
    };

    const handleBack = () => {
        if (isWorkspace) {
            if (canGoBack) dispatchWorkspaceNav('agent-webview-go-back');
            return;
        }
        if (activeTabId && canGoBack) {
            goBack(activeTabId);
        }
    };

    const handleForward = () => {
        if (isWorkspace) {
            if (canGoForward) dispatchWorkspaceNav('agent-webview-go-forward');
            return;
        }
        if (activeTabId && canGoForward) {
            goForward(activeTabId);
        }
    };

    const handleReload = () => {
        if (activeTabId) {
            if (isWorkspace) {
                dispatchWorkspaceNav(isLoading ? 'agent-webview-stop' : 'agent-webview-reload');
                return;
            }
            if (isLoading) stop(activeTabId);
            else reload(activeTabId);
        }
    };

    return (
        <div className="flex items-center gap-0.5 px-1">
            <NavButton
                icon={<ArrowLeft className="w-3.5 h-3.5" />}
                onClick={handleBack}
                disabled={!canGoBack}
                label="Go back"
            />
            <NavButton
                icon={<ArrowRight className="w-3.5 h-3.5" />}
                onClick={handleForward}
                disabled={!canGoForward}
                label="Go forward"
            />
            <NavButton
                icon={isLoading ? <X className="w-3.5 h-3.5" /> : <RotateCw className="w-3.5 h-3.5" />}
                onClick={handleReload}
                label={isLoading ? 'Stop loading' : 'Reload'}
                isLoading={isLoading}
            />
        </div>
    );
}

export default NavigationControls;

/**
 * WorkspaceRow — One workspace section in the sidebar.
 * Shows the workspace header (icon + name + tab count) and its open tabs list.
 * Auto-expands when the workspace is active.
 */

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import clsx from 'clsx';
import { WorkspaceIcon } from './WorkspaceIcon';
import { SidebarTabItem } from './SidebarTabItem';
import type { Workspace } from '@/store/settingsStore';
import type { Tab } from '@/store/tabStore';

interface Props {
    workspace: Workspace;
    tabs: Tab[];
    activeTabId: string | null;
    isActive: boolean;
    adblockEnabled: boolean;
    onActivate: () => void;
    onTabSelect: (id: string) => void;
    onTabClose: (e: React.MouseEvent, id: string) => void;
    onAddTab: () => void;
    onToggleAdblock: () => void;
}

export function WorkspaceRow({
    workspace, tabs, activeTabId, isActive,
    adblockEnabled, onActivate, onTabSelect, onTabClose, onAddTab, onToggleAdblock,
}: Props) {
    const [expanded, setExpanded] = useState(isActive);
    useEffect(() => { if (isActive) setExpanded(true); }, [isActive]);

    const tabCount = tabs.length;

    return (
        <div className="space-y-0.5">
            {/* Workspace header */}
            <button
                onClick={() => { onActivate(); setExpanded(true); }}
                className={clsx(
                    'group flex min-h-[32px] w-full items-center gap-2 rounded-xl px-2 transition-all duration-150 border',
                    isActive
                        ? 'border-chrome-border-strong bg-chrome-accent-light font-semibold text-chrome-text shadow-sm'
                        : 'border-transparent font-medium text-chrome-text-muted hover:bg-chrome-surface-hover hover:text-chrome-text',
                )}
            >
                <WorkspaceIcon workspace={workspace} active={isActive} />

                <span className="flex-1 truncate text-[12.5px]">{workspace.name}</span>

                {/* Ad blocker toggle */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleAdblock(); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all"
                    title={adblockEnabled ? 'Ad blocker ON' : 'Ad blocker OFF'}
                >
                    {adblockEnabled
                        ? <ShieldCheck className="h-3 w-3 text-green-500" />
                        : <ShieldOff className="h-3 w-3 text-chrome-text-muted/40" />
                    }
                </button>

                {/* Tab count badge */}
                {tabCount > 0 && (
                    <span className={clsx(
                        'shrink-0 min-w-[16px] rounded-full px-1 py-px text-center text-[9px] font-bold',
                        isActive
                            ? 'bg-chrome-surface-soft text-chrome-accent'
                            : 'bg-chrome-border text-chrome-text-muted',
                    )}>
                        {tabCount}
                    </span>
                )}

                {/* Expand toggle */}
                {tabCount > 0 && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                        className="shrink-0 p-0.5 rounded hover:bg-chrome-surface-active transition-colors"
                    >
                        <ChevronDown className={clsx(
                            'h-3 w-3 text-chrome-text-muted/40 transition-transform',
                            expanded && 'rotate-180',
                        )} />
                    </button>
                )}
            </button>

            {/* Tab list */}
            <AnimatePresence>
                {expanded && tabCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.12 }}
                        className="ml-4 overflow-hidden border-l border-chrome-border pl-2 space-y-0.5"
                    >
                        <AnimatePresence mode="popLayout">
                            {tabs.map(tab => (
                                <SidebarTabItem
                                    key={tab.id}
                                    tab={tab}
                                    isActive={tab.id === activeTabId}
                                    onSelect={() => onTabSelect(tab.id)}
                                    onClose={(e) => onTabClose(e, tab.id)}
                                />
                            ))}
                        </AnimatePresence>

                        <button
                            onClick={onAddTab}
                            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] text-chrome-text-muted/40 hover:text-chrome-text-muted hover:bg-chrome-surface-hover transition-colors"
                        >
                            <Plus className="h-3 w-3" />
                            <span>New tab</span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Trash2, ExternalLink, Search, Globe } from 'lucide-react';
import clsx from 'clsx';
import { useUIStore } from '@/store/uiStore';
import { useTabStore } from '@/store/tabStore';
import { useHistoryStore } from '@/store/historyStore';
import { useSettingsStore, type Workspace } from '@/store/settingsStore';

export function HistoryPanel() {
    const isPanelOpen = useUIStore((s) => s.isPanelOpen);
    const activePanel = useUIStore((s) => s.activePanel);
    const closePanel = useUIStore((s) => s.closePanel);

    const addTab = useTabStore((s) => s.addTab);
    const activeWorkspaceId = useSettingsStore(s => s.activeWorkspaceId);
    const activeWorkspace = useSettingsStore(s => s.workspaces.find((w: Workspace) => w.id === s.activeWorkspaceId));

    const searchWorkspaceHistory = useHistoryStore((s) => s.searchWorkspaceHistory);
    const clearWorkspaceHistory = useHistoryStore((s) => s.clearWorkspaceHistory);
    const removeEntry = useHistoryStore((s) => s.removeEntry);
    // Subscribe to entries so we re-render on changes
    const _entries = useHistoryStore((s) => s.entries);

    const [searchQuery, setSearchQuery] = React.useState('');

    const historyEntries = useMemo(() => {
        return searchWorkspaceHistory(activeWorkspaceId, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_entries, activeWorkspaceId, searchQuery, searchWorkspaceHistory]);

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    };

    // Group by day
    const groupedEntries = useMemo(() => {
        const groups: Record<string, typeof historyEntries> = {};
        for (const entry of historyEntries) {
            const date = new Date(entry.timestamp);
            const now = new Date();
            const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
            let label = '';
            if (diffDays === 0) label = 'Today';
            else if (diffDays === 1) label = 'Yesterday';
            else if (diffDays < 7) label = date.toLocaleDateString('en-US', { weekday: 'long' });
            else label = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

            if (!groups[label]) groups[label] = [];
            groups[label].push(entry);
        }
        return Object.entries(groups);
    }, [historyEntries]);

    const handleOpenUrl = (url: string) => {
        addTab(url, activeWorkspaceId);
        closePanel();
    };

    const isVisible = isPanelOpen && activePanel === 'history';

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={{ type: 'tween', duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className={clsx(
                        'absolute top-0 right-0 h-full z-50',
                        'w-[380px] max-w-[90vw]',
                        'flex flex-col',
                    )}
                    style={{
                        background: 'var(--chrome-surface-solid)',
                        borderLeft: '1px solid var(--chrome-border)',
                        boxShadow: 'var(--shadow-xl)',
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-chrome-border">
                        <div className="flex items-center gap-2.5">
                            <Clock className="w-4 h-4 text-chrome-accent" />
                            <div>
                                <h2 className="text-sm font-bold text-chrome-text">History</h2>
                                {activeWorkspace && (
                                    <p className="text-[10px] text-chrome-text-secondary">{activeWorkspace.name} workspace</p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={closePanel}
                            className="p-1.5 rounded-lg hover:bg-chrome-surface-hover transition-colors text-chrome-text-secondary hover:text-chrome-text"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="px-3 py-2.5 border-b border-chrome-border">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-chrome-text-secondary/50 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search history..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-4 py-1.5 rounded-lg bg-chrome-surface-hover text-chrome-text text-xs placeholder-chrome-text-secondary/50 border border-chrome-border focus:border-chrome-accent focus:bg-chrome-surface-solid outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* History List */}
                    <div className="flex-1 overflow-y-auto">
                        {historyEntries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-chrome-text-secondary gap-3">
                                <Clock className="w-10 h-10 opacity-30" />
                                <div className="text-center">
                                    <p className="text-sm font-medium">
                                        {searchQuery ? 'No results found' : 'No history yet'}
                                    </p>
                                    <p className="text-xs text-chrome-text-muted mt-1">
                                        {searchQuery ? 'Try a different search term' : 'Start browsing to build history'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="py-2">
                                {groupedEntries.map(([label, entries]) => (
                                    <div key={label}>
                                        <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-chrome-text-secondary/50 sticky top-0 bg-chrome-surface-solid">
                                            {label}
                                        </div>
                                        {entries.map((entry) => (
                                            <motion.div
                                                key={entry.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="group px-3 py-2 hover:bg-chrome-surface-hover cursor-pointer transition-colors"
                                                onClick={() => handleOpenUrl(entry.url)}
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    {/* Favicon */}
                                                    <div className="flex-shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center">
                                                        {entry.favicon ? (
                                                            <img
                                                                src={entry.favicon}
                                                                alt=""
                                                                className="w-4 h-4 rounded-sm object-contain"
                                                                onError={(e) => {
                                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                                }}
                                                            />
                                                        ) : (
                                                            <Globe className="w-3.5 h-3.5 text-chrome-text-secondary/40" />
                                                        )}
                                                    </div>

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium text-chrome-text truncate leading-tight">
                                                            {entry.title || entry.url}
                                                        </p>
                                                        <p className="text-[10px] text-chrome-text-muted truncate mt-0.5">
                                                            {entry.url}
                                                        </p>
                                                    </div>

                                                    {/* Timestamp + actions */}
                                                    <div className="flex-shrink-0 flex items-center gap-1">
                                                        <span className="text-[10px] text-chrome-text-muted group-hover:hidden">
                                                            {formatTimestamp(entry.timestamp)}
                                                        </span>
                                                        <button
                                                            className="hidden group-hover:flex p-0.5 rounded hover:bg-chrome-surface-active transition-colors"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeEntry(entry.id);
                                                            }}
                                                            title="Remove from history"
                                                        >
                                                            <X className="w-3 h-3 text-chrome-text-secondary" />
                                                        </button>
                                                        <ExternalLink className="hidden group-hover:block w-3 h-3 text-chrome-text-secondary" />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-3 py-2.5 border-t border-chrome-border flex items-center justify-between">
                        <span className="text-[10px] text-chrome-text-muted">
                            {historyEntries.length} {historyEntries.length === 1 ? 'entry' : 'entries'}
                        </span>
                        <button
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-chrome-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            onClick={() => clearWorkspaceHistory(activeWorkspaceId)}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Clear workspace history
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default HistoryPanel;

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Globe, Moon, PanelLeftOpen, Plus, Sun } from 'lucide-react';
import clsx from 'clsx';
import { WorkspaceIcon } from './WorkspaceIcon';
import { useSettingsStore } from '@/store/settingsStore';
import { useTabStore } from '@/store/tabStore';
import { useTheme } from '@/theme';
import type { Tab } from '@/store/tabStore';
import { isMacOS } from '@/utils/helpers';

function CollapsedFavicon({ tab, active }: { tab: Tab; active?: boolean }) {
    const [err, setErr] = useState(false);
    return (
        <span
            className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-all duration-300 shadow-sm",
                active 
                    ? "bg-chrome-accent/20 text-chrome-accent" 
                    : "bg-white/5 hover:bg-white/10 text-chrome-text-muted"
            )}
            title={tab.title || tab.url}
        >
            {tab.favicon && !err ? (
                <img
                    src={tab.favicon}
                    alt=""
                    className="h-4 w-4 rounded-sm object-contain"
                    onError={() => setErr(true)}
                />
            ) : (
                <Globe className="h-3.5 w-3.5 opacity-40" />
            )}
        </span>
    );
}

interface Props {
    onExpand: () => void;
}

export function CollapsedSidebar({ onExpand }: Props) {
    const workspaces = useSettingsStore(s => s.workspaces);
    const activeWorkspaceId = useSettingsStore(s => s.activeWorkspaceId);
    const setActiveWorkspaceId = useSettingsStore(s => s.setActiveWorkspaceId);
    
    const tabs = useTabStore(s => s.tabs);
    const activeTabId = useTabStore(s => s.activeTabId);
    const setActiveTab = useTabStore(s => s.setActiveTab);
    const addTab = useTabStore(s => s.addTab);
    
    const { theme, toggleTheme } = useTheme();
    const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

    const activeWsTabs = tabs.filter(t => (t.workspaceId || 'work') === activeWorkspaceId);
    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

    return (
        <motion.aside
            key="collapsed"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 52, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={clsx(
                "relative z-30 flex shrink-0 flex-col items-center overflow-hidden pb-3",
                isMacOS() ? "pt-[30px]" : "pt-[6px]"
            )}
            style={{ backgroundColor: 'var(--sidebar-bg)', backdropFilter: 'blur(var(--sidebar-blur))' }}
        >
            {/* Workspace thematic tint overlay */}
            {activeWorkspace?.color && (
                <div 
                    className="absolute inset-0 z-0 pointer-events-none transition-all duration-300 opacity-[0.08] dark:opacity-[0.05]"
                    style={{
                        background: activeWorkspace.color
                    }}
                />
            )}

            {/* Top Area: Sidebar control button & Active Workspace Dropdown trigger */}
            <div className="flex flex-col items-center gap-2.5 w-full shrink-0 mb-3 px-1 z-50">
                <button
                    onClick={onExpand}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-chrome-text-muted hover:bg-chrome-surface-hover hover:text-chrome-text transition-colors shrink-0"
                    title="Expand sidebar"
                >
                    <PanelLeftOpen className="h-4 w-4" />
                </button>

                {/* Collapsed Workspace Switcher Trigger */}
                <div className="relative flex items-center justify-center w-full">
                    <button
                        onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                        className="relative flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm border border-chrome-border-strong"
                        style={{ background: activeWorkspace?.color || 'var(--chrome-accent)' }}
                        title={`Switch workspace (Current: ${activeWorkspace?.name})`}
                    >
                        <WorkspaceIcon workspace={activeWorkspace} size="sm" active={true} />
                        <ChevronDown className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-white bg-black/40 rounded-full p-px" />
                    </button>

                    {isWorkspaceMenuOpen && (
                        <>
                            <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setIsWorkspaceMenuOpen(false)}
                            />
                            <div 
                                className={clsx(
                                    "absolute z-50 min-w-[170px] rounded-xl bg-chrome-surface-solid border border-chrome-border shadow-xl p-1.5 animate-in fade-in slide-in-from-top-1 duration-100",
                                    isMacOS() ? "left-[44px] top-0" : "left-[44px] top-0"
                                )}
                            >
                                {workspaces.map((ws) => (
                                    <button
                                        key={ws.id}
                                        onClick={() => {
                                            setActiveWorkspaceId(ws.id);
                                            setIsWorkspaceMenuOpen(false);
                                            const wsTabs = tabs.filter(t => (t.workspaceId || 'work') === ws.id);
                                            const first = wsTabs[0];
                                            if (first) setActiveTab(first.id);
                                        }}
                                        className={clsx(
                                            "flex w-full items-center gap-2 px-2.5 py-1.5 text-[12.5px] rounded-lg transition-colors text-left",
                                            ws.id === activeWorkspaceId
                                                ? "bg-chrome-surface-active text-chrome-text font-semibold"
                                                : "text-chrome-text-secondary hover:bg-black/5 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <span 
                                            className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                                            style={{ background: ws.color }}
                                        />
                                        {ws.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Subtle Divider */}
            <div className="w-8 h-px bg-chrome-border my-2 shrink-0" />

            {/* Open tabs favicons for active workspace only */}
            <div className="flex-1 w-full overflow-y-auto scrollbar-none flex flex-col items-center gap-2 px-1">
                {activeWsTabs.map(tab => {
                    const isActive = tab.id === activeTabId;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                "relative flex items-center justify-center transition-all duration-300 shrink-0",
                                isActive ? "scale-105" : "hover:scale-102"
                            )}
                            title={tab.title || tab.url}
                        >
                            <CollapsedFavicon tab={tab} active={isActive} />
                        </button>
                    );
                })}
                
                {/* Plus button to add tab in active workspace */}
                <button
                    onClick={() => addTab('about:blank', activeWorkspaceId)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-dashed border-chrome-border text-chrome-text-muted hover:border-chrome-text-muted hover:text-chrome-text hover:bg-white/5 transition-all mt-1"
                    title="New Tab"
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Theme toggle */}
            <button
                onClick={toggleTheme}
                className="mt-3 flex h-8 w-8 items-center justify-center rounded-xl text-chrome-text-muted hover:bg-chrome-surface-hover transition-colors shrink-0"
            >
                {theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </button>
        </motion.aside>
    );
}

export default CollapsedSidebar;

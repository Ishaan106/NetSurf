import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Plus, Sun, ChevronDown, Folder, PanelLeftClose, PanelLeftOpen, Globe } from 'lucide-react';
import clsx from 'clsx';

import { useTabStore, type Tab } from '@/store/tabStore';
import {
    useSettingsStore,
    type Workspace,
    type SettingsStore,
} from '@/store/settingsStore';
import { useUIStore, type UIStore } from '@/store/uiStore';
import { useTheme } from '@/theme';
import { isMacOS } from '@/utils/helpers';
import { SidebarTabItem } from '@/features/sidebar/SidebarTabItem';

// ── Gradient color presets for new workspaces ─────────────────────────────
const WS_COLORS = [
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

function CollapsedFavicon({ tab, active }: { tab: Tab; active?: boolean }) {
    const [err, setErr] = useState(false);
    return (
        <span
            className={clsx(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-300 shadow-sm border",
                active 
                    ? "bg-chrome-accent/15 text-chrome-accent border-chrome-accent/25" 
                    : "bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] border-black/[0.04] dark:border-white/[0.04] text-chrome-text-secondary"
            )}
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

// ── Main component ─────────────────────────────────────────────────────────
export function WorkspaceSidebar() {
    const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
    // Tab store
    const tabs = useTabStore((s) => s.tabs);
    const activeTabId = useTabStore((s) => s.activeTabId);
    const addTab = useTabStore((s) => s.addTab);
    const setActiveTab = useTabStore((s) => s.setActiveTab);
    const closeTab = useTabStore((s) => s.closeTab);

    // Settings store — each selector is explicitly typed
    const workspaces = useSettingsStore((s: SettingsStore) => s.workspaces);
    const activeWorkspaceId = useSettingsStore((s: SettingsStore) => s.activeWorkspaceId);
    const isSidebarCollapsed = useSettingsStore((s: SettingsStore) => s.isSidebarCollapsed);
    const setActiveWorkspaceId = useSettingsStore((s: SettingsStore) => s.setActiveWorkspaceId);
    const addWorkspace = useSettingsStore((s: SettingsStore) => s.addWorkspace);
    const toggleSidebar = useSettingsStore((s: SettingsStore) => s.toggleSidebar);

    // UI store
    const toggleSettings = useUIStore((s: UIStore) => s.toggleSettings);

    const { theme, toggleTheme } = useTheme();

    // ── Handlers ──────────────────────────────────────────────────────────
    const activateWorkspace = (wsId: string) => {
        setActiveWorkspaceId(wsId);
        const first = tabs.find((t: Tab) => (t.workspaceId ?? 'work') === wsId);
        if (first) setActiveTab(first.id);
        else addTab('about:blank', wsId);
    };

    const handleTabClose = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        closeTab(tabId);
    };

    const handleAddWorkspace = () => {
        const id = `ws-${Date.now()}`;
        addWorkspace({
            id,
            name: `Workspace ${workspaces.length + 1}`,
            color: WS_COLORS[workspaces.length % WS_COLORS.length],
            icon: 'Folder',
        });
        setActiveWorkspaceId(id);
        addTab('about:blank', id);
    };

    // ── Workspace-scoped tab count for footer label ───────────────────────
    const activeWsTabs = tabs.filter((t: Tab) => (t.workspaceId ?? 'work') === activeWorkspaceId);
    const activeWS = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

    const openPinnedApp = (url: string) => {
        const existing = tabs.find(t => t.url.includes(url) && (t.workspaceId ?? 'work') === activeWorkspaceId);
        if (existing) {
            setActiveTab(existing.id);
        } else {
            addTab(`https://${url}`, activeWorkspaceId);
        }
    };

    return (
        <motion.aside
            key="sidebar"
            animate={{ width: isSidebarCollapsed ? 52 : 'var(--workspace-rail-width)', opacity: 1 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative z-30 flex shrink-0 flex-col overflow-x-visible text-chrome-text"
            style={{
                backgroundColor: 'var(--sidebar-bg)',
                backdropFilter: 'blur(var(--sidebar-blur))',
                WebkitBackdropFilter: 'blur(var(--sidebar-blur))',
            }}
        >
            {/* ── Workspace Dropdown Selector ─ unified top row, same height as main toolbar ── */}
            <div 
                className={clsx(
                    "relative px-3 shrink-0 z-50 flex items-center gap-2",
                    isMacOS() ? "pt-[30px] h-[74px]" : "h-[44px]",
                    isSidebarCollapsed && "rounded-r-xl shadow-md"
                )}
                style={{ 
                    WebkitAppRegion: 'drag',
                    width: '260px', // Keep header width fixed so it doesn't wrap or clip when sidebar is collapsed!
                    backgroundColor: isSidebarCollapsed ? 'var(--sidebar-bg)' : 'transparent',
                    backdropFilter: isSidebarCollapsed ? 'blur(var(--sidebar-blur))' : 'none',
                    WebkitBackdropFilter: isSidebarCollapsed ? 'blur(var(--sidebar-blur))' : 'none',
                } as React.CSSProperties}
            >
                {/* Sidebar Toggle Button */}
                <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="relative z-10">
                    <button
                        onClick={toggleSidebar}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-chrome-text-secondary hover:text-chrome-text hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-95 select-none"
                        title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {isSidebarCollapsed ? (
                            <PanelLeftOpen className="h-3.5 w-3.5" />
                        ) : (
                            <PanelLeftClose className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>

                {/* Unified Logo and Dropdown */}
                <div 
                    className="flex items-center gap-1.5 relative z-10"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    <img src="/netsurf.png" alt="NetSurf" className="h-5 w-5 object-contain select-none pointer-events-none" />
                    <button
                        onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[12px] font-semibold text-white transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98] select-none"
                        style={{ background: activeWS?.color || 'var(--chrome-accent)' }}
                    >
                        <span>{activeWS?.name || 'Workspace'}</span>
                        <ChevronDown className="h-3.5 w-3.5 text-white/80" />
                    </button>
                </div>

                {isWorkspaceMenuOpen && (
                    <>
                        <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setIsWorkspaceMenuOpen(false)}
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        />
                        <div 
                            className={clsx(
                                "absolute z-50 min-w-[170px] rounded-xl bg-chrome-surface-solid border border-chrome-border shadow-xl p-1.5 animate-in fade-in slide-in-from-top-1 duration-100",
                                isMacOS() ? "left-[38px] top-[68px]" : "left-[38px] top-10"
                            )}
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        >
                            {workspaces.map((ws: Workspace) => (
                                <button
                                    key={ws.id}
                                    onClick={() => {
                                        activateWorkspace(ws.id);
                                        setIsWorkspaceMenuOpen(false);
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
                            <div className="my-1 border-t border-chrome-border" />
                            <button
                                onClick={() => {
                                    handleAddWorkspace();
                                    setIsWorkspaceMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-chrome-text-muted hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-left"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Create Workspace</span>
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* ── Pinned Apps Rail ────────────────── */}
            {!isSidebarCollapsed && (
                <>
                    <div className="px-3.5 py-2 shrink-0 select-none">
                        <div className="grid grid-cols-3 gap-2 bg-chrome-surface-soft p-1 rounded-xl border border-chrome-border">
                            <button
                                onClick={() => openPinnedApp('mail.google.com')}
                                className="aspect-square flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-white/10 hover:shadow-sm transition-all p-1"
                                title="Gmail"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" fill="#F4F4F4" />
                                    <path d="M22 6V8.5L12 14.5L2 8.5V6L12 12L22 6Z" fill="#EA4335" />
                                    <path d="M2 8.5V18C2 19.1 2.9 20 4 20H6V11L2 8.5Z" fill="#4285F4" />
                                    <path d="M22 8.5V18C22 19.1 21.1 20 20 20H18V11L22 8.5Z" fill="#34A853" />
                                    <path d="M18 20H6V13L12 16.5L18 13V20Z" fill="#FBBC05" />
                                </svg>
                            </button>
                            <button
                                onClick={() => openPinnedApp('calendar.google.com')}
                                className="aspect-square flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-white/10 hover:shadow-sm transition-all p-1"
                                title="Google Calendar"
                            >
                                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect width="24" height="24" rx="5" fill="#4285F4" />
                                    <rect x="3" y="6" width="18" height="15" rx="2" fill="white" />
                                    <path d="M3 6H21V10H3V6Z" fill="#1A73E8" />
                                    <text x="12" y="17.5" fill="#1A73E8" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">20</text>
                                </svg>
                            </button>
                            <button
                                onClick={() => openPinnedApp('figma.com')}
                                className="aspect-square flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-white/10 hover:shadow-sm transition-all p-1"
                                title="Figma"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2C10.3 2 9 3.3 9 5C9 6.7 10.3 8 12 8C13.7 8 15 6.7 15 5C15 3.3 13.7 2 12 2Z" fill="#19B5FE" />
                                    <path d="M6 12C6 10.3 7.3 9 9 9H12V15H9C7.3 15 6 13.7 6 12Z" fill="#A259FF" />
                                    <path d="M6 5C6 3.3 7.3 2 9 2C10.7 2 12 3.3 12 5V8H9C7.3 8 6 6.7 6 5Z" fill="#F24E1E" />
                                    <path d="M12 9C12 10.7 13.3 12 15 12C16.7 12 18 10.7 18 9C18 7.3 16.7 6 15 6H12V9Z" fill="#FF7262" />
                                    <path d="M12 16C12 17.7 10.7 19 9 19C7.3 19 6 17.7 6 16C6 14.3 7.3 13 9 13H12V16Z" fill="#0ACF83" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="my-1 border-t border-chrome-border" />
                </>
            )}

            {/* ── Scrollable Tab List (Active Workspace Only) ──── */}
            <div className={clsx(
                "flex-grow overflow-y-auto px-2 pb-2 space-y-1.5 scrollbar-none",
                isSidebarCollapsed ? "w-[52px] flex flex-col items-center pt-2" : "w-full"
            )}>
                <AnimatePresence mode="popLayout">
                    {activeWsTabs.map((tab: Tab) => {
                        const isActive = tab.id === activeTabId;
                        if (isSidebarCollapsed) {
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
                        }
                        return (
                            <SidebarTabItem
                                key={tab.id}
                                tab={tab}
                                isActive={isActive}
                                onSelect={() => setActiveTab(tab.id)}
                                onClose={(e) => handleTabClose(e, tab.id)}
                            />
                        );
                    })}
                </AnimatePresence>

                {/* Plus button to add tab in active workspace */}
                <button
                    onClick={() => addTab('about:blank', activeWorkspaceId)}
                    className={clsx(
                        "transition-all duration-200",
                        isSidebarCollapsed 
                            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-chrome-border hover:border-chrome-text-muted hover:text-chrome-text hover:bg-black/[0.05] dark:hover:bg-white/[0.05] mt-1"
                            : "mt-1 flex min-h-[30px] w-full items-center gap-2 rounded-xl px-2.5 text-[12px] font-semibold text-chrome-text-muted/65 hover:bg-black/5 dark:hover:bg-white/5 hover:text-chrome-text"
                    )}
                    title="New Tab"
                >
                    <Plus className="h-3.5 w-3.5" />
                    {!isSidebarCollapsed && <span>New Tab</span>}
                </button>
            </div>

            {/* ── Bottom actions ───────────────────────────────── */}
            <div className={clsx(
                "shrink-0 p-3 flex items-center justify-between border-t border-chrome-border bg-transparent",
                isSidebarCollapsed ? "w-[52px] flex-col gap-3 justify-center" : "w-full"
            )}>
                {!isSidebarCollapsed && (
                    <button
                        onClick={toggleSettings}
                        className="flex items-center gap-2 text-[12px] font-semibold text-chrome-text-muted hover:text-chrome-text transition-colors select-none"
                    >
                        <Folder className="h-4 w-4 text-chrome-text-secondary" />
                        <span>Files</span>
                    </button>
                )}
                <button
                    onClick={toggleTheme}
                    className="p-1 rounded-md text-chrome-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-chrome-text transition-colors select-none"
                >
                    {theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                </button>
            </div>
        </motion.aside>
    );
}

export default WorkspaceSidebar;

import React, { useState } from 'react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import { X, Plus, Search, Lock, Globe, Copy, Pin, PinOff, Minimize2, ChevronLeft, ChevronRight, Settings, Bot, Sun, Moon } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useTabStore, useSettingsStore, useUIStore } from '@/store';
import { Tab } from '@/store';
import { ContextMenu } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import clsx from 'clsx';

// Dynamic icon resolver
const WorkspaceIcon = ({ name, color, className }: { name: string; color: string; className?: string }) => {
    const IconComponent = (Icons as any)[name] || Icons.Folder;
    return (
        <span 
            className={clsx("flex items-center justify-center rounded-lg p-1.5 text-white shadow-sm", className)}
            style={{ background: color }}
        >
            <IconComponent className="w-3.5 h-3.5" />
        </span>
    );
};

interface VerticalTabItemProps {
    tab: Tab;
    isActive: boolean;
    onSelect: () => void;
    onClose: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent, tab: Tab) => void;
}

function VerticalTabItem({ tab, isActive, onSelect, onClose, onContextMenu }: VerticalTabItemProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [hasFaviconError, setHasFaviconError] = useState(false);

    React.useEffect(() => {
        setHasFaviconError(false);
    }, [tab.url, tab.favicon]);

    const getFavicon = () => {
        if (hasFaviconError) return null;
        if (tab.favicon) return tab.favicon;

        try {
            const urlObj = new URL(tab.url);
            return `${urlObj.origin}/favicon.ico`;
        } catch {
            return null;
        }
    };

    const getDisplayUrl = (url: string) => {
        if (url.startsWith('about:')) return 'netsurf';
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return url;
        }
    };

    const favicon = getFavicon();
    const displayUrl = getDisplayUrl(tab.url);

    return (
        <Reorder.Item
            value={tab}
            as="div"
            layout
            onClick={() => {
                if (!isDragging) {
                    onSelect();
                }
            }}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setTimeout(() => setIsDragging(false), 50)}
            onContextMenu={(e) => onContextMenu(e, tab)}
            className={clsx(
                'relative px-3 py-2 mx-2 mb-1 rounded-xl cursor-grab active:cursor-grabbing group',
                'transition-all duration-200 border',
                isActive
                    ? 'bg-chrome-accent-light border-chrome-border-strong text-chrome-text font-semibold shadow-sm'
                    : 'border-transparent text-chrome-text-secondary hover:bg-chrome-surface-hover hover:text-chrome-text'
            )}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            style={{ listStyle: 'none' }}
        >
            <div className="flex items-center gap-2.5">
                {/* Favicon */}
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    {tab.isLoading ? (
                        <motion.div
                            className="w-3.5 h-3.5 border-2 border-chrome-accent border-t-chrome-accent rounded-full"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        />
                    ) : favicon ? (
                        <motion.img
                            src={favicon}
                            alt=""
                            className="w-3.5 h-3.5 rounded-md object-contain"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            onError={() => setHasFaviconError(true)}
                        />
                    ) : tab.isSecure ? (
                        <Lock className="w-3 h-3 text-agent-success" />
                    ) : (
                        <Globe className="w-3.5 h-3.5 text-chrome-text-secondary/60" />
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className={clsx(
                        "text-xs truncate transition-colors",
                        isActive 
                            ? "font-semibold text-chrome-text leading-tight" 
                            : "font-medium text-chrome-text-secondary/70 group-hover:text-chrome-text leading-normal"
                    )}>
                        {tab.title || 'New Tab'}
                    </div>
                    {isActive && (
                        <div className="text-[9.5px] text-chrome-text-muted truncate mt-0.5">
                            {displayUrl}
                        </div>
                    )}
                </div>

                {/* Close button */}
                <motion.button
                    onClick={onClose}
                    className={clsx(
                        'flex-shrink-0 p-0.5 rounded hover:bg-chrome-surface-hover transition-all',
                        'opacity-0 group-hover:opacity-100'
                    )}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                >
                    <X className="w-3 h-3 text-chrome-text-secondary" />
                </motion.button>
            </div>
        </Reorder.Item>
    );
}

VerticalTabItem.displayName = 'VerticalTabItem';

export function VerticalTabBar() {
    const tabs = useTabStore((s) => s.tabs);
    const activeTabId = useTabStore((s) => s.activeTabId);
    const setActiveTab = useTabStore((s) => s.setActiveTab);
    const closeTab = useTabStore((s) => s.closeTab);
    const addTab = useTabStore((s) => s.addTab);
    const duplicateTab = useTabStore((s) => s.duplicateTab);
    const pinTab = useTabStore((s) => s.pinTab);
    const unpinTab = useTabStore((s) => s.unpinTab);
    const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
    const closeTabsToRight = useTabStore((s) => s.closeTabsToRight);
    const reorderTabs = useTabStore((s) => s.reorderTabs);

    // Customizers / Workspace store selectors
    const isSidebarCollapsed = useSettingsStore((s) => s.isSidebarCollapsed);
    const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
    const toggleLayoutMode = useSettingsStore((s) => s.toggleLayoutMode);
    const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
    const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth);
    const workspaces = useSettingsStore((s) => s.workspaces);
    const activeWorkspaceId = useSettingsStore((s) => s.activeWorkspaceId);
    const setActiveWorkspaceId = useSettingsStore((s) => s.setActiveWorkspaceId);

    const toggleSettings = useUIStore((s) => s.toggleSettings);
    const togglePanel = useUIStore((s) => s.togglePanel);
    const { toggleTheme, theme } = useTheme();

    const [searchQuery, setSearchQuery] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tab: Tab } | null>(null);
    const [isResizing, setIsResizing] = useState(false);

    const handleTabClick = (tabId: string) => setActiveTab(tabId);
    const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        closeTab(tabId);
    };

    const handleContextMenu = (e: React.MouseEvent, tab: Tab) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, tab });
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);

        const startX = e.clientX;
        const startWidth = sidebarWidth;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            const delta = moveEvent.clientX - startX;
            const constrainedWidth = Math.max(220, Math.min(360, startWidth + delta));
            setSidebarWidth(constrainedWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Filter tabs by Active Workspace
    const workspaceTabs = tabs.filter(tab => (tab.workspaceId || 'work') === activeWorkspaceId);

    // Search filter
    const searchedTabs = searchQuery
        ? workspaceTabs.filter(tab =>
            tab.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tab.url?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : workspaceTabs;

    // Split pinned vs normal
    const pinnedTabs = searchedTabs.filter(tab => tab.isPinned);
    const regularTabs = searchedTabs.filter(tab => !tab.isPinned);

    return (
        <>
            <motion.aside
                animate={{ width: isSidebarCollapsed ? 0 : sidebarWidth, opacity: isSidebarCollapsed ? 0 : 1 }}
                transition={isResizing ? { duration: 0 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={clsx(
                    "relative flex flex-col h-[calc(100vh-16px)] m-2 mr-1 rounded-2xl overflow-hidden glass-panel select-none z-30"
                )}
            >
                {!isSidebarCollapsed && (
                    <>
                        {/* Workspaces Switcher Section */}
                        <div className="px-3 pt-3 pb-2 border-b border-chrome-border">
                            <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-[10px] font-bold text-chrome-text-muted uppercase tracking-wider">
                                    Workspaces
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
                                {workspaces.map((ws) => {
                                    const isActive = ws.id === activeWorkspaceId;
                                    return (
                                        <motion.button
                                            key={ws.id}
                                            onClick={() => {
                                                setActiveWorkspaceId(ws.id);
                                                const wsTabs = tabs.filter(t => (t.workspaceId || 'work') === ws.id);
                                                if (wsTabs.length > 0) {
                                                    setActiveTab(wsTabs[0].id);
                                                } else {
                                                    addTab('about:blank', ws.id);
                                                }
                                            }}
                                            className={clsx(
                                                "relative flex items-center justify-center p-1 rounded-xl transition-all",
                                                isActive 
                                                    ? "bg-[var(--chrome-accent-light)] border border-[var(--chrome-accent)]/20 shadow-sm" 
                                                    : "hover:bg-chrome-surface-hover border border-transparent"
                                            )}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            title={ws.name}
                                        >
                                            <WorkspaceIcon name={ws.icon || 'Folder'} color={ws.color} />
                                            {isActive && (
                                                <motion.span 
                                                    layoutId="activeWorkspaceDot"
                                                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-chrome-accent" 
                                                />
                                            )}
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Pinned Tabs Section (Compact Grid) */}
                        {pinnedTabs.length > 0 && (
                            <div className="px-3 pt-2 pb-1 border-b border-chrome-border">
                                <div className="text-[10px] font-bold text-chrome-text-muted uppercase tracking-wider mb-2 px-1">
                                    Pinned
                                </div>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {pinnedTabs.map((tab) => {
                                        const isActive = tab.id === activeTabId;
                                        return (
                                            <motion.button
                                                key={tab.id}
                                                onClick={() => handleTabClick(tab.id)}
                                                onContextMenu={(e) => handleContextMenu(e, tab)}
                                                className={clsx(
                                                    "flex items-center justify-center h-10 rounded-xl transition-all border",
                                                    isActive 
                                                        ? "bg-[var(--chrome-accent-light)] border-[var(--chrome-accent)]/20 shadow-sm text-[var(--chrome-accent)]" 
                                                        : "bg-chrome-surface border-transparent hover:bg-chrome-surface-hover"
                                                )}
                                                whileHover={{ scale: 1.05 }}
                                                title={tab.title || 'Pinned Tab'}
                                            >
                                                {tab.favicon ? (
                                                    <img src={tab.favicon} alt="" className="w-4 h-4 rounded-sm object-contain" />
                                                ) : (
                                                    <Pin className="w-3.5 h-3.5 opacity-60" />
                                                )}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Search inline */}
                        <div className="px-3 pt-2.5 pb-1.5">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-chrome-text-secondary/50 pointer-events-none z-10" />
                                <input
                                    type="text"
                                    placeholder="Search workspace..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-chrome-surface-hover text-chrome-text text-xs placeholder-chrome-text-secondary/50 border border-chrome-border focus:border-chrome-accent focus:bg-chrome-surface-solid outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* Tab List */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none pb-4">
                            <div className="flex items-center justify-between px-3.5 mb-1.5 mt-1">
                                <span className="text-[10px] font-bold text-chrome-text-muted uppercase tracking-wider">
                                    Tabs
                                </span>
                                <span className="text-[10px] text-chrome-text-secondary/40 font-medium">
                                    {regularTabs.length}
                                </span>
                            </div>
                            <Reorder.Group
                                axis="y"
                                values={regularTabs}
                                onReorder={(newOrder) => {
                                    const oldIds = regularTabs.map(t => t.id);
                                    const newIds = newOrder.map(t => t.id);
                                    for (let i = 0; i < oldIds.length; i++) {
                                        if (oldIds[i] !== newIds[i]) {
                                            const movedId = newIds[i];
                                            const fromIndex = tabs.findIndex(t => t.id === movedId);
                                            const toIndex = tabs.findIndex(t => t.id === oldIds[i]);
                                            if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                                                reorderTabs(fromIndex, toIndex);
                                            }
                                            break;
                                        }
                                    }
                                }}
                                as="div"
                            >
                                <AnimatePresence mode="popLayout">
                                    {regularTabs.map((tab) => (
                                        <VerticalTabItem
                                            key={tab.id}
                                            tab={tab}
                                            isActive={tab.id === activeTabId}
                                            onSelect={() => handleTabClick(tab.id)}
                                            onClose={(e) => handleCloseTab(e, tab.id)}
                                            onContextMenu={handleContextMenu}
                                        />
                                    ))}
                                </AnimatePresence>
                            </Reorder.Group>
                        </div>

                        {/* Bottom Actions Bar (Arc style) */}
                        <div className="p-2.5 mt-auto border-t border-chrome-border bg-chrome-surface-hover flex flex-col gap-2">
                            {/* New Tab Button */}
                            <motion.button
                                onClick={() => addTab('about:blank', activeWorkspaceId)}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-chrome-text hover:bg-chrome-surface-solid border border-chrome-border hover:border-chrome-border shadow-sm rounded-xl transition-all w-full justify-center"
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <Plus className="w-3.5 h-3.5 text-chrome-accent" />
                                <span>New Tab</span>
                            </motion.button>

                            {/* Toolbar Buttons Row */}
                            <div className="flex items-center justify-between px-1">
                                {/* Profile avatar & settings */}
                                <div className="flex items-center gap-1.5">
                                    <motion.button
                                        onClick={toggleSettings}
                                        className="p-2 text-chrome-text-secondary hover:text-chrome-text hover:bg-chrome-surface-solid rounded-lg border border-transparent hover:border-chrome-border transition-all"
                                        whileHover={{ scale: 1.05 }}
                                        title="Settings"
                                    >
                                        <Settings className="w-3.5 h-3.5" />
                                    </motion.button>
                                    <motion.button
                                        onClick={() => togglePanel('agent')}
                                        className="p-2 text-chrome-text-secondary hover:text-chrome-text hover:bg-chrome-surface-solid rounded-lg border border-transparent hover:border-chrome-border transition-all"
                                        whileHover={{ scale: 1.05 }}
                                        title="AI Agent"
                                    >
                                        <Bot className="w-3.5 h-3.5" />
                                    </motion.button>
                                </div>

                                {/* Customizer theme toggler */}
                                <div className="flex items-center gap-1.5">
                                    <motion.button
                                        onClick={toggleTheme}
                                        className="p-2 text-chrome-text-secondary hover:text-chrome-text hover:bg-chrome-surface-solid rounded-lg border border-transparent hover:border-chrome-border transition-all"
                                        whileHover={{ scale: 1.05 }}
                                        title="Toggle Dark Mode"
                                    >
                                        {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                                    </motion.button>

                                    <motion.button
                                        onClick={toggleSidebar}
                                        className="p-2 text-chrome-text-secondary hover:text-chrome-text hover:bg-chrome-surface-solid rounded-lg border border-transparent hover:border-chrome-border transition-all"
                                        whileHover={{ scale: 1.05 }}
                                        title="Collapse Sidebar"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </motion.button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Resize Handle */}
                {!isSidebarCollapsed && (
                    <div
                        className="absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-chrome-accent transition-colors group z-50"
                        onMouseDown={handleResizeStart}
                        style={{
                            right: '0px',
                            width: '4px',
                            pointerEvents: 'auto'
                        }}
                    >
                        <div className="absolute right-1/2 top-1/2 -translate-y-1/2 w-0.5 h-12 bg-chrome-accent rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                )}
            </motion.aside>

            {/* Context Menu */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    items={[
                        {
                            label: 'Duplicate Tab',
                            icon: <Copy className="w-4 h-4" />,
                            onClick: () => duplicateTab(contextMenu.tab.id),
                        },
                        {
                            label: contextMenu.tab.isPinned ? 'Unpin Tab' : 'Pin Tab',
                            icon: contextMenu.tab.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />,
                            onClick: () => contextMenu.tab.isPinned ? unpinTab(contextMenu.tab.id) : pinTab(contextMenu.tab.id),
                        },
                        {
                            label: 'Close Other Tabs',
                            onClick: () => closeOtherTabs(contextMenu.tab.id),
                        },
                        {
                            label: 'Close Tabs Below',
                            onClick: () => closeTabsToRight(contextMenu.tab.id),
                        },
                        {
                            label: 'Switch to Horizontal Layout',
                            icon: <Minimize2 className="w-4 h-4" />,
                            onClick: () => toggleLayoutMode(),
                        },
                        {
                            label: 'Close Tab',
                            icon: <X className="w-4 h-4" />,
                            onClick: () => closeTab(contextMenu.tab.id),
                            variant: 'danger' as const,
                        },
                    ]}
                />
            )}
        </>
    );
}

export function CollapsedSidebarButton() {
    const isSidebarCollapsed = useSettingsStore((s) => s.isSidebarCollapsed);
    const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);

    if (!isSidebarCollapsed) return null;

    return (
        <motion.button
            initial={{ x: -48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -48, opacity: 0 }}
            whileHover={{ x: 6, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed left-2 top-1/2 -translate-y-1/2 z-50 p-2 bg-chrome-surface border border-chrome-border shadow-md rounded-xl hover:bg-chrome-surface-solid transition-colors"
            onClick={toggleSidebar}
            title="Show Sidebar (Ctrl+B)"
        >
            <ChevronRight className="w-4 h-4 text-chrome-text" />
        </motion.button>
    );
}

export default VerticalTabBar;

import React from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { X, Plus, Globe, Copy, Pin, PinOff, Sidebar, Minimize2 } from 'lucide-react';
import { useTabStore, useSettingsStore, type Tab } from '@/store';
import { ContextMenu } from '@/components';
import clsx from 'clsx';

interface TabItemProps {
    tab: Tab;
    isActive: boolean;
    onActivate: () => void;
    onClose: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent, tab: Tab) => void;
}

const TAB_WIDTH = 180; // fixed equal width for all tabs

const TabItem = React.memo(function TabItem({ tab, isActive, onActivate, onClose, onContextMenu }: TabItemProps) {
    const [isDragging, setIsDragging] = React.useState(false);
    const [hasFaviconError, setHasFaviconError] = React.useState(false);

    React.useEffect(() => {
        setHasFaviconError(false);
    }, [tab.favicon]);

    return (
        <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: TAB_WIDTH }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className={clsx(
                'group relative flex items-center h-[34px] shrink-0 cursor-pointer select-none',
                'rounded-t-lg px-3 mx-0.5 border transition-all duration-150',
                isActive
                    ? 'bg-chrome-surface-solid shadow-sm border-chrome-border border-b-transparent text-chrome-text'
                    : 'border-transparent bg-transparent text-chrome-text-secondary hover:bg-chrome-surface hover:text-chrome-text'
            )}
            style={{ width: TAB_WIDTH }}
            onClick={() => { if (!isDragging) onActivate(); }}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setTimeout(() => setIsDragging(false), 50)}
            onContextMenu={(e) => onContextMenu(e, tab)}
        >
            {/* Active tab top indicator line */}
            {isActive && (
                <span className="absolute top-0 left-0 right-0 h-[2px] bg-chrome-accent rounded-b" />
            )}

            {/* Favicon */}
            <div className="flex-shrink-0 w-4 h-4 mr-2">
                {tab.isLoading ? (
                    <motion.div
                        className="w-4 h-4 border-2 border-chrome-accent border-t-transparent rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                ) : tab.favicon && !hasFaviconError ? (
                    <img
                        src={tab.favicon}
                        alt=""
                        className="w-4 h-4 rounded"
                        onError={() => setHasFaviconError(true)}
                    />
                ) : tab.url === 'about:blank' ? (
                    <Globe className="w-4 h-4 opacity-50" />
                ) : (
                    <Globe className="w-4 h-4 opacity-50" />
                )}
            </div>

            {/* Title */}
            <span className={clsx('flex-1 truncate text-[12px]', isActive ? 'font-semibold' : 'font-medium')}>
                {tab.title || 'New Tab'}
            </span>

            {/* Close button */}
            <button
                className={clsx(
                    'flex-shrink-0 ml-1 p-0.5 rounded-full transition-all duration-100',
                    'opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-chrome-surface-active',
                    isActive && 'opacity-50'
                )}
                onClick={(e) => { e.stopPropagation(); onClose(e); }}
                aria-label="Close tab"
            >
                <X className="w-3 h-3" />
            </button>
        </motion.div>
    );
});

export function TabBar() {
    const allTabs = useTabStore((s) => s.tabs);
    const activeTabId = useTabStore((s) => s.activeTabId);
    const activeWorkspaceId = useSettingsStore((s) => s.activeWorkspaceId);
    // Only show tabs belonging to the current workspace
    const tabs = allTabs.filter(t => !t.workspaceId || t.workspaceId === activeWorkspaceId);
    const addTab = useTabStore((s) => s.addTab);
    const closeTab = useTabStore((s) => s.closeTab);
    const setActiveTab = useTabStore((s) => s.setActiveTab);
    const reorderTabs = useTabStore((s) => s.reorderTabs);
    const duplicateTab = useTabStore((s) => s.duplicateTab);
    const pinTab = useTabStore((s) => s.pinTab);
    const unpinTab = useTabStore((s) => s.unpinTab);
    const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
    const closeTabsToRight = useTabStore((s) => s.closeTabsToRight);
    const layoutMode = useSettingsStore((s) => s.layoutMode);
    const toggleLayoutMode = useSettingsStore((s) => s.toggleLayoutMode);
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; tab: Tab } | null>(null);

    // Scroll active tab into view
    React.useEffect(() => {
        if (activeTabId && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const activeElement = container.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement;

            if (activeElement) {
                const containerRect = container.getBoundingClientRect();
                const activeRect = activeElement.getBoundingClientRect();

                // Calculate the position to center the active tab
                // We want the center of the tab to align with the center of the container
                const scrollLeft = container.scrollLeft + (activeRect.left - containerRect.left) - (containerRect.width / 2) + (activeRect.width / 2);

                container.scrollTo({
                    left: scrollLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [activeTabId]);

    const handleAddTab = () => {
        addTab('about:blank', activeWorkspaceId);
    };

    const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        closeTab(tabId);
    };

    const handleContextMenu = (e: React.MouseEvent, tab: Tab) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, tab });
    };

    return (
        <div className="flex items-end h-full bg-transparent pl-1 pr-1">
            {/* Tabs scroll area */}
            <div
                ref={scrollContainerRef}
                className="flex items-end overflow-x-auto scrollbar-none max-w-[calc(100vw-180px)] h-full"
                style={{ scrollbarWidth: 'none' }}
            >
                <Reorder.Group
                    axis="x"
                    values={tabs}
                    onReorder={(newOrder) => {
                        const oldIds = tabs.map(t => t.id);
                        const newIds = newOrder.map(t => t.id);
                        for (let i = 0; i < oldIds.length; i++) {
                            if (oldIds[i] !== newIds[i]) {
                                const movedId = newIds[i];
                                const fromIndex = oldIds.indexOf(movedId);
                                const toIndex = i;
                                if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                                    reorderTabs(fromIndex, toIndex);
                                }
                                break;
                            }
                        }
                    }}
                    as="div"
                    className="flex items-end h-full"
                >
                    <AnimatePresence mode="popLayout">
                        {tabs.map((tab) => (
                            <Reorder.Item
                                key={tab.id}
                                value={tab}
                                className="shrink-0 flex items-end"
                                data-tab-id={tab.id}
                            >
                                <TabItem
                                    tab={tab}
                                    isActive={tab.id === activeTabId}
                                    onActivate={() => setActiveTab(tab.id)}
                                    onClose={(e) => handleCloseTab(e, tab.id)}
                                    onContextMenu={handleContextMenu}
                                />
                            </Reorder.Item>
                        ))}
                    </AnimatePresence>
                </Reorder.Group>

                {/* New tab button */}
                <button
                    className="flex-shrink-0 flex items-center justify-center w-7 h-7 mx-1 mb-1 rounded-lg text-chrome-text-muted hover:text-chrome-text hover:bg-chrome-surface-hover transition-colors duration-150"
                    onClick={handleAddTab}
                    aria-label="New tab"
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Draggable spacer fills remainder */}
            <div
                className="flex-1 h-full min-w-[20px]"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            />


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
                            onClick: () => contextMenu.tab.isPinned
                                ? unpinTab(contextMenu.tab.id)
                                : pinTab(contextMenu.tab.id),
                        },
                        {
                            label: 'Close Other Tabs',
                            onClick: () => closeOtherTabs(contextMenu.tab.id),
                        },
                        {
                            label: 'Close Tabs to the Right',
                            onClick: () => closeTabsToRight(contextMenu.tab.id),
                        },
                        {
                            label: layoutMode === 'vertical' ? 'Switch to Horizontal Tabs' : 'Switch to Vertical Tabs',
                            icon: layoutMode === 'vertical' ? <Minimize2 className="w-4 h-4" /> : <Sidebar className="w-4 h-4" />,
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
        </div>
    );
}

export default TabBar;

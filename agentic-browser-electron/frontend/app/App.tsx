import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/theme';
import { ErrorBoundary, PerformanceOverlay, ToastContainer } from '@/components';
import { AgentPanel } from '@/features/agent';
import { AnimatePresence } from 'framer-motion';
import { HistoryPanel } from '@/features/history/HistoryPanel';
import { useTabStore, useUIStore, useSettingsStore, useAgentWorkspaceStore } from '@/store';
import { useCommonShortcuts, useAgentCommands } from '@/hooks';
import { NavigationControls, AddressBar } from '@/features/navigation';
import { WebViewContainer } from './WebViewContainer';
import { WorkspaceSidebar } from '@/features/tabs';
import { VerticalTabBar, CollapsedSidebarButton } from '@/features/tabs/VerticalTabBar';
import NetSurfViewer from './NetSurfViewer';
import { DeepResearchView } from '@/features/deepresearch';
import { SettingsPage } from './SettingsPage';
import { Settings, Zap } from 'lucide-react';
import { isMacOS } from '@/utils/helpers';
import clsx from 'clsx';


/**
 * App - Main application component
 * Routes between main browser chrome and settings page
 */
function AppContent() {
    // Check if this is the settings window
    const urlParams = new URLSearchParams(window.location.search);
    const isSettingsWindow = urlParams.get('route') === 'settings';

    if (isSettingsWindow) {
        return <SettingsPage />;
    }

    return <BrowserChrome />;
}

/**
 * BrowserChrome — The main browser UI with tabs, address bar, webview, agent panel
 */
function BrowserChrome() {
    const addTab = useTabStore((s) => s.addTab);
    const closeTab = useTabStore((s) => s.closeTab);
    const activeTabId = useTabStore((s) => s.activeTabId);
    const goBack = useTabStore((s) => s.goBack);
    const goForward = useTabStore((s) => s.goForward);
    const reload = useTabStore((s) => s.reload);
    const nextTab = useTabStore((s) => s.nextTab);
    const prevTab = useTabStore((s) => s.prevTab);
    const reopenLastClosedTab = useTabStore((s) => s.reopenLastClosedTab);
    const focusAddressBar = useUIStore((s) => s.focusAddressBar);
    const togglePanel = useUIStore((s) => s.togglePanel);
    const isPanelOpen = useUIStore((s) => s.isPanelOpen);
    const activePanel = useUIStore((s) => s.activePanel);
    const isAgentPanelOpen = isPanelOpen && activePanel === 'agent';
    const toggleSettings = useUIStore((s) => s.toggleSettings);
    const isSettingsOpen = useUIStore((s) => s.isSettingsOpen);
    const isDeepResearchOpen = useUIStore((s) => s.isDeepResearchOpen);
    const closeDeepResearch = useUIStore((s) => s.closeDeepResearch);
    const toggleDeepResearch = useUIStore((s) => s.toggleDeepResearch);
    const openPanel = useUIStore((s) => s.openPanel);

    // Import settings store
    const layoutMode = useSettingsStore((s) => s.layoutMode);
    const toggleLayoutMode = useSettingsStore((s) => s.toggleLayoutMode);
    const enableVerticalTabsFeature = useSettingsStore((s) => s.enableVerticalTabsFeature);
    const isSidebarCollapsed = useSettingsStore((s) => s.isSidebarCollapsed);
    const wallpaper = useSettingsStore((s) => s.wallpaper) || 'ambient-gradient';
    const chromeLayoutStyle = useSettingsStore((s) => s.chromeLayoutStyle) || 'arc-floating';
    const resetToDefaultTab = useTabStore((s) => s.resetToDefaultTab);
    const isMac = isMacOS();

    // NetSurf Viewer state
    const [showViewer, setShowViewer] = useState(false);

    // Check if this is a new window (via ?newWindow=true URL param)
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('newWindow') === 'true') {
            resetToDefaultTab();
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [resetToDefaultTab]);

    // Register keyboard shortcuts
    useCommonShortcuts({
        onNewTab: () => addTab(),
        onCloseTab: () => activeTabId && closeTab(activeTabId),
        onReopenTab: () => reopenLastClosedTab(),
        onNextTab: () => nextTab(),
        onPrevTab: () => prevTab(),
        onNewWindow: () => {
            if (window.electronAPI?.window?.create) {
                window.electronAPI.window.create();
            }
        },
        onFocusAddressBar: () => focusAddressBar(),
        onToggleAgentPanel: () => togglePanel('agent'),
        onOpenDownloads: () => togglePanel('downloads'),
        onOpenHistory: () => togglePanel('history'),
        onOpenSettings: () => {
            // Toggle Settings overlay
            toggleSettings();
        },
        onReload: () => activeTabId && reload(activeTabId),
        onToggleVerticalMode: enableVerticalTabsFeature ? () => toggleLayoutMode() : undefined,
        onToggleBookmarks: () => {
            const toggleBookmarkBar = useSettingsStore.getState().toggleBookmarkBar;
            toggleBookmarkBar();
        },
    });

    // Handle agent commands from main process
    useAgentCommands();

    useEffect(() => {
        openPanel('agent');
    }, [openPanel]);

    // Force horizontal layout mode on load as requested by user
    useEffect(() => {
        useSettingsStore.getState().setLayoutMode('horizontal');
    }, []);

    // Ensure backend can open the Shadow Workspace even if the workspace tab/component isn't mounted yet
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.tabs?.onOpenWorkspace) return;

        const unsub = api.tabs.onOpenWorkspace(() => {
            const store = useAgentWorkspaceStore.getState();
            if (!store.isOpen) store.openWorkspace();
        });

        return () => unsub?.();
    }, []);

    // Additional navigation shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!activeTabId) return;

            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                goBack(activeTabId);
            } else if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                goForward(activeTabId);
            } else if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                reload(activeTabId);
            } else if (e.ctrlKey && e.shiftKey && e.key === 'N') {
                e.preventDefault();
                setShowViewer(true);
            } else if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                toggleDeepResearch();
            } else if (e.key === 'F11') {
                e.preventDefault();
                const api = (window as any).electronAPI;
                if (api?.window?.toggleFullScreen) {
                    api.window.toggleFullScreen();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTabId, goBack, goForward, reload, toggleDeepResearch]);

    // Global shortcuts from Electron main process
    useEffect(() => {
        const { electronAPI } = window;
        if (!electronAPI?.shortcuts) return;

        const cleanup = [
            electronAPI.shortcuts.onNewTab(() => { addTab(); }),
            electronAPI.shortcuts.onCloseTab(() => { activeTabId && closeTab(activeTabId); }),
            electronAPI.shortcuts.onNextTab(() => { nextTab(); }),
            electronAPI.shortcuts.onPrevTab(() => { prevTab(); }),
            electronAPI.shortcuts.onReopenTab(() => { reopenLastClosedTab(); }),
            electronAPI.shortcuts.onHistory(() => { togglePanel('history'); }),
            electronAPI.shortcuts.onNewWindow(() => { }),
            electronAPI.shortcuts.onToggleVerticalMode(() => { enableVerticalTabsFeature && toggleLayoutMode(); }),
            electronAPI.shortcuts.onReload(() => { activeTabId && reload(activeTabId); }),
            electronAPI.shortcuts.onGoBack(() => { activeTabId && goBack(activeTabId); }),
            electronAPI.shortcuts.onGoForward(() => { activeTabId && goForward(activeTabId); }),
            electronAPI.shortcuts.onToggleSidebar(() => {
                const toggleSidebar = useSettingsStore.getState().toggleSidebar;
                toggleSidebar();
            }),
        ];

        return () => {
            cleanup.forEach(fn => fn());
        };
    }, [addTab, activeTabId, closeTab, nextTab, prevTab, reopenLastClosedTab, togglePanel, toggleLayoutMode, reload, goBack, goForward, enableVerticalTabsFeature]);

    const getWallpaperClass = () => {
        switch (wallpaper) {
            case 'cosmic-nebula':
                return 'cosmic-nebula-bg';
            case 'solid-dark':
                return 'solid-dark-bg';
            case 'glass-frosted':
                return 'glass-frosted-bg';
            case 'ambient-gradient':
            default:
                return 'ambient-gradient-bg';
        }
    };

    return (
        <div className={`netsurf-shell ${getWallpaperClass()} relative flex h-screen flex-col overflow-hidden`}>
            <div className="netsurf-window relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden">
                {/* Vertical Tab Sidebar */}
                {layoutMode === 'vertical' && enableVerticalTabsFeature && (
                    <>
                        <VerticalTabBar />
                        <CollapsedSidebarButton />
                    </>
                )}

                {layoutMode === 'horizontal' && <WorkspaceSidebar />}
                {layoutMode === 'horizontal' && !useSettingsStore.getState().isSidebarCollapsed && (
                    <div
                        className="w-1 cursor-col-resize hover:bg-chrome-accent/20 active:bg-chrome-accent/40 z-50 shrink-0 transition-colors"
                        onMouseDown={(e) => {
                            const startX = e.clientX;
                            const startWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--workspace-rail-width')) || 260;
                            const onMouseMove = (moveEvent: MouseEvent) => {
                                const newWidth = Math.max(160, Math.min(startWidth + (moveEvent.clientX - startX), 600));
                                document.documentElement.style.setProperty('--workspace-rail-width', `${newWidth}px`);
                            };
                            const onMouseUp = () => {
                                document.removeEventListener('mousemove', onMouseMove);
                                document.removeEventListener('mouseup', onMouseUp);
                            };
                            document.addEventListener('mousemove', onMouseMove);
                            document.addEventListener('mouseup', onMouseUp);
                        }}
                    />
                )}

                <main className={clsx(
                    "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent",
                    chromeLayoutStyle === 'dia-minimal' 
                        ? "p-0" 
                        : `pt-0 pr-1.5 pb-1.5 ${isSidebarCollapsed ? "pl-1.5" : "pl-0"}`
                )}>
                    <div className="relative flex min-w-0 flex-1 overflow-hidden">
                        <section
                            className="relative flex min-w-0 flex-1 flex-col transition-all duration-300"
                        >
                            {/* Main Card Toolbar Header — transparent top strip, aligns with sidebar header and Windows controls */}
                            <div className="relative shrink-0">
                                <div
                                    className={clsx(
                                        "relative flex items-center w-full px-4 gap-3 select-none",
                                        chromeLayoutStyle === 'dia-minimal'
                                            ? "h-[var(--titlebar-height)] bg-chrome-surface-solid border-b border-chrome-border rounded-none"
                                            : "h-[var(--titlebar-height)] bg-transparent",
                                        isMac && "pt-[30px]"
                                    )}
                                    style={{
                                        WebkitAppRegion: 'drag',
                                        width: '100%'
                                    } as React.CSSProperties}
                                >
                                    <div
                                        className={clsx(
                                            "flex shrink-0 items-center gap-1.5 transition-all duration-150",
                                            isSidebarCollapsed && "pl-[136px]"
                                        )}
                                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                    >
                                        <NavigationControls />
                                    </div>

                                    {/* Centered Address Bar */}
                                    <div
                                        className="absolute left-1/2 bottom-1 -translate-x-1/2 z-50 pointer-events-auto"
                                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                    >
                                        <AddressBar />
                                    </div>

                                    {/* Right side actions */}
                                    <div
                                        className={clsx(
                                            "ml-auto flex shrink-0 items-center gap-3",
                                            chromeLayoutStyle !== 'dia-minimal' && !isMac && "pr-[146px]"
                                        )}
                                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                    >
                                        <button
                                            onClick={() => togglePanel('agent')}
                                            className={clsx(
                                                'flex h-7 items-center gap-1 rounded-lg border border-chrome-border px-2.5 text-[11px] font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] select-none',
                                                isAgentPanelOpen
                                                    ? 'bg-chrome-accent-light border-chrome-accent/50 text-chrome-accent'
                                                    : 'bg-chrome-surface-soft hover:bg-chrome-surface text-chrome-text-secondary hover:text-chrome-text'
                                            )}
                                        >
                                            <Zap className="h-3.5 w-3.5" />
                                            <span className="hidden xl:inline">Agent</span>
                                        </button>

                                        <button
                                            onClick={toggleSettings}
                                            className="flex h-7 items-center gap-1 rounded-lg border border-chrome-border px-2.5 bg-chrome-surface-soft hover:bg-chrome-surface text-chrome-text-secondary hover:text-chrome-text text-[11px] font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] select-none"
                                        >
                                            <Settings className="h-3.5 w-3.5" />
                                            <span className="hidden xl:inline">Personalization</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className={clsx(
                                "relative min-h-0 flex-1 overflow-hidden flex",
                                chromeLayoutStyle === 'dia-minimal'
                                    ? "rounded-none border-none bg-chrome-surface-solid dark:bg-[#141414] shadow-none"
                                    : "rounded-[16px] bg-chrome-surface-solid shadow-xl shadow-black/[0.03] dark:shadow-black/25"
                            )}>
                                <div className="relative flex-1 min-w-0 overflow-hidden">
                                    <WebViewContainer />
                                    <HistoryPanel />

                                    {/* Deep Research View */}
                                    {isDeepResearchOpen && (
                                        <DeepResearchView onClose={closeDeepResearch} />
                                    )}
                                </div>

                                {isAgentPanelOpen && (
                                    <>
                                        <div
                                            className={clsx(
                                                "w-[1px] relative cursor-col-resize z-50 shrink-0 transition-colors flex items-center justify-center",
                                                chromeLayoutStyle === 'dia-minimal'
                                                    ? "bg-chrome-border hover:bg-chrome-accent/30 active:bg-chrome-accent/50"
                                                    : "bg-chrome-border hover:bg-chrome-accent/20 active:bg-chrome-accent/40"
                                            )}
                                            onMouseDown={(e) => {
                                                const startX = e.clientX;
                                                const startWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-width')) || 380;
                                                const onMouseMove = (moveEvent: MouseEvent) => {
                                                    const newWidth = Math.max(250, Math.min(startWidth - (moveEvent.clientX - startX), 800));
                                                    document.documentElement.style.setProperty('--panel-width', `${newWidth}px`);
                                                };
                                                const onMouseUp = () => {
                                                    document.removeEventListener('mousemove', onMouseMove);
                                                    document.removeEventListener('mouseup', onMouseUp);
                                                };
                                                document.addEventListener('mousemove', onMouseMove);
                                                document.addEventListener('mouseup', onMouseUp);
                                            }}
                                        >
                                            <div className="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize" />
                                        </div>
                                        <AnimatePresence>
                                            {isAgentPanelOpen && <AgentPanel key="agent-panel" />}
                                        </AnimatePresence>
                                    </>
                                )}
                            </div>
                        </section>
                    </div>
                </main>
            </div>

            {/* Settings Overlay */}
            {isSettingsOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}>
                    <SettingsPage />
                </div>
            )}

            {/* NetSurf Viewer */}
            {showViewer && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
                    <NetSurfViewer onClose={() => setShowViewer(false)} />
                </div>
            )}

            <PerformanceOverlay />
        </div>
    );
}

export function App() {
    return (
        <ThemeProvider>
            <ErrorBoundary name="App">
                <AppContent />
                <ToastContainer />
            </ErrorBoundary>
        </ThemeProvider>
    );
}

export default App;

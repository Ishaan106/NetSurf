import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useSettingsStore } from './settingsStore';

export interface Tab {
    id: string;
    url: string;
    title: string;
    favicon?: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    isSecure: boolean;
    isPinned: boolean;
    workspaceId: string;
    errorInfo?: {
        errorCode: number;
        errorDescription: string;
        validatedURL: string;
    };
}

interface TabState {
    tabs: Tab[];
    activeTabId: string | null;
    closedTabsStack: Tab[]; // Stack of recently closed tabs for Ctrl+Shift+T
}

interface TabActions {
    addTab: (url?: string, workspaceId?: string) => string;
    closeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    updateTab: (id: string, updates: Partial<Tab>) => void;
    reorderTabs: (fromIndex: number, toIndex: number) => void;
    pinTab: (id: string) => void;
    unpinTab: (id: string) => void;
    duplicateTab: (id: string) => void;
    closeOtherTabs: (id: string) => void;
    closeTabsToRight: (id: string) => void;
    // Closed tab management
    reopenLastClosedTab: () => void;
    // Tab navigation
    nextTab: () => void;
    prevTab: () => void;
    // Navigation actions
    goBack: (id: string) => void;
    goForward: (id: string) => void;
    reload: (id: string) => void;
    stop: (id: string) => void;
    // Reset tabs for new window
    resetToDefaultTab: () => void;
}

type TabStore = TabState & TabActions;

const generateId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createNewTab = (url: string = 'about:blank', workspaceId?: string): Tab => {
    const wId = workspaceId || useSettingsStore.getState().activeWorkspaceId || 'work';
    return {
        id: generateId(),
        url,
        title: url === 'about:blank' ? 'New Tab' : url.startsWith('workspace:') ? 'Shadow Workspace' : url,
        isLoading: url !== 'about:blank' && !url.startsWith('workspace:'),
        canGoBack: false,
        canGoForward: false,
        isSecure: url.startsWith('https://'),
        isPinned: false,
        workspaceId: wId,
    };
};

export const useTabStore = create<TabStore>()(
    devtools(
        persist(
            (set, get) => ({
                tabs: [],
                activeTabId: null,
                closedTabsStack: [] as Tab[], // Track closed tabs for Ctrl+Shift+T

                addTab: (url = 'about:blank', workspaceId) => {
                    const targetWorkspaceId = workspaceId || useSettingsStore.getState().activeWorkspaceId || 'work';
                    const newTab = createNewTab(url, targetWorkspaceId);
                    set((state) => ({
                        tabs: [...state.tabs, newTab],
                        activeTabId: newTab.id,
                    }));
                    return newTab.id;
                },

                closeTab: (id) => {
                    const { tabs, activeTabId, closedTabsStack } = get();
                    const closedTab = tabs.find((t) => t.id === id);

                    if (tabs.length === 1) {
                        // Don't close the last tab, just reset it
                        const newTab = createNewTab();
                        set({
                            tabs: [newTab],
                            activeTabId: newTab.id,
                        });
                        return;
                    }

                    const tabIndex = tabs.findIndex((t) => t.id === id);
                    const newTabs = tabs.filter((t) => t.id !== id);

                    let newActiveId = activeTabId;
                    if (activeTabId === id) {
                        // Activate adjacent tab
                        newActiveId = tabs[tabIndex - 1]?.id || tabs[tabIndex + 1]?.id || null;
                    }

                    // Push closed tab to stack (max 20)
                    const newClosedStack = closedTab && closedTab.url !== 'about:blank'
                        ? [closedTab, ...closedTabsStack].slice(0, 20)
                        : closedTabsStack;

                    set({
                        tabs: newTabs,
                        activeTabId: newActiveId,
                        closedTabsStack: newClosedStack,
                    });
                },

                setActiveTab: (id) => {
                    set({ activeTabId: id });
                },

                updateTab: (id, updates) => {
                    set((state) => ({
                        tabs: state.tabs.map((tab) =>
                            tab.id === id ? { ...tab, ...updates } : tab
                        ),
                    }));
                },

                reorderTabs: (fromIndex, toIndex) => {
                    set((state) => {
                        const tabs = [...state.tabs];
                        const [removed] = tabs.splice(fromIndex, 1);
                        tabs.splice(toIndex, 0, removed);
                        return { tabs };
                    });
                },

                pinTab: (id) => {
                    set((state) => {
                        const tabIndex = state.tabs.findIndex((t) => t.id === id);
                        if (tabIndex === -1) return state;

                        const tab = { ...state.tabs[tabIndex], isPinned: true };
                        const tabs = [...state.tabs];
                        tabs.splice(tabIndex, 1);

                        // Find the position after all pinned tabs
                        const pinnedCount = tabs.filter((t) => t.isPinned).length;
                        tabs.splice(pinnedCount, 0, tab);

                        return { tabs };
                    });
                },

                unpinTab: (id) => {
                    set((state) => ({
                        tabs: state.tabs.map((tab) =>
                            tab.id === id ? { ...tab, isPinned: false } : tab
                        ),
                    }));
                },

                duplicateTab: (id) => {
                    const tab = get().tabs.find((t) => t.id === id);
                    if (tab) {
                        get().addTab(tab.url);
                    }
                },

                closeOtherTabs: (id) => {
                    const tab = get().tabs.find((t) => t.id === id);
                    if (tab) {
                        set({
                            tabs: [tab],
                            activeTabId: id,
                        });
                    }
                },

                closeTabsToRight: (id) => {
                    const { tabs } = get();
                    const tabIndex = tabs.findIndex((t) => t.id === id);
                    if (tabIndex !== -1) {
                        set({
                            tabs: tabs.slice(0, tabIndex + 1),
                        });
                    }
                },

                // Reopen last closed tab (Ctrl+Shift+T)
                reopenLastClosedTab: () => {
                    const { closedTabsStack } = get();
                    if (closedTabsStack.length === 0) return;

                    const [tabToReopen, ...remainingStack] = closedTabsStack;
                    // Create new tab with the URL of the closed tab
                    const newTab = createNewTab(tabToReopen.url);
                    set((state) => ({
                        tabs: [...state.tabs, newTab],
                        activeTabId: newTab.id,
                        closedTabsStack: remainingStack,
                    }));
                },

                // Navigate to next tab within workspace (Ctrl+Tab)
                nextTab: () => {
                    const { tabs, activeTabId } = get();
                    const activeWorkspaceId = useSettingsStore.getState().activeWorkspaceId;
                    const workspaceTabs = tabs.filter(t => (t.workspaceId || 'work') === activeWorkspaceId);
                    if (workspaceTabs.length <= 1) return;

                    const currentIndex = workspaceTabs.findIndex(t => t.id === activeTabId);
                    if (currentIndex === -1) {
                        // Active tab not in this workspace - jump to first workspace tab
                        set({ activeTabId: workspaceTabs[0].id });
                        return;
                    }

                    const nextIndex = currentIndex === workspaceTabs.length - 1 ? 0 : currentIndex + 1;
                    set({ activeTabId: workspaceTabs[nextIndex].id });
                },

                // Navigate to previous tab within workspace (Ctrl+Shift+Tab)
                prevTab: () => {
                    const { tabs, activeTabId } = get();
                    const activeWorkspaceId = useSettingsStore.getState().activeWorkspaceId;
                    const workspaceTabs = tabs.filter(t => (t.workspaceId || 'work') === activeWorkspaceId);
                    if (workspaceTabs.length <= 1) return;

                    const currentIndex = workspaceTabs.findIndex(t => t.id === activeTabId);
                    if (currentIndex === -1) {
                        set({ activeTabId: workspaceTabs[workspaceTabs.length - 1].id });
                        return;
                    }

                    const prevIndex = currentIndex === 0 ? workspaceTabs.length - 1 : currentIndex - 1;
                    set({ activeTabId: workspaceTabs[prevIndex].id });
                },

                // Navigation actions - these will be called by UI, webview handles actual navigation
                goBack: (id) => {
                    // Trigger custom event that webview will listen to
                    window.dispatchEvent(new CustomEvent('webview-go-back', { detail: { tabId: id } }));
                },

                goForward: (id) => {
                    window.dispatchEvent(new CustomEvent('webview-go-forward', { detail: { tabId: id } }));
                },

                reload: (id) => {
                    window.dispatchEvent(new CustomEvent('webview-reload', { detail: { tabId: id } }));
                },

                stop: (id) => {
                    window.dispatchEvent(new CustomEvent('webview-stop', { detail: { tabId: id } }));
                },

                // Reset tabs to a single fresh tab (for new windows)
                resetToDefaultTab: () => {
                    const newTab = createNewTab();
                    set({
                        tabs: [newTab],
                        activeTabId: newTab.id,
                        closedTabsStack: [],
                    });
                },
            }),
            {
                name: 'tab-storage',
                partialize: (state) => ({
                    tabs: state.tabs,
                    activeTabId: state.activeTabId,
                }),
            }
        ),
        { name: 'TabStore' }
    )
);

// Initialize active tab if null or empty
const { tabs: initTabs, activeTabId: initActiveTabId } = useTabStore.getState();
if (initTabs.length === 0) {
    const defaultTab = createNewTab('about:blank');
    useTabStore.setState({ tabs: [defaultTab], activeTabId: defaultTab.id });
} else if (!initActiveTabId) {
    useTabStore.setState({ activeTabId: initTabs[0].id });
}


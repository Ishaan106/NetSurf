import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useTabStore } from './tabStore';

export interface AgentWebview {
    id: string;
    url: string;
    title: string;
    label: string;        // task label shown in header (e.g. "Competitor pricing")
    favicon?: string;
    webContentsId: number; // synced from webview dom-ready
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
}

interface AgentWorkspaceState {
    isOpen: boolean;
    workspaceTabId: string | null;  // ID of the workspace tab in tabStore
    webviews: AgentWebview[];
    focusedId: string | null;
}

interface AgentWorkspaceActions {
    openWorkspace: () => void;
    closeWorkspace: () => void;
    addWebview: (label?: string, url?: string) => string;
    removeWebview: (id: string) => void;
    updateWebview: (id: string, updates: Partial<AgentWebview>) => void;
    setFocused: (id: string | null) => void;
    clearAll: () => void;
}

type AgentWorkspaceStore = AgentWorkspaceState & AgentWorkspaceActions;

const generateId = () => `aw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const useAgentWorkspaceStore = create<AgentWorkspaceStore>()(
    devtools(
        (set, get) => ({
            isOpen: false,
            workspaceTabId: null,
            webviews: [],
            focusedId: null,

            openWorkspace: () => {
                const state = get();
                if (state.isOpen && state.workspaceTabId) {
                    // Already open — just switch to the workspace tab
                    useTabStore.getState().setActiveTab(state.workspaceTabId);
                    return;
                }

                // Create first webview if needed
                const newWebviews = state.webviews.length === 0
                    ? [{
                        id: generateId(),
                        url: 'about:blank',
                        title: 'Agent Tab',
                        label: 'Browser',
                        webContentsId: 0,
                        isLoading: false,
                        canGoBack: false,
                        canGoForward: false,
                    }]
                    : state.webviews;

                // Create a workspace tab in tabStore
                const tabId = useTabStore.getState().addTab('workspace:shadow');
                useTabStore.getState().updateTab(tabId, { title: 'Shadow Workspace' });

                set({
                    isOpen: true,
                    workspaceTabId: tabId,
                    webviews: newWebviews,
                    focusedId: newWebviews[0]?.id || null,
                });
            },

            closeWorkspace: () => {
                const { workspaceTabId } = get();
                // Close the workspace tab
                if (workspaceTabId) {
                    useTabStore.getState().closeTab(workspaceTabId);
                }
                set({ isOpen: false, workspaceTabId: null });
            },

            addWebview: (label = 'Browser', url = 'about:blank') => {
                const id = generateId();
                set((state) => ({
                    webviews: [...state.webviews, {
                        id,
                        url,
                        title: url === 'about:blank' ? 'New Tab' : url,
                        label,
                        webContentsId: 0,
                        isLoading: url !== 'about:blank',
                        canGoBack: false,
                        canGoForward: false,
                    }],
                    focusedId: id,
                }));
                return id;
            },

            removeWebview: (id: string) => {
                set((state) => {
                    const filtered = state.webviews.filter(w => w.id !== id);
                    const newFocused = state.focusedId === id
                        ? (filtered[filtered.length - 1]?.id || null)
                        : state.focusedId;
                    // If no webviews left, close workspace
                    if (filtered.length === 0) {
                        const { workspaceTabId } = get();
                        if (workspaceTabId) {
                            useTabStore.getState().closeTab(workspaceTabId);
                        }
                        return { webviews: [], focusedId: null, isOpen: false, workspaceTabId: null };
                    }
                    return { webviews: filtered, focusedId: newFocused };
                });
            },

            updateWebview: (id: string, updates: Partial<AgentWebview>) => {
                set((state) => ({
                    webviews: state.webviews.map(w =>
                        w.id === id ? { ...w, ...updates } : w
                    ),
                }));
            },

            setFocused: (id: string | null) => {
                set({ focusedId: id });
            },

            clearAll: () => {
                const { workspaceTabId } = get();
                if (workspaceTabId) {
                    useTabStore.getState().closeTab(workspaceTabId);
                }
                set({ webviews: [], focusedId: null, isOpen: false, workspaceTabId: null });
            },
        }),
        { name: 'AgentWorkspaceStore' }
    )
);

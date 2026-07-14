/**
 * Ad Blocker Store
 * Zustand store for ad blocker UI state
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AdBlockState {
    enabled: boolean;
    whitelistedDomains: string[];
    customRules: string[];
    lastUpdate: number;
    totalBlockedCount: number;
    blockedByDomain: Record<string, number>;
}

interface AdBlockStats {
    sessionBlocked: number;
    totalBlocked: number;
    currentPageBlocked: number;
    currentDomain: string;
    blockedByDomain?: Record<string, number>;
}

interface AdBlockStore {
    // State
    state: AdBlockState | null;
    stats: AdBlockStats | null;
    isLoading: boolean;
    isPanelOpen: boolean;

    // Actions
    loadState: () => Promise<void>;
    loadStats: () => Promise<void>;
    setEnabled: (enabled: boolean) => Promise<void>;
    toggleEnabled: () => Promise<void>;
    addToWhitelist: (domain: string) => Promise<void>;
    removeFromWhitelist: (domain: string) => Promise<void>;
    addCustomRule: (rule: string) => Promise<void>;
    removeCustomRule: (rule: string) => Promise<void>;
    refreshFilters: () => Promise<void>;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
}

export const useAdBlockStore = create<AdBlockStore>()(
    devtools(
        (set, get) => ({
            state: null,
            stats: null,
            isLoading: false,
            isPanelOpen: false,

            loadState: async () => {
                try {
                    const state = await window.electronAPI?.adblock.getState();
                    set({ state });
                } catch (error) {
                    console.error('[AdBlockStore] Failed to load state:', error);
                }
            },

            loadStats: async () => {
                try {
                    const stats = await window.electronAPI?.adblock.getStats();
                    set({ stats });
                } catch (error) {
                    console.error('[AdBlockStore] Failed to load stats:', error);
                }
            },

            setEnabled: async (enabled: boolean) => {
                set({ isLoading: true });
                try {
                    await window.electronAPI?.adblock.setEnabled(enabled);
                    await get().loadState();
                } catch (error) {
                    console.error('[AdBlockStore] Failed to set enabled:', error);
                } finally {
                    set({ isLoading: false });
                }
            },

            toggleEnabled: async () => {
                const { state } = get();
                if (state) {
                    await get().setEnabled(!state.enabled);
                }
            },

            addToWhitelist: async (domain: string) => {
                set({ isLoading: true });
                try {
                    await window.electronAPI?.adblock.addToWhitelist(domain);
                    await get().loadState();
                } catch (error) {
                    console.error('[AdBlockStore] Failed to add to whitelist:', error);
                } finally {
                    set({ isLoading: false });
                }
            },

            removeFromWhitelist: async (domain: string) => {
                set({ isLoading: true });
                try {
                    await window.electronAPI?.adblock.removeFromWhitelist(domain);
                    await get().loadState();
                } catch (error) {
                    console.error('[AdBlockStore] Failed to remove from whitelist:', error);
                } finally {
                    set({ isLoading: false });
                }
            },

            addCustomRule: async (rule: string) => {
                set({ isLoading: true });
                try {
                    await window.electronAPI?.adblock.addCustomRule(rule);
                    await get().loadState();
                } catch (error) {
                    console.error('[AdBlockStore] Failed to add custom rule:', error);
                } finally {
                    set({ isLoading: false });
                }
            },

            removeCustomRule: async (rule: string) => {
                set({ isLoading: true });
                try {
                    await window.electronAPI?.adblock.removeCustomRule(rule);
                    await get().loadState();
                } catch (error) {
                    console.error('[AdBlockStore] Failed to remove custom rule:', error);
                } finally {
                    set({ isLoading: false });
                }
            },

            refreshFilters: async () => {
                set({ isLoading: true });
                try {
                    await window.electronAPI?.adblock.refreshFilters();
                    await get().loadState();
                } catch (error) {
                    console.error('[AdBlockStore] Failed to refresh filters:', error);
                } finally {
                    set({ isLoading: false });
                }
            },

            openPanel: () => set({ isPanelOpen: true }),
            closePanel: () => set({ isPanelOpen: false }),
            togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
        }),
        { name: 'AdBlockStore' }
    )
);

// Initialize store on load
if (typeof window !== 'undefined' && window.electronAPI?.adblock) {
    useAdBlockStore.getState().loadState();
    useAdBlockStore.getState().loadStats();
}

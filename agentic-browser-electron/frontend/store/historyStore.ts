/**
 * History Store — Per-workspace browsing history
 * Persisted in localStorage via zustand/middleware persist
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface HistoryEntry {
    id: string;
    url: string;
    title: string;
    favicon?: string;
    timestamp: number;
    workspaceId: string;
}

interface HistoryState {
    entries: HistoryEntry[];
}

interface HistoryActions {
    addEntry: (entry: Omit<HistoryEntry, 'id'>) => void;
    clearWorkspaceHistory: (workspaceId: string) => void;
    clearAllHistory: () => void;
    getWorkspaceHistory: (workspaceId: string) => HistoryEntry[];
    searchWorkspaceHistory: (workspaceId: string, query: string) => HistoryEntry[];
    removeEntry: (id: string) => void;
}

type HistoryStore = HistoryState & HistoryActions;

const generateId = () => `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Maximum entries per workspace
const MAX_ENTRIES_PER_WORKSPACE = 500;

export const useHistoryStore = create<HistoryStore>()(
    devtools(
        persist(
            (set, get) => ({
                entries: [],

                addEntry: (entry) => {
                    const newEntry: HistoryEntry = {
                        ...entry,
                        id: generateId(),
                    };

                    set((state) => {
                        // Deduplicate: remove any existing entry with same URL in same workspace within last 5 minutes
                        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                        const dedupedEntries = state.entries.filter((e) => {
                            if (e.url === entry.url && e.workspaceId === entry.workspaceId) {
                                return e.timestamp < fiveMinutesAgo; // Keep old entries, remove recent dups
                            }
                            return true;
                        });

                        // Enforce per-workspace limit
                        const workspaceEntries = dedupedEntries.filter(e => e.workspaceId === entry.workspaceId);
                        let trimmedEntries = dedupedEntries;
                        if (workspaceEntries.length >= MAX_ENTRIES_PER_WORKSPACE) {
                            // Sort by timestamp desc and remove the oldest workspace entries
                            const sorted = [...workspaceEntries].sort((a, b) => b.timestamp - a.timestamp);
                            const toRemove = new Set(sorted.slice(MAX_ENTRIES_PER_WORKSPACE - 1).map(e => e.id));
                            trimmedEntries = dedupedEntries.filter(e => !toRemove.has(e.id));
                        }

                        return { entries: [newEntry, ...trimmedEntries] };
                    });
                },

                clearWorkspaceHistory: (workspaceId) => {
                    set((state) => ({
                        entries: state.entries.filter(e => e.workspaceId !== workspaceId),
                    }));
                },

                clearAllHistory: () => {
                    set({ entries: [] });
                },

                getWorkspaceHistory: (workspaceId) => {
                    return get().entries
                        .filter(e => e.workspaceId === workspaceId)
                        .sort((a, b) => b.timestamp - a.timestamp);
                },

                searchWorkspaceHistory: (workspaceId, query) => {
                    if (!query.trim()) return get().getWorkspaceHistory(workspaceId);
                    const q = query.toLowerCase();
                    return get().entries
                        .filter(e =>
                            e.workspaceId === workspaceId &&
                            (e.title?.toLowerCase().includes(q) || e.url?.toLowerCase().includes(q))
                        )
                        .sort((a, b) => b.timestamp - a.timestamp);
                },

                removeEntry: (id) => {
                    set((state) => ({
                        entries: state.entries.filter(e => e.id !== id),
                    }));
                },
            }),
            {
                name: 'netsurf-history',
                partialize: (state) => ({ entries: state.entries }),
            }
        ),
        { name: 'HistoryStore' }
    )
);

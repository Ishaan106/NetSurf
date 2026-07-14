import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, ChevronRight, Plus, X, Star } from 'lucide-react';
import { useSettingsStore, useTabStore } from '@/store';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import clsx from 'clsx';

// ─── Bookmark Store (persisted) ─────────────────────────────────────────

export interface Bookmark {
    id: string;
    title: string;
    url?: string;
    favicon?: string;
    isFolder?: boolean;
    children?: Bookmark[];
}

interface BookmarkStore {
    bookmarks: Bookmark[];
    addBookmark: (bm: Bookmark) => void;
    removeBookmark: (id: string) => void;
    reorderBookmarks: (bookmarks: Bookmark[]) => void;
}



export const useBookmarkStore = create<BookmarkStore>()(
    persist(
        (set) => ({
            bookmarks: [],
            addBookmark: (bm) => set((s) => ({ bookmarks: [...s.bookmarks, bm] })),
            removeBookmark: (id) => set((s) => ({ bookmarks: s.bookmarks.filter(b => b.id !== id) })),
            reorderBookmarks: (bookmarks) => set({ bookmarks }),
        }),
        { name: 'netsurf-bookmarks-v2' }
    )
);

// ─── BookmarkItem ───────────────────────────────────────────────────────

interface BookmarkItemProps {
    bookmark: Bookmark;
    onNavigate: (url: string, title: string) => void;
    onDelete: (id: string) => void;
}

const BookmarkItem = React.memo(function BookmarkItem({ bookmark, onNavigate, onDelete }: BookmarkItemProps) {
    const [showFolder, setShowFolder] = useState(false);

    const handleClick = () => {
        if (bookmark.isFolder) setShowFolder(!showFolder);
        else if (bookmark.url) onNavigate(bookmark.url, bookmark.title);
    };

    return (
        <div className="relative">
            <button
                className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs',
                    'text-chrome-text-secondary hover:text-chrome-text',
                    'hover:bg-chrome-surface-hover transition-colors duration-100',
                    'max-w-[180px] group'
                )}
                onClick={handleClick}
                title={bookmark.url || bookmark.title}
            >
                {bookmark.isFolder ? (
                    <Folder className="w-3.5 h-3.5 flex-shrink-0 text-chrome-text-secondary" />
                ) : bookmark.favicon ? (
                    <img src={bookmark.favicon} alt="" className="w-3.5 h-3.5 flex-shrink-0 rounded"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                    <div className="w-3.5 h-3.5 flex-shrink-0 bg-chrome-surface-active rounded" />
                )}
                <span className="truncate">{bookmark.title}</span>
                {bookmark.isFolder && <ChevronRight className={clsx('w-3 h-3 flex-shrink-0 transition-transform', showFolder && 'rotate-90')} />}
                {!bookmark.isFolder && (
                    <span className="hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-sm hover:bg-red-500/20 flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); onDelete(bookmark.id); }}>
                        <X className="w-2.5 h-2.5 text-chrome-text-muted hover:text-red-400" />
                    </span>
                )}
            </button>

            <AnimatePresence>
                {showFolder && bookmark.children && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute top-full left-0 mt-0.5 py-1 bg-chrome-surface border border-chrome-border rounded-lg shadow-lg z-50 min-w-[160px]"
                    >
                        {bookmark.children.map(child => (
                            <button key={child.id}
                                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-chrome-text-secondary hover:text-chrome-text hover:bg-chrome-surface-hover transition-colors"
                                onClick={() => { if (child.url) onNavigate(child.url, child.title); setShowFolder(false); }}>
                                {child.favicon ? (
                                    <img src={child.favicon} alt="" className="w-3 h-3 rounded" />
                                ) : (
                                    <div className="w-3 h-3 bg-chrome-surface-active rounded" />
                                )}
                                <span className="truncate">{child.title}</span>
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

// ─── BookmarkBar ────────────────────────────────────────────────────────

export function BookmarkBar() {
    const showBookmarkBar = useSettingsStore((s) => s.showBookmarkBar);
    const activeTabId = useTabStore((s) => s.activeTabId);
    const updateTab = useTabStore((s) => s.updateTab);
    const tabs = useTabStore((s) => s.tabs);
    const activeTab = tabs.find(t => t.id === activeTabId);

    const bookmarks = useBookmarkStore((s) => s.bookmarks);
    const addBookmark = useBookmarkStore((s) => s.addBookmark);
    const removeBookmark = useBookmarkStore((s) => s.removeBookmark);

    const handleNavigate = useCallback((url: string, title: string) => {
        if (activeTabId) updateTab(activeTabId, { url, title });
    }, [activeTabId, updateTab]);

    const handleDelete = useCallback((id: string) => {
        removeBookmark(id);
    }, [removeBookmark]);

    const handleAddCurrent = useCallback(() => {
        if (!activeTab || !activeTab.url || activeTab.url === 'about:blank') return;
        // Don't add duplicates
        if (bookmarks.some(b => b.url === activeTab.url)) return;
        addBookmark({
            id: Date.now().toString(),
            title: activeTab.title || activeTab.url,
            url: activeTab.url,
            favicon: activeTab.favicon,
        });
    }, [activeTab, bookmarks, addBookmark]);

    if (!showBookmarkBar) return null;

    const isCurrentBookmarked = activeTab?.url && bookmarks.some(b => b.url === activeTab.url);

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center h-7 px-2 bg-chrome-bg border-b border-chrome-border overflow-visible"
        >
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1">
                {bookmarks.map((bookmark) => (
                    <BookmarkItem key={bookmark.id} bookmark={bookmark} onNavigate={handleNavigate} onDelete={handleDelete} />
                ))}
            </div>
            <button
                onClick={handleAddCurrent}
                className={clsx(
                    'flex items-center justify-center w-5 h-5 rounded transition-colors flex-shrink-0 ml-1',
                    isCurrentBookmarked ? 'text-yellow-500' : 'text-chrome-text-muted hover:bg-chrome-surface-hover'
                )}
                title={isCurrentBookmarked ? 'Already bookmarked' : 'Bookmark current page (Ctrl+D)'}
                disabled={!!isCurrentBookmarked}
            >
                {isCurrentBookmarked ? <Star className="w-3 h-3 fill-current" /> : <Plus className="w-3 h-3" />}
            </button>
        </motion.div>
    );
}

export default BookmarkBar;

/**
 * SidebarTabItem — One open tab row inside a workspace's tab list.
 * Shows favicon, title, loading spinner, and a close button on hover.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Lock, X } from 'lucide-react';
import clsx from 'clsx';
import type { Tab } from '@/store/tabStore';

interface Props {
    tab: Tab;
    isActive: boolean;
    onSelect: () => void;
    onClose: (e: React.MouseEvent) => void;
}

export function SidebarTabItem({ tab, isActive, onSelect, onClose }: Props) {
    const [faviconError, setFaviconError] = useState(false);

    const displayUrl = (url: string) => {
        if (!url || url.startsWith('about:')) return 'New Tab';
        try { return new URL(url).hostname.replace(/^www\./, ''); }
        catch { return url; }
    };

    return (
        <motion.button
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.1 }}
            onClick={onSelect}
            className={clsx(
                'group flex w-full min-h-[38px] items-center gap-2.5 rounded-xl px-3.5 py-2',
                'text-left transition-all duration-150 border select-none',
                isActive
                    ? 'bg-chrome-surface-solid text-chrome-text shadow-sm border-chrome-border-strong font-semibold'
                    : 'border-transparent text-chrome-text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-chrome-text',
            )}
        >
            {/* Active indicator dot */}
            {isActive && (
                <span className="w-2 h-2 rounded-full bg-chrome-accent shrink-0 -ml-0.5" />
            )}

            {/* Favicon / spinner */}
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {tab.isLoading ? (
                    <motion.span
                        className="block h-3.5 w-3.5 rounded-full border border-chrome-accent border-t-transparent"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
                    />
                ) : tab.favicon && !faviconError ? (
                    <img
                        src={tab.favicon}
                        alt=""
                        className="h-4 w-4 rounded-sm object-contain"
                        onError={() => setFaviconError(true)}
                    />
                ) : tab.isSecure ? (
                    <Lock className={clsx("h-3.5 w-3.5", isActive ? "text-chrome-text-secondary" : "text-green-500/70")} />
                ) : (
                    <Globe className={clsx("h-3.5 w-3.5", isActive ? "text-chrome-text-secondary" : "opacity-30")} />
                )}
            </span>

            {/* Title */}
            <span className="flex-1 truncate text-[13px]">
                {tab.title || displayUrl(tab.url)}
            </span>

            {/* Close */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onClose(e);
                }}
                className="shrink-0 flex h-4.5 w-4.5 items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-chrome-surface-hover text-chrome-text-secondary hover:text-chrome-text"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </motion.button>
    );
}

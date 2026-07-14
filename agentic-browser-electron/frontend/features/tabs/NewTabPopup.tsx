import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Star, Zap } from 'lucide-react';
import { useTabStore } from '@/store';
import clsx from 'clsx';

interface NewTabPopupProps {
    isOpen: boolean;
    onClose: () => void;
}

// Popular quick links
const QUICK_LINKS = [
    { name: 'Google', url: 'https://google.com', color: 'from-blue-500 to-blue-600', icon: '🔍' },
    { name: 'YouTube', url: 'https://youtube.com', color: 'from-red-500 to-red-600', icon: '▶️' },
    { name: 'GitHub', url: 'https://github.com', color: 'from-gray-700 to-gray-900', icon: '🐙' },
    { name: 'Twitter', url: 'https://twitter.com', color: 'from-sky-400 to-sky-600', icon: '🐦' },
    { name: 'Reddit', url: 'https://reddit.com', color: 'from-orange-500 to-orange-600', icon: '🤖' },
    { name: 'LinkedIn', url: 'https://linkedin.com', color: 'from-blue-600 to-blue-700', icon: '💼' },
    { name: 'Netflix', url: 'https://netflix.com', color: 'from-red-600 to-red-700', icon: '📺' },
    { name: 'Amazon', url: 'https://amazon.com', color: 'from-orange-400 to-yellow-500', icon: '📦' },
];

export function NewTabPopup({ isOpen, onClose }: NewTabPopupProps) {
    const [searchValue, setSearchValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const addTab = useTabStore((s) => s.addTab);

    // Auto-focus input when popup opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Keyboard focus trap
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape to close
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }

            // Tab key - keep focus in popup
            if (e.key === 'Tab') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!searchValue.trim()) {
            onClose();
            return;
        }

        // Determine if it's a URL or search query
        let url = searchValue.trim();

        // Check if it's a valid URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            // Check if it looks like a domain
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                // Treat as search query
                url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
            }
        }

        addTab(url);
        setSearchValue('');
        onClose();
    };

    const handleQuickLink = (url: string) => {
        addTab(url);
        setSearchValue('');
        onClose();
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    onClick={handleBackdropClick}
                    style={{ backdropFilter: 'blur(12px)' }}
                >
                    {/* Enhanced Backdrop */}
                    <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/40 to-black/50" />

                    {/* Popup Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{
                            duration: 0.3,
                            ease: [0.34, 1.56, 0.64, 1]
                        }}
                        className={clsx(
                            'relative w-full max-w-3xl mx-4',
                            'bg-chrome-bg/98 backdrop-blur-2xl',
                            'border border-chrome-border rounded-3xl shadow-2xl',
                            'overflow-hidden'
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Decorative gradient overlay */}
                        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-chrome-accent/5 to-transparent pointer-events-none" />

                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className={clsx(
                                'absolute top-5 right-5 p-2 rounded-xl z-10',
                                'hover:bg-chrome-surface-hover transition-all duration-200',
                                'text-chrome-text-secondary hover:text-chrome-text'
                            )}
                            aria-label="Close"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        {/* Content */}
                        <div className="relative p-10">
                            {/* Header */}
                            <div className="text-center mb-8">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.1, type: 'spring' }}
                                    className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-gradient-to-br from-chrome-accent/20 to-chrome-accent/10 rounded-2xl"
                                >
                                    <Zap className="w-8 h-8 text-chrome-accent" />
                                </motion.div>
                                <h2 className="text-3xl font-bold text-chrome-text mb-3 bg-gradient-to-br from-chrome-text to-chrome-text-secondary bg-clip-text">
                                    Open New Tab
                                </h2>
                                <p className="text-sm text-chrome-text-secondary">
                                    Enter a URL or search the web
                                </p>
                            </div>

                            {/* Search Form */}
                            <form onSubmit={handleSubmit} className="mb-8">
                                <div className="relative group">
                                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-chrome-text-secondary group-focus-within:text-chrome-accent transition-colors" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value)}
                                        placeholder="Search or enter address"
                                        className={clsx(
                                            'w-full pl-14 pr-6 py-5 rounded-2xl text-base',
                                            'bg-chrome-surface border-2 border-chrome-border',
                                            'text-chrome-text placeholder:text-chrome-text-secondary',
                                            'focus:outline-none focus:border-chrome-accent focus:bg-chrome-surface',
                                            'transition-all duration-200'
                                        )}
                                    />
                                </div>

                                {/* Keyboard shortcut hints */}
                                <div className="mt-4 flex items-center justify-center gap-6 text-xs text-chrome-text-secondary">
                                    <div className="flex items-center gap-2">
                                        <kbd className="px-3 py-1.5 bg-chrome-surface rounded-lg border-2 border-chrome-border font-mono font-bold">
                                            ↵
                                        </kbd>
                                        <span>Open</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <kbd className="px-3 py-1.5 bg-chrome-surface rounded-lg border-2 border-chrome-border font-mono font-bold">
                                            Esc
                                        </kbd>
                                        <span>Close</span>
                                    </div>
                                </div>
                            </form>

                            {/* Quick Links */}
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <Star className="w-4 h-4 text-chrome-accent" />
                                    <h3 className="text-sm font-semibold text-chrome-text uppercase tracking-wide">
                                        Quick Links
                                    </h3>
                                </div>
                                <div className="grid grid-cols-4 gap-3">
                                    {QUICK_LINKS.map((link, idx) => (
                                        <motion.button
                                            key={link.url}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.05 * idx }}
                                            onClick={() => handleQuickLink(link.url)}
                                            className={clsx(
                                                'group relative p-4 rounded-2xl border-2 border-chrome-border',
                                                'bg-chrome-surface backdrop-blur-sm',
                                                'hover:bg-chrome-surface hover:border-chrome-accent',
                                                'transition-all duration-200',
                                                'flex flex-col items-center gap-3'
                                            )}
                                        >
                                            <div className={clsx(
                                                'w-14 h-14 rounded-2xl flex items-center justify-center text-2xl',
                                                'bg-gradient-to-br shadow-lg',
                                                'group-hover:scale-110 transition-transform duration-200',
                                                link.color
                                            )}>
                                                {link.icon}
                                            </div>
                                            <span className="text-xs font-medium text-chrome-text-secondary group-hover:text-chrome-text transition-colors">
                                                {link.name}
                                            </span>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default NewTabPopup;

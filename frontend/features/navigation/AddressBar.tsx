import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Search, Sparkles, Star, StarOff, Lock, AlertTriangle } from 'lucide-react';
import { useTabStore, useUIStore } from '@/store';
import clsx from 'clsx';

interface Suggestion {
    id: string;
    type: 'history' | 'bookmark' | 'search';
    title: string;
    url: string;
    icon?: string;
}

export function AddressBar() {
    const activeTabId = useTabStore((s) => s.activeTabId);
    const tabs = useTabStore((s) => s.tabs);
    const updateTab = useTabStore((s) => s.updateTab);
    const isAddressBarFocused = useUIStore((s) => s.isAddressBarFocused);
    const focusAddressBar = useUIStore((s) => s.focusAddressBar);
    const blurAddressBar = useUIStore((s) => s.blurAddressBar);

    const inputRef = useRef<HTMLInputElement>(null);
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isBookmarked, setIsBookmarked] = useState(false);

    const activeTab = tabs.find((t) => t.id === activeTabId);
    const currentUrl = activeTab?.url || '';
    const isLoading = activeTab?.isLoading || false;

    const domainOnly = activeTab?.url && activeTab.url !== 'about:blank'
        ? (() => {
            try {
                return new URL(activeTab.url).hostname.replace('www.', '');
            } catch {
                return activeTab.url;
            }
        })()
        : 'New Tab';

    // Sync input with active tab URL when not focused
    useEffect(() => {
        if (!isAddressBarFocused) {
            setInputValue(currentUrl === 'about:blank' ? '' : currentUrl);
        }
    }, [currentUrl, isAddressBarFocused]);

    // Focus input when address bar is activated
    useEffect(() => {
        if (isAddressBarFocused && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isAddressBarFocused]);

    const handleFocus = () => {
        focusAddressBar();
        if (inputRef.current) {
            inputRef.current.select();
        }
    };

    const handleBlur = () => {
        // Delay to allow click on suggestions
        setTimeout(() => {
            blurAddressBar();
            setSuggestions([]);
            setSelectedIndex(-1);
        }, 150);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInputValue(value);

        // Generate mock suggestions (would be replaced with real history/bookmarks)
        if (value.length > 2) {
            setSuggestions([
                { id: '1', type: 'search', title: `Search for "${value}"`, url: `https://google.com/search?q=${value}` },
                { id: '2', type: 'history', title: 'Example Site', url: `https://example.com/${value}` },
            ]);
        } else {
            setSuggestions([]);
        }
        setSelectedIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                    navigateTo(suggestions[selectedIndex].url);
                } else {
                    navigateTo(inputValue);
                }
                break;
            case 'Escape':
                e.preventDefault();
                inputRef.current?.blur();
                break;
        }
    };

    const navigateTo = useCallback((url: string) => {
        let finalUrl = url;

        // Add https:// if missing and looks like a URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            if (url.includes('.') && !url.includes(' ')) {
                finalUrl = `https://${url}`;
            } else {
                // Treat as search query
                finalUrl = `https://google.com/search?q=${encodeURIComponent(url)}`;
            }
        }

        if (activeTabId) {
            updateTab(activeTabId, {
                url: finalUrl,
                title: finalUrl,
                isLoading: true,
                isSecure: finalUrl.startsWith('https://'),
            });

            // Simulate page load completion
            setTimeout(() => {
                updateTab(activeTabId, { isLoading: false });
            }, 1500);
        }

        blurAddressBar();
        inputRef.current?.blur();
        setSuggestions([]);
    }, [activeTabId, updateTab, blurAddressBar]);

    const toggleBookmark = () => {
        setIsBookmarked(!isBookmarked);
        // TODO: Connect to bookmark store
    };

    const handleContainerClick = (e: React.MouseEvent) => {
        if (!isAddressBarFocused && inputRef.current) {
            e.preventDefault();
            e.stopPropagation();
            inputRef.current.focus();
        }
    };

    return (
        <div
            onClick={handleContainerClick}
            className={clsx(
                "relative cursor-pointer mx-auto flex-shrink z-50 transition-all duration-300 ease-out",
                isAddressBarFocused ? "w-full max-w-[520px]" : "w-[280px] max-w-[280px]"
            )}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
            <div
                className={clsx(
                    'relative flex h-9 w-full items-center rounded-full border px-4 transition-all duration-200 ease-spring overflow-hidden',
                    isAddressBarFocused
                        ? 'border-chrome-border-strong bg-chrome-surface-solid shadow-md'
                        : 'border-chrome-border bg-chrome-surface shadow-sm backdrop-blur-md hover:border-chrome-border-strong hover:bg-chrome-surface-solid/80'
                )}
            >
                {/* Presentation layer (centered domain) — shown only when blurred */}
                {!isAddressBarFocused && (
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 px-4 select-none text-[12.5px] font-bold text-chrome-text/80 pointer-events-none">
                        {currentUrl && currentUrl !== 'about:blank' && currentUrl.startsWith('https://') && (
                            <Lock className="w-3.5 h-3.5 text-emerald-500/80 shrink-0" />
                        )}
                        <span className="truncate">{domainOnly}</span>
                    </div>
                )}

                {/* Input and controls — always mounted to keep inputRef.current active */}
                <div className={clsx("flex items-center w-full gap-2 transition-opacity duration-150", !isAddressBarFocused && "opacity-0 pointer-events-none")}>
                    {/* Security/Search Icon */}
                    <div className="flex items-center gap-1.5 font-sans select-none transition-all duration-200">
                        {currentUrl && currentUrl !== 'about:blank' ? (
                            currentUrl.startsWith('https://') ? (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                                    <Lock className="w-3 h-3" />
                                    <span>Secure</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>Not Secure</span>
                                </div>
                            )
                        ) : (
                            <Search className="w-4 h-4 text-chrome-text-secondary/80" />
                        )}
                    </div>

                    {/* Input */}
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-grow min-w-0 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none text-[13px] font-semibold text-chrome-text placeholder:text-chrome-text-secondary/50 p-0"
                        placeholder="Search or enter website..."
                        value={inputValue}
                        onChange={handleInputChange}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        autoComplete="off"
                    />

                    <div className="flex items-center gap-2 pr-1 text-chrome-text-secondary/60">
                        <Sparkles className="h-4 w-4 text-indigo-500/75" />
                    </div>
                </div>

                {/* Bookmark button */}
                {currentUrl !== 'about:blank' && isAddressBarFocused && (
                    <motion.button
                        className="flex-shrink-0 ml-2 p-1.5 rounded-full hover:bg-chrome-surface-hover"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={toggleBookmark}
                        aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                    >
                        {isBookmarked ? (
                            <Star className="w-4 h-4 text-agent-warning fill-agent-warning" />
                        ) : (
                            <StarOff className="w-4 h-4 text-chrome-text-secondary" />
                        )}
                    </motion.button>
                )}

                {/* Loading Progress Bar */}
                {isLoading && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden bg-chrome-border">
                        <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
                            initial={{ width: '0%', x: '-100%' }}
                            animate={{
                                width: ['30%', '70%', '100%'],
                                x: ['0%', '0%', '0%']
                            }}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: 'easeInOut'
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Suggestions dropdown */}
            <AnimatePresence>
                {suggestions.length > 0 && isAddressBarFocused && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className={clsx(
                            'absolute top-full left-0 right-0 mt-2 py-2 z-50',
                            'glass-surface rounded-2xl shadow-xl'
                        )}
                    >
                        {suggestions.map((suggestion, index) => (
                            <div
                                key={suggestion.id}
                                className={clsx(
                                    'flex items-center px-4 py-2 cursor-pointer',
                                    index === selectedIndex
                                        ? 'bg-chrome-surface-hover'
                                        : 'hover:bg-chrome-surface-hover'
                                )}
                                onClick={() => navigateTo(suggestion.url)}
                            >
                                {suggestion.type === 'search' ? (
                                    <Search className="w-4 h-4 mr-3 text-chrome-text-secondary" />
                                ) : suggestion.type === 'bookmark' ? (
                                    <Star className="w-4 h-4 mr-3 text-agent-warning" />
                                ) : (
                                    <Globe className="w-4 h-4 mr-3 text-chrome-text-secondary" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-chrome-text truncate">{suggestion.title}</div>
                                    <div className="text-xs text-chrome-text-secondary truncate">{suggestion.url}</div>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default AddressBar;

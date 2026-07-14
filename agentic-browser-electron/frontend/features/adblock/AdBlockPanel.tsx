/**
 * AdBlockPanel
 * Slide-in panel with ad blocker controls
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Shield, ShieldOff, RefreshCw, Plus, Trash2,
    Globe
} from 'lucide-react';
import clsx from 'clsx';
import { useAdBlockStore } from '@/store/adblockStore';
import { useTabStore } from '@/store/tabStore';

export function AdBlockPanel() {
    const isPanelOpen = useAdBlockStore((s) => s.isPanelOpen);
    const closePanel = useAdBlockStore((s) => s.closePanel);
    const state = useAdBlockStore((s) => s.state);
    const stats = useAdBlockStore((s) => s.stats);
    const isLoading = useAdBlockStore((s) => s.isLoading);
    const toggleEnabled = useAdBlockStore((s) => s.toggleEnabled);
    const addToWhitelist = useAdBlockStore((s) => s.addToWhitelist);
    const removeFromWhitelist = useAdBlockStore((s) => s.removeFromWhitelist);
    const addCustomRule = useAdBlockStore((s) => s.addCustomRule);
    const removeCustomRule = useAdBlockStore((s) => s.removeCustomRule);
    const refreshFilters = useAdBlockStore((s) => s.refreshFilters);

    const activeTab = useTabStore((s) => {
        const id = s.activeTabId;
        return s.tabs.find(t => t.id === id);
    });

    const [customRuleInput, setCustomRuleInput] = useState('');
    const [activeSection, setActiveSection] = useState<'sites' | 'whitelist' | 'rules'>('sites');

    // Get current page domain
    const currentDomain = (() => {
        try {
            const url = activeTab?.url || '';
            if (!url || url === 'about:blank') return '';
            return new URL(url).hostname;
        } catch {
            return '';
        }
    })();

    const isCurrentSiteWhitelisted = currentDomain && state?.whitelistedDomains.includes(currentDomain);

    const handleToggleSiteWhitelist = async () => {
        if (!currentDomain) return;
        if (isCurrentSiteWhitelisted) {
            await removeFromWhitelist(currentDomain);
        } else {
            await addToWhitelist(currentDomain);
        }
    };

    const handleAddCustomRule = async () => {
        if (!customRuleInput.trim()) return;
        await addCustomRule(customRuleInput.trim());
        setCustomRuleInput('');
    };

    const formatDate = (timestamp: number) => {
        if (!timestamp) return 'Never';
        return new Date(timestamp).toLocaleDateString();
    };

    return (
        <AnimatePresence>
            {isPanelOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.15 }}
                    className={clsx(
                        'absolute top-12 right-2 z-50',
                        'w-[320px] max-h-[500px]',
                        'bg-chrome-surface border border-chrome-border',
                        'rounded-xl shadow-2xl overflow-hidden',
                        'flex flex-col'
                    )}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-chrome-border bg-chrome-surface-hover">
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-green-500" />
                            <h2 className="text-sm font-semibold text-chrome-text">Ad Blocker</h2>
                        </div>
                        <button
                            onClick={closePanel}
                            className="p-1 rounded-lg hover:bg-chrome-hover transition-colors"
                        >
                            <X className="w-4 h-4 text-chrome-text-secondary" />
                        </button>
                    </div>

                    {/* Main Toggle */}
                    <div className="px-4 py-3 border-b border-chrome-border">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {state?.enabled ? (
                                    <Shield className="w-8 h-8 text-green-500" />
                                ) : (
                                    <ShieldOff className="w-8 h-8 text-chrome-text-secondary" />
                                )}
                                <div>
                                    <p className="text-sm font-medium text-chrome-text">
                                        {state?.enabled ? 'Protection Active' : 'Protection Disabled'}
                                    </p>
                                    <p className="text-xs text-chrome-text-secondary">
                                        {stats?.totalBlocked.toLocaleString()} ads blocked total
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={toggleEnabled}
                                disabled={isLoading}
                                className={clsx(
                                    'relative w-12 h-6 rounded-full transition-colors',
                                    state?.enabled ? 'bg-green-500' : 'bg-chrome-border',
                                    isLoading && 'opacity-50'
                                )}
                            >
                                <span className={clsx(
                                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                                    state?.enabled ? 'left-7' : 'left-1'
                                )} />
                            </button>
                        </div>
                    </div>

                    {/* Current Site */}
                    {currentDomain && (
                        <div className="px-4 py-3 border-b border-chrome-border">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Globe className="w-4 h-4 text-chrome-text-secondary flex-shrink-0" />
                                    <span className="text-sm text-chrome-text truncate">{currentDomain}</span>
                                </div>
                                <button
                                    onClick={handleToggleSiteWhitelist}
                                    disabled={isLoading}
                                    className={clsx(
                                        'px-3 py-1 text-xs font-medium rounded-lg transition-colors',
                                        isCurrentSiteWhitelisted
                                            ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                            : 'bg-chrome-hover text-chrome-text hover:bg-chrome-border'
                                    )}
                                >
                                    {isCurrentSiteWhitelisted ? 'Remove from Whitelist' : 'Whitelist'}
                                </button>
                            </div>
                            <div className="mt-2 flex items-center gap-4 text-xs text-chrome-text-secondary">
                                <span>{stats?.currentPageBlocked || 0} blocked on this page</span>
                            </div>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="px-4 py-3 border-b border-chrome-border">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-chrome-bg rounded-lg p-3">
                                <p className="text-xs text-chrome-text-secondary">This Session</p>
                                <p className="text-lg font-semibold text-chrome-text">
                                    {stats?.sessionBlocked.toLocaleString() || 0}
                                </p>
                            </div>
                            <div className="bg-chrome-bg rounded-lg p-3">
                                <p className="text-xs text-chrome-text-secondary">All Time</p>
                                <p className="text-lg font-semibold text-chrome-text">
                                    {stats?.totalBlocked.toLocaleString() || 0}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Section Tabs */}
                    <div className="flex border-b border-chrome-border">
                        <button
                            onClick={() => setActiveSection('sites')}
                            className={clsx(
                                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                                activeSection === 'sites'
                                    ? 'text-blue-500 border-b-2 border-blue-500'
                                    : 'text-chrome-text-secondary hover:text-chrome-text'
                            )}
                        >
                            By Site
                        </button>
                        <button
                            onClick={() => setActiveSection('whitelist')}
                            className={clsx(
                                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                                activeSection === 'whitelist'
                                    ? 'text-blue-500 border-b-2 border-blue-500'
                                    : 'text-chrome-text-secondary hover:text-chrome-text'
                            )}
                        >
                            Whitelist ({state?.whitelistedDomains.length || 0})
                        </button>
                        <button
                            onClick={() => setActiveSection('rules')}
                            className={clsx(
                                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                                activeSection === 'rules'
                                    ? 'text-blue-500 border-b-2 border-blue-500'
                                    : 'text-chrome-text-secondary hover:text-chrome-text'
                            )}
                        >
                            Rules ({state?.customRules.length || 0})
                        </button>
                    </div>

                    {/* Section Content */}
                    <div className="flex-1 overflow-y-auto max-h-[200px]">
                        {activeSection === 'sites' && (
                            <div className="p-3">
                                {!stats?.blockedByDomain || Object.keys(stats.blockedByDomain).length === 0 ? (
                                    <p className="text-sm text-chrome-text-secondary text-center py-4">
                                        No blocked requests yet
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {Object.entries(stats.blockedByDomain)
                                            .sort(([, a], [, b]) => b - a)
                                            .slice(0, 20)
                                            .map(([domain, count]) => (
                                                <div
                                                    key={domain}
                                                    className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-chrome-hover"
                                                >
                                                    <span className="text-sm text-chrome-text truncate flex-1 mr-2">{domain}</span>
                                                    <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-0.5 rounded">
                                                        {count.toLocaleString()}
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {activeSection === 'whitelist' && (
                            <div className="p-3">
                                {state?.whitelistedDomains.length === 0 ? (
                                    <p className="text-sm text-chrome-text-secondary text-center py-4">
                                        No whitelisted sites
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {state?.whitelistedDomains.map((domain) => (
                                            <div
                                                key={domain}
                                                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-chrome-hover"
                                            >
                                                <span className="text-sm text-chrome-text">{domain}</span>
                                                <button
                                                    onClick={() => removeFromWhitelist(domain)}
                                                    className="p-1 text-chrome-text-secondary hover:text-red-500"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeSection === 'rules' && (
                            <div className="p-3">
                                <div className="flex gap-2 mb-3">
                                    <input
                                        type="text"
                                        value={customRuleInput}
                                        onChange={(e) => setCustomRuleInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomRule()}
                                        placeholder="Add custom filter rule..."
                                        className={clsx(
                                            'flex-1 px-3 py-1.5 text-sm rounded-lg',
                                            'bg-chrome-bg border border-chrome-border',
                                            'text-chrome-text placeholder:text-chrome-text-secondary',
                                            'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                                        )}
                                    />
                                    <button
                                        onClick={handleAddCustomRule}
                                        disabled={!customRuleInput.trim()}
                                        className={clsx(
                                            'p-2 rounded-lg transition-colors',
                                            customRuleInput.trim()
                                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                                : 'bg-chrome-hover text-chrome-text-secondary'
                                        )}
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                {state?.customRules.length === 0 ? (
                                    <p className="text-sm text-chrome-text-secondary text-center py-4">
                                        No custom rules
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {state?.customRules.map((rule) => (
                                            <div
                                                key={rule}
                                                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-chrome-hover"
                                            >
                                                <span className="text-xs text-chrome-text font-mono truncate">{rule}</span>
                                                <button
                                                    onClick={() => removeCustomRule(rule)}
                                                    className="p-1 text-chrome-text-secondary hover:text-red-500"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-chrome-border bg-chrome-surface-hover">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-chrome-text-secondary">
                                Last updated: {formatDate(state?.lastUpdate || 0)}
                            </span>
                            <button
                                onClick={refreshFilters}
                                disabled={isLoading}
                                className={clsx(
                                    'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg',
                                    'text-chrome-text-secondary hover:text-chrome-text',
                                    'hover:bg-chrome-hover transition-colors',
                                    isLoading && 'opacity-50'
                                )}
                            >
                                <RefreshCw className={clsx('w-3 h-3', isLoading && 'animate-spin')} />
                                Update Filters
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default AdBlockPanel;

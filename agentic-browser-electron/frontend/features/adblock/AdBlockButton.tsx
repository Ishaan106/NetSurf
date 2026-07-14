/**
 * AdBlockButton
 * Toolbar button with shield icon and blocked count badge
 */

import { useEffect } from 'react';
import { Shield, ShieldOff } from 'lucide-react';
import clsx from 'clsx';
import { useAdBlockStore } from '@/store/adblockStore';

interface AdBlockButtonProps {
    className?: string;
}

export function AdBlockButton({ className }: AdBlockButtonProps) {
    const state = useAdBlockStore((s) => s.state);
    const stats = useAdBlockStore((s) => s.stats);
    const loadState = useAdBlockStore((s) => s.loadState);
    const loadStats = useAdBlockStore((s) => s.loadStats);
    const togglePanel = useAdBlockStore((s) => s.togglePanel);
    const isPanelOpen = useAdBlockStore((s) => s.isPanelOpen);

    // Load state on mount and periodically refresh stats
    useEffect(() => {
        loadState();
        loadStats();

        // Refresh stats every 2 seconds to update blocked count
        const interval = setInterval(() => {
            loadStats();
        }, 2000);

        return () => clearInterval(interval);
    }, [loadState, loadStats]);

    const isEnabled = state?.enabled ?? true;
    const blockedCount = stats?.currentPageBlocked ?? 0;
    const totalBlocked = stats?.totalBlocked ?? 0;

    // Format count for display (e.g., 1.2K for 1200)
    const formatCount = (count: number): string => {
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return count.toString();
    };

    return (
        <button
            onClick={togglePanel}
            className={clsx(
                'relative flex items-center justify-center',
                'w-8 h-8 rounded-lg',
                'transition-all duration-200',
                'hover:bg-chrome-hover',
                isPanelOpen && 'bg-chrome-hover',
                className
            )}
            title={isEnabled
                ? `Ad Blocker: ${blockedCount} blocked on this page (${formatCount(totalBlocked)} total)`
                : 'Ad Blocker: Disabled'
            }
        >
            {isEnabled ? (
                <Shield className="w-4 h-4 text-green-500" />
            ) : (
                <ShieldOff className="w-4 h-4 text-chrome-text-secondary" />
            )}

            {/* Blocked count badge */}
            {isEnabled && blockedCount > 0 && (
                <span className={clsx(
                    'absolute -top-1 -right-1',
                    'min-w-[16px] h-4 px-1',
                    'flex items-center justify-center',
                    'text-[10px] font-medium text-white',
                    'bg-red-500 rounded-full',
                    'shadow-sm'
                )}>
                    {blockedCount > 99 ? '99+' : blockedCount}
                </span>
            )}
        </button>
    );
}

export default AdBlockButton;

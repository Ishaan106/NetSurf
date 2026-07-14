import React from 'react';
import { AddressBar } from '@/features/navigation';
import { useUIStore } from '@/store';
import { Settings, Zap } from 'lucide-react';
import clsx from 'clsx';

import { isMacOS } from '@/utils/helpers';

/**
 * TitleBar - Custom browser toolbar with navigation, omnibox, quick actions, and Electron controls.
 */
export function TitleBar() {
    const togglePanel = useUIStore((s) => s.togglePanel);
    const isPanelOpen = useUIStore((s) => s.isPanelOpen);
    const activePanel = useUIStore((s) => s.activePanel);
    const toggleSettings = useUIStore((s) => s.toggleSettings);

    const isAgentPanelOpen = isPanelOpen && activePanel === 'agent';
    const isMac = isMacOS();

    return (
        <div
            className="relative z-40 flex h-[var(--titlebar-height)] shrink-0 select-none items-center border-b border-chrome-border backdrop-blur-xl transition-all"
            style={{
                WebkitAppRegion: 'drag',
                backgroundColor: 'var(--chrome-surface-soft)',
                paddingLeft: isMac ? 'calc(env(titlebar-area-x, 0px) + 12px)' : '16px',
                paddingRight: isMac ? '16px' : 'calc(100vw - env(titlebar-area-width, 100vw) + 16px)'
            } as React.CSSProperties}
        >
            <div
                className="flex shrink-0 items-center gap-2 mr-2"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                <div className="flex items-center mr-1">
                    <img src="/netsurf.png" alt="NetSurf Logo" className="h-5 w-5 object-contain" />
                </div>
            </div>

            <div
                className="flex min-w-0 flex-1 justify-center px-3"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                <AddressBar />
            </div>

            <div
                className="flex shrink-0 items-center gap-2"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                <button
                    onClick={() => togglePanel('agent')}
                    className={clsx(
                        'flex h-8 items-center gap-1.5 rounded-lg border border-chrome-border px-3 text-[12px] font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm select-none',
                        isAgentPanelOpen 
                            ? 'bg-chrome-accent-light border-chrome-accent text-chrome-accent' 
                            : 'bg-chrome-surface-soft hover:bg-chrome-surface text-chrome-text-secondary hover:text-chrome-text'
                    )}
                >
                    <Zap className="h-3.5 w-3.5" />
                    <span>Skills</span>
                </button>

                <button
                    onClick={toggleSettings}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-chrome-border px-3 bg-chrome-surface-soft hover:bg-chrome-surface text-chrome-text-secondary hover:text-chrome-text text-[12px] font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm select-none"
                >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Personalization</span>
                </button>
            </div>
        </div>
    );
}

export default TitleBar;

import React from 'react';
import { CloudSun, Command, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { useUIStore } from '@/store';
import clsx from 'clsx';

export function StatusBar() {
    const focusAddressBar = useUIStore((s) => s.focusAddressBar);
    const [focusMode, setFocusMode] = React.useState(false);

    return (
        <footer className="flex items-center justify-between h-[36px] px-4 border-t border-chrome-border bg-chrome-surface backdrop-blur-md text-[11px] text-chrome-text-secondary select-none z-30">
            {/* Left: Weather and Location */}
            <div className="flex items-center gap-2">
                <CloudSun className="w-3.5 h-3.5 text-orange-400" />
                <span className="font-semibold text-chrome-text-secondary/90">San Francisco, 72°F</span>
            </div>

            {/* Center: Command Palette Trigger Button */}
            <div className="flex-1 flex justify-center">
                <button
                    onClick={() => {
                        focusAddressBar();
                        // Trigger event for command palette
                        window.dispatchEvent(new CustomEvent('netsurf:open-command-palette'));
                    }}
                    className="flex items-center gap-2 px-3 py-1 bg-chrome-surface-hover hover:bg-chrome-surface-hover hover:text-chrome-text border border-chrome-border rounded-full transition-all duration-200"
                >
                    <Command className="w-3 h-3 text-chrome-text-secondary/70" />
                    <span className="font-bold text-chrome-text-secondary/90">Command palette</span>
                    <span className="text-[9px] font-bold text-chrome-text-secondary/50 bg-chrome-surface border border-chrome-border px-1 py-0.2 rounded">
                        {window.navigator.platform.includes('Mac') ? '⌘ K' : 'Ctrl K'}
                    </span>
                </button>
            </div>

            {/* Right: Sync state & Focus Mode */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[10px] text-chrome-text-secondary/70">
                    <CheckCircle className="w-3 h-3 text-green-400/80" />
                    <span className="font-medium">Synced</span>
                </div>

                <button
                    onClick={() => {
                        setFocusMode(!focusMode);
                        // Trigger event or class toggles if needed
                        document.body.classList.toggle('focus-mode-active');
                    }}
                    className={clsx(
                        "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border transition-all",
                        focusMode
                            ? "bg-purple-500/10 border-purple-500/30 text-purple-400 font-bold"
                            : "border-transparent text-chrome-text-secondary hover:bg-chrome-surface-hover hover:text-chrome-text"
                    )}
                    title="Toggle Focus Mode"
                >
                    {focusMode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span className="font-semibold">Focus Mode</span>
                </button>
            </div>
        </footer>
    );
}

export default StatusBar;

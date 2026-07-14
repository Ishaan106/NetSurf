import { useState } from 'react';
import {
    X, Info, Mic, Keyboard, Palette, LayoutGrid, Sparkles
} from 'lucide-react';
import { useUIStore } from '@/store';
import clsx from 'clsx';

// Import sub-components
import { AppearanceTab } from '../features/settings/components/AppearanceTab';
import { WorkspacesTab } from '../features/settings/components/WorkspacesTab';
import { AITab } from '../features/settings/components/AITab';
import { VoiceTab } from '../features/settings/components/VoiceTab';
import { ShortcutsTab } from '../features/settings/components/ShortcutsTab';
import { AboutTab } from '../features/settings/components/AboutTab';

const NAV_ITEMS = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'workspaces', label: 'Workspaces', icon: LayoutGrid },
    { id: 'ai', label: 'AI Providers', icon: Sparkles },
    { id: 'voice', label: 'Voice & Audio', icon: Mic },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'about', label: 'About & Privacy', icon: Info },
];

export function SettingsPage() {
    const [tab, setTab] = useState('appearance');
    const closeSettings = useUIStore((s) => s.closeSettings);

    const handleClose = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const isSettingsWindow = urlParams.get('route') === 'settings';
        if (isSettingsWindow) {
            window.close();
        } else {
            closeSettings();
        }
    };

    return (
        <div className="relative flex flex-col w-full h-full max-h-screen bg-[var(--chrome-surface-solid)] text-chrome-text select-none animate-in fade-in zoom-in-95 duration-200 z-50">
            {/* Title Bar */}
            <div className="flex items-center gap-3 px-5 h-12 border-b border-chrome-border drag-region">
                <button 
                    onClick={handleClose} 
                    className="p-1.5 rounded-lg hover:bg-chrome-surface-hover text-chrome-text-secondary hover:text-chrome-text transition-colors no-drag-region"
                    title="Close settings"
                >
                    <X className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold uppercase tracking-wider text-chrome-text-muted">NetSurf Settings</span>
            </div>

            {/* Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Navigation Bar */}
                <nav className="w-56 border-r border-chrome-border p-3 flex flex-col gap-1 bg-chrome-surface">
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setTab(item.id)}
                            className={clsx(
                                "flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-semibold transition-all",
                                tab === item.id 
                                    ? "bg-chrome-surface-solid border-chrome-border text-chrome-text shadow-sm" 
                                    : "text-chrome-text-secondary hover:bg-chrome-surface-hover hover:text-chrome-text"
                            )}
                        >
                            <item.icon className="w-3.5 h-3.5" />
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>

                {/* Content Panel */}
                <div className="flex-1 overflow-y-auto p-8 max-w-3xl">
                    {tab === 'appearance' && <AppearanceTab />}
                    {tab === 'workspaces' && <WorkspacesTab />}
                    {tab === 'ai' && <AITab />}
                    {tab === 'voice' && <VoiceTab />}
                    {tab === 'shortcuts' && <ShortcutsTab />}
                    {tab === 'about' && <AboutTab />}
                </div>
            </div>
        </div>
    );
}

export default SettingsPage;

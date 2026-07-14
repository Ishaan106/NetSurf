import { Keyboard } from 'lucide-react';
import { useSettingsStore } from '@/store';
import clsx from 'clsx';

export function ShortcutsTab() {
    const shortcuts = useSettingsStore((s) => s.shortcuts);
    const toggleShortcut = useSettingsStore((s) => s.toggleShortcut);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-chrome-text flex items-center gap-2">
                    <Keyboard className="w-5 h-5 text-chrome-accent" />
                    Keyboard Shortcuts
                </h2>
                <p className="text-xs text-chrome-text-secondary">View and configure system keyboard shortcuts for power-user browsing controls.</p>
            </div>

            <div className="space-y-2 border border-chrome-border rounded-xl divide-y divide-chrome-border bg-chrome-surface max-h-[420px] overflow-y-auto scrollbar-none px-4">
                {shortcuts.map((sh) => (
                    <div key={sh.id} className="flex items-center justify-between py-3.5">
                        <div>
                            <span className="text-xs font-semibold text-chrome-text">{sh.action}</span>
                            <div className="flex gap-1 mt-1">
                                {sh.keys.map((key) => (
                                    <kbd key={key} className="px-1.5 py-0.5 rounded bg-chrome-bg border border-chrome-border text-[10px] font-bold font-mono text-chrome-text-secondary shadow-sm">
                                        {key}
                                    </kbd>
                                ))}
                            </div>
                        </div>
                        <button 
                            className={clsx(
                                "relative w-9 h-5 rounded-full transition-colors",
                                sh.enabled ? "bg-chrome-accent" : "bg-chrome-border"
                            )}
                            onClick={() => toggleShortcut(sh.id)}
                        >
                            <span className={clsx("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform", sh.enabled ? "translate-x-4.5" : "translate-x-0.5")} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

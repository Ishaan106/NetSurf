import { Info } from 'lucide-react';

export function AboutTab() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-chrome-text flex items-center gap-2">
                    <Info className="w-5 h-5 text-chrome-accent" />
                    About & Privacy
                </h2>
                <p className="text-xs text-chrome-text-secondary">Learn about NetSurf architecture, privacy policies, and security keychain features.</p>
            </div>

            <div className="p-5 bg-chrome-surface border border-chrome-border rounded-xl space-y-4 text-center">
                <div className="flex justify-center">
                    <img 
                        src="/netsurf.png" 
                        alt="NetSurf Logo" 
                        className="w-16 h-16 object-contain filter drop-shadow-lg" 
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                    />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-chrome-text">NetSurf Core Browser</h3>
                    <p className="text-[10px] text-chrome-text-muted">Version 2.5.0 (Beta Release)</p>
                </div>
                <div className="text-xs text-chrome-text-secondary max-w-md mx-auto leading-relaxed">
                    NetSurf is a next-generation vertical workspace browser powered by autonomous local and cloud AI agents. All your credentials, settings, and browsing histories are kept strictly local in encrypted secure systems storage.
                </div>
            </div>
        </div>
    );
}

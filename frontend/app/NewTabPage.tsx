import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowUp, Globe, Search, Sparkles, Plus, Clock
} from 'lucide-react';
import { VoiceButton } from '@/features/agent/VoiceButton';
import { useTabStore, useUIStore, useSettingsStore } from '@/store';
import './newtab.css';

const SUGGESTED_ITEMS = [
    {
        title: "What is the weather in Tokyo?",
        subtitle: "AI Answer",
        icon: Sparkles,
        url: "https://google.com/search?q=weather+in+tokyo",
        tag: "AI Assist",
        tagColor: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
    },
    {
        title: "Recent project documentation",
        subtitle: "History",
        icon: Clock,
        url: "https://github.com",
        tag: "History",
        tagColor: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
    },
    {
        title: "news.ycombinator.com",
        subtitle: "Web",
        icon: Globe,
        url: "https://news.ycombinator.com",
        tag: "Web",
        tagColor: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    }
];

function isUrl(value: string) {
    const text = value.trim();
    return /^https?:\/\//i.test(text)
        || /^[a-z0-9]([a-z0-9-]*\.)+[a-z]{2,}/i.test(text)
        || text.includes('localhost');
}

function toUrl(value: string) {
    const text = value.trim();
    return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

export function NewTabPage() {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const activeTabId = useTabStore(s => s.activeTabId);
    const updateTab = useTabStore(s => s.updateTab);

    const openPanel = useUIStore(s => s.openPanel);
    const setAgentMode = useUIStore(s => s.setAgentMode);

    const activeWorkspaceId = useSettingsStore(s => s.activeWorkspaceId);
    const workspaces = useSettingsStore(s => s.workspaces);
    const activeWS = workspaces.find(w => w.id === activeWorkspaceId);

    // Subtle glow color matching the active workspace
    const colors = activeWS?.color ? (activeWS.color.match(/#[0-9a-fA-F]{3,6}/g) || [activeWS.color]) : ['#0d53c0'];
    const primaryColor = colors[0];
    const glowColor = primaryColor.startsWith('#')
        ? (primaryColor.length === 4 ? `${primaryColor}2` : `${primaryColor}1a`)
        : primaryColor;

    const glowStyle = activeWS?.color
        ? {
              '--glow-color': glowColor
          } as React.CSSProperties
        : undefined;

    useEffect(() => {
        const timer = setTimeout(() => inputRef.current?.focus(), 150);
        return () => clearTimeout(timer);
    }, []);

    const submit = useCallback((rawQuery = query) => {
        const nextQuery = rawQuery.trim();
        if (!nextQuery) return;

        if (isUrl(nextQuery)) {
            if (activeTabId) updateTab(activeTabId, { url: toUrl(nextQuery), title: nextQuery });
            return;
        }

        setAgentMode('research');
        openPanel('agent');
        window.dispatchEvent(new CustomEvent('agent:set-prompt', { detail: { prompt: nextQuery } }));
    }, [activeTabId, openPanel, query, setAgentMode, updateTab]);

    const Logo = () => {
        const glowColorHex = primaryColor;
        return (
            <div className="relative w-24 h-24 flex items-center justify-center mb-8 select-none group">
                {/* Ambient Background Glow matching workspace theme */}
                <div 
                    className="absolute inset-0 rounded-full blur-2xl opacity-35 dark:opacity-20 group-hover:scale-125 transition-transform duration-500 pointer-events-none" 
                    style={{
                        background: `radial-gradient(circle, ${glowColorHex} 0%, transparent 70%)`
                    }}
                />
                
                {/* Logo Mark */}
                <img 
                    src="/netsurf.png" 
                    alt="NetSurf Logo" 
                    className="w-14 h-14 object-contain relative z-10 select-none pointer-events-none group-hover:scale-[1.03] transition-transform duration-300 drop-shadow-md" 
                />
            </div>
        );
    };

    return (
        <div className="h-full overflow-y-auto px-6 pb-24 flex flex-col items-center justify-center ntp-container relative z-0">
            {/* Thematic workspace background tint overlay */}
            {activeWS?.color && (
                <div 
                    className="absolute inset-0 z-[-1] pointer-events-none transition-all duration-500 opacity-[0.08] dark:opacity-[0.035]"
                    style={{
                        background: activeWS.color
                    }}
                />
            )}

            <div className="w-full max-w-2xl flex flex-col items-center mx-auto relative z-10">
                {/* Logo without the sphere wrapper */}
                <Logo />

                {/* Command Bar / Consolidated Search Box */}
                <div 
                    className="w-full bg-white/45 dark:bg-black/35 backdrop-blur-2xl rounded-2xl border border-white/35 dark:border-white/10 overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.12)] shadow-glow-workspace transition-all duration-300"
                    style={glowStyle}
                >
                    {/* Top zone: Search input */}
                    <div className="flex items-center px-5 py-4 bg-transparent border-b border-black/[0.04] dark:border-white/[0.04]">
                        <Search className="h-5 w-5 shrink-0 text-chrome-text-secondary/60 mr-3" />
                        <input 
                            ref={inputRef}
                            className="flex-grow bg-transparent border-none focus:ring-0 focus:outline-none text-[16px] placeholder-chrome-text-secondary/35 text-chrome-text font-medium" 
                            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
                            placeholder="Ask anything..." 
                            type="text"
                            value={query}
                            onChange={event => {
                                  setQuery(event.target.value);
                            }}
                            onKeyDown={event => {
                                  if (event.key === 'Enter' && !event.shiftKey) {
                                      event.preventDefault();
                                      submit();
                                  }
                            }}
                        />
                    </div>

                    {/* Middle zone: Suggested/Recent items inside the search box card */}
                    <div className="flex flex-col py-2 px-2 bg-transparent select-none border-b border-black/[0.04] dark:border-white/[0.04]">
                        {SUGGESTED_ITEMS.map((item, idx) => {
                            const IconComponent = item.icon;
                            return (
                                <div 
                                    key={idx}
                                    onClick={() => {
                                        if (activeTabId) {
                                            updateTab(activeTabId, { url: item.url, title: item.title });
                                        }
                                    }}
                                    className="flex items-center justify-between gap-3.5 px-4.5 py-3 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.03] cursor-pointer transition-all duration-200 group"
                                >
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <div className="w-7 h-7 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.04] flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                                            <IconComponent className="w-3.5 h-3.5 text-chrome-text-secondary/80 group-hover:text-chrome-accent transition-colors" />
                                        </div>
                                        <span className="text-xs font-semibold text-chrome-text/90 group-hover:text-chrome-accent transition-colors truncate">
                                            {item.title}
                                        </span>
                                    </div>
                                    {item.tag && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.tagColor} shrink-0 uppercase tracking-wide`}>
                                            {item.tag}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom zone: Add tabs & voice control */}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-black/[0.015] dark:bg-white/[0.005] select-none">
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('webview-add-tab'));
                                }}
                                className="flex items-center gap-1.5 text-xs font-bold text-chrome-text-secondary/60 hover:text-chrome-text transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add tabs or files</span>
                            </button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <VoiceButton
                                onTranscript={text => {
                                    setQuery(text);
                                }}
                                onAutoSubmit={text => {
                                    setQuery(text);
                                    submit(text);
                                }}
                            />
                            <button 
                                className="p-1.5 rounded-lg bg-chrome-accent text-white hover:bg-chrome-accent/90 transition-colors ml-1 disabled:opacity-50 active:scale-95" 
                                onClick={() => submit()} 
                                disabled={!query.trim()} 
                                aria-label="Send command"
                            >
                                <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default NewTabPage;

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Search, Settings2 } from 'lucide-react';

interface AgentMemory {
    recentSearches: string[];
    preferences: Record<string, string>;
    lastUsed: number;
}

export function AgentMemoryPanel() {
    const [memory, setMemory] = useState<AgentMemory>(() => {
        try {
            const saved = localStorage.getItem('agent_memory');
            return saved ? JSON.parse(saved) : { recentSearches: [], preferences: {}, lastUsed: Date.now() };
        } catch {
            return { recentSearches: [], preferences: {}, lastUsed: Date.now() };
        }
    });

    const clearMemory = () => {
        setMemory({ recentSearches: [], preferences: {}, lastUsed: Date.now() });
        localStorage.removeItem('agent_memory');
    };

    if (memory.recentSearches.length === 0 && Object.keys(memory.preferences).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <Brain className="w-10 h-10 text-chrome-text-secondary/50 mb-2" />
                <p className="text-sm text-chrome-text-secondary">Agent memory empty</p>
                <p className="text-xs text-chrome-text-secondary/70">Previous searches and preferences will be remembered</p>
            </div>
        );
    }

    return (
        <div className="p-4">
            {memory.recentSearches.length > 0 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-medium text-chrome-text-secondary uppercase tracking-wider flex items-center gap-1">
                            <Search className="w-3 h-3" />
                            Recent Searches
                        </h4>
                        <button
                            onClick={clearMemory}
                            className="text-xs text-chrome-text-secondary hover:text-red-400"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {memory.recentSearches.slice(0, 5).map((search, i) => (
                            <motion.button
                                key={i}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('agent-rerun', { detail: { prompt: search } }));
                                }}
                                className="px-2 py-1 rounded-md bg-chrome-surface-hover text-xs text-chrome-text hover:bg-chrome-border transition-colors"
                            >
                                {search.slice(0, 30)}{search.length > 30 ? '...' : ''}
                            </motion.button>
                        ))}
                    </div>
                </div>
            )}

            {Object.keys(memory.preferences).length > 0 && (
                <div>
                    <h4 className="text-xs font-medium text-chrome-text-secondary uppercase tracking-wider flex items-center gap-1 mb-2">
                        <Settings2 className="w-3 h-3" />
                        Preferences
                    </h4>
                    <div className="space-y-2">
                        {Object.entries(memory.preferences).map(([key, value]) => (
                            <div key={key} className="flex justify-between text-xs">
                                <span className="text-chrome-text-secondary">{key}:</span>
                                <span className="text-chrome-text">{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

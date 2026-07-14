/**
 * ThinkingBubble — Expandable thinking/reasoning display
 * Lightweight with CSS animations instead of framer-motion for performance
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';

interface ThinkingBubbleProps {
    content: string;
    completed: boolean;
    defaultExpanded?: boolean;
}

export const ThinkingBubble: React.FC<ThinkingBubbleProps> = ({
    content,
    completed,
    defaultExpanded = false,
}) => {
    const [expanded, setExpanded] = useState(defaultExpanded);

    if (!content) return null;

    return (
        <div className="my-1.5">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors group"
            >
                <Brain className="w-3.5 h-3.5 text-purple-400/70" />
                <span>
                    {completed ? 'Thinking completed' : 'Thinking...'}
                </span>
                {expanded ? (
                    <ChevronDown className="w-3 h-3" />
                ) : (
                    <ChevronRight className="w-3 h-3" />
                )}
            </button>

            {expanded && (
                <div className="mt-1.5 ml-5 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/10 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {content}
                    {!completed && (
                        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-purple-400/50 animate-pulse" />
                    )}
                </div>
            )}
        </div>
    );
};

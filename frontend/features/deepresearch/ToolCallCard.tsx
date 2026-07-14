/**
 * ToolCallCard — Shows a single tool execution with params & result
 * Compact, collapsible for performance
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, Wrench } from 'lucide-react';
import type { ToolAction } from '../../types/messages';

interface ToolCallCardProps {
    tool: ToolAction;
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; color: string }> = {
    streaming: { icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-blue-400' },
    use: { icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-amber-400' },
    running: { icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-amber-400' },
    completed: { icon: <CheckCircle2 className="w-3 h-3" />, color: 'text-emerald-400' },
};

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ tool }) => {
    const [expanded, setExpanded] = useState(false);
    const statusStyle = STATUS_STYLES[tool.status] || STATUS_STYLES.running;

    const resultPreview = tool.result
        ? typeof tool.result === 'string'
            ? tool.result.slice(0, 120)
            : JSON.stringify(tool.result).slice(0, 120)
        : null;

    return (
        <div className="my-1 rounded-lg border border-zinc-700/50 bg-zinc-800/30 overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-zinc-700/20 transition-colors"
            >
                <Wrench className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="text-xs font-medium text-zinc-300 truncate flex-1">
                    {tool.toolName}
                </span>
                <span className={`flex items-center gap-1 text-xs ${statusStyle.color}`}>
                    {statusStyle.icon}
                </span>
                {expanded ? (
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                ) : (
                    <ChevronRight className="w-3 h-3 text-zinc-500" />
                )}
            </button>

            {expanded && (
                <div className="px-3 pb-2 space-y-2 border-t border-zinc-700/30">
                    {tool.params && Object.keys(tool.params).length > 0 && (
                        <div className="mt-2">
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Parameters</div>
                            <pre className="text-xs text-zinc-400 bg-zinc-900/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
                                {JSON.stringify(tool.params, null, 2)}
                            </pre>
                        </div>
                    )}
                    {resultPreview && (
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Result</div>
                            <pre className="text-xs text-zinc-400 bg-zinc-900/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                                {typeof tool.result === 'string'
                                    ? tool.result
                                    : JSON.stringify(tool.result, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * WorkflowConfirm — Shows planned workflow steps with confirm/cancel/regenerate
 */
import React from 'react';
import { CheckCircle2, XCircle, RefreshCw, ListChecks } from 'lucide-react';

interface WorkflowConfirmProps {
    workflow: any;
    confirmId: string;
    status: 'pending' | 'confirmed' | 'regenerating';
    onConfirm: (confirmId: string) => void;
    onCancel: (confirmId: string) => void;
    onRegenerate: (taskId: string) => void;
    taskId: string;
}

export const WorkflowConfirm: React.FC<WorkflowConfirmProps> = ({
    workflow,
    confirmId,
    status,
    onConfirm,
    onCancel,
    onRegenerate,
    taskId,
}) => {
    const agents = workflow?.agents || [];

    return (
        <div className="my-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-indigo-500/10">
                <ListChecks className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-indigo-300">
                    Execution Plan
                </span>
                <span className="text-xs text-zinc-500 ml-auto">
                    {agents.length} step{agents.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Steps */}
            <div className="px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
                {agents.map((agent: any, idx: number) => (
                    <div
                        key={idx}
                        className="flex items-start gap-2.5 text-sm"
                    >
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-medium shrink-0 mt-0.5">
                            {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-zinc-200 text-xs">
                                {agent.name || `Step ${idx + 1}`}
                            </div>
                            {agent.description && (
                                <div className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                                    {agent.description}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Actions */}
            {status === 'pending' && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-indigo-500/10 bg-indigo-500/5">
                    <button
                        onClick={() => onConfirm(confirmId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirm
                    </button>
                    <button
                        onClick={() => onRegenerate(taskId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium transition-colors"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Regenerate
                    </button>
                    <button
                        onClick={() => onCancel(confirmId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-zinc-700/50 text-zinc-400 text-xs transition-colors ml-auto"
                    >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                    </button>
                </div>
            )}

            {status === 'confirmed' && (
                <div className="flex items-center gap-2 px-4 py-2 border-t border-emerald-500/10 bg-emerald-500/5 text-emerald-400 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Workflow confirmed — executing...
                </div>
            )}

            {status === 'regenerating' && (
                <div className="flex items-center gap-2 px-4 py-2 border-t border-amber-500/10 bg-amber-500/5 text-amber-400 text-xs">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Regenerating workflow...
                </div>
            )}
        </div>
    );
};

import { motion } from 'framer-motion';
import { History, Clock, Play, Trash2 } from 'lucide-react';
import { type TaskHistoryItem } from '@/store';
import clsx from 'clsx';

interface TaskHistoryPanelProps {
    history: TaskHistoryItem[];
    onRerun: (prompt: string) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
}

export function TaskHistoryPanel({
    history,
    onRerun,
    onDelete,
    onClear
}: TaskHistoryPanelProps) {
    if (history.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <History className="w-10 h-10 text-chrome-text-secondary/50 mb-2" />
                <p className="text-sm text-chrome-text-secondary">No task history yet</p>
                <p className="text-xs text-chrome-text-secondary/70">Completed tasks will appear here</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-4 py-2 border-b border-chrome-border">
                <span className="text-xs font-medium text-chrome-text-secondary uppercase tracking-wider">
                    Recent ({history.length})
                </span>
                <button
                    onClick={onClear}
                    className="text-xs text-chrome-text-secondary hover:text-red-400 transition-colors"
                >
                    Clear All
                </button>
            </div>
            <div className="max-h-[300px] overflow-auto">
                {history.map((item, index) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="px-4 py-3 hover:bg-chrome-surface-hover transition-colors group border-b border-chrome-border"
                    >
                        <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-chrome-text truncate">{item.prompt}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={clsx(
                                        'text-xs px-1.5 py-0.5 rounded',
                                        item.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                    )}>
                                        {item.status === 'completed' ? '✓ Done' : '✗ Failed'}
                                    </span>
                                    <span className="text-xs text-chrome-text-secondary flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {(item.duration / 1000).toFixed(1)}s
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => onRerun(item.prompt)}
                                    className="p-1.5 rounded hover:bg-chrome-bg text-chrome-text-secondary hover:text-agent-primary"
                                    title="Rerun task"
                                >
                                    <Play className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => onDelete(item.id)}
                                    className="p-1.5 rounded hover:bg-chrome-bg text-chrome-text-secondary hover:text-red-400"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

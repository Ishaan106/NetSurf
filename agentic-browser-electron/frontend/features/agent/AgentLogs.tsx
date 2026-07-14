import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, History, Brain, Loader2, CheckCircle2 } from 'lucide-react';
import { useAgentStore } from '@/store';
import clsx from 'clsx';

import { CleanLogItem, DevLogItem } from './components/LogItems';
import { RetryPanel } from './components/RetryPanel';
import { TaskHistoryPanel } from './components/TaskHistoryPanel';
import { AgentMemoryPanel } from './components/AgentMemoryPanel';
import { DemoModeButtons } from './components/DemoModeButtons';
import { TaskTimeline } from './components/TaskTimeline';

type TabId = 'logs' | 'history' | 'memory';

export function AgentLogs() {
    const logs = useAgentStore((s) => s.logs);
    const status = useAgentStore((s) => s.status);
    const error = useAgentStore((s) => s.error);
    const logViewMode = useAgentStore((s) => s.logViewMode);
    const toggleLogViewMode = useAgentStore((s) => s.toggleLogViewMode);
    const timeline = useAgentStore((s) => s.timeline);
    const taskHistory = useAgentStore((s) => s.taskHistory);
    const deleteHistoryItem = useAgentStore((s) => s.deleteHistoryItem);
    const clearHistory = useAgentStore((s) => s.clearHistory);
    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Tab state
    const [activeTab, setActiveTab] = useState<TabId>('logs');

    // Auto-scroll to bottom on new logs
    useEffect(() => {
        if (bottomRef.current && activeTab === 'logs') {
            bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [logs.length, activeTab]);

    // Filter logs for clean mode
    const displayLogs = logViewMode === 'user'
        ? logs.filter(log => log.type !== 'tool')
        : logs;

    return (
        <div className="flex flex-col h-full">
            {/* Tab Navigation */}
            <div className="flex items-center px-3 py-2 border-b border-chrome-border bg-chrome-surface">
                <button
                    onClick={() => setActiveTab('logs')}
                    className={clsx(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                        activeTab === 'logs'
                            ? 'bg-agent-primary/20 text-agent-primary'
                            : 'text-chrome-text-secondary hover:bg-chrome-surface-hover'
                    )}
                >
                    <Eye className="w-3.5 h-3.5" />
                    Logs
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={clsx(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                        activeTab === 'history'
                            ? 'bg-agent-primary/20 text-agent-primary'
                            : 'text-chrome-text-secondary hover:bg-chrome-surface-hover'
                    )}
                >
                    <History className="w-3.5 h-3.5" />
                    History
                    {taskHistory.length > 0 && (
                        <span className="px-1 rounded-full bg-chrome-border text-[10px]">
                            {taskHistory.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('memory')}
                    className={clsx(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                        activeTab === 'memory'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'text-chrome-text-secondary hover:bg-chrome-surface-hover'
                    )}
                >
                    <Brain className="w-3.5 h-3.5" />
                    Memory
                </button>

                {/* Clean/Dev dropdown */}
                {activeTab === 'logs' && (
                    <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                        <select
                            value={logViewMode}
                            onChange={(e) => {
                                const newMode = e.target.value as 'user' | 'dev';
                                if (newMode !== logViewMode) toggleLogViewMode();
                            }}
                            className={clsx(
                                'px-2 py-1 rounded-md text-xs font-medium border cursor-pointer',
                                'bg-chrome-bg border-chrome-border',
                                logViewMode === 'user'
                                    ? 'text-green-400'
                                    : 'text-amber-400'
                            )}
                        >
                            <option value="user">Clean</option>
                            <option value="dev">Dev</option>
                        </select>

                        {/* Loading indicator */}
                        <AnimatePresence>
                            {status === 'running' && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="flex items-center text-agent-primary"
                                >
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Tab Content */}
            <div ref={containerRef} className="flex-1 overflow-auto">
                <AnimatePresence mode="wait">
                    {activeTab === 'logs' && (
                        <motion.div
                            key="logs"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                        >
                            {logs.length === 0 && status === 'idle' ? (
                                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center"
                                    >
                                        <Eye className="w-8 h-8 text-chrome-text-secondary" />
                                    </motion.div>
                                    <p className="text-sm font-medium text-chrome-text">
                                        Agent logs will appear here
                                    </p>
                                    <p className="text-xs text-chrome-text-secondary mt-1">
                                        Start a task or try a demo below
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="p-4">
                                        {logViewMode === 'user'
                                            ? displayLogs.map((log, index) => (
                                                <CleanLogItem key={log.id} log={log} index={index} />
                                            ))
                                            : displayLogs.map((log, index) => (
                                                <DevLogItem key={log.id} log={log} index={index} />
                                            ))
                                        }
                                    </div>

                                    {/* Error Retry UI */}
                                    <AnimatePresence>
                                        {status === 'error' && error && (
                                            <RetryPanel
                                                error={error}
                                                onRetry={() => {
                                                    window.dispatchEvent(new CustomEvent('agent-retry'));
                                                }}
                                            />
                                        )}
                                    </AnimatePresence>

                                    {/* Timeline after completion */}
                                    {status === 'completed' && timeline.length > 0 && (
                                        <TaskTimeline timeline={timeline} />
                                    )}

                                    {/* Completion animation */}
                                    <AnimatePresence>
                                        {status === 'completed' && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.5 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="flex items-center justify-center py-4"
                                            >
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                                                    className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center"
                                                >
                                                    <CheckCircle2 className="w-6 h-6 text-green-400" />
                                                </motion.div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div ref={bottomRef} />
                                </>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'history' && (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                        >
                            <TaskHistoryPanel
                                history={taskHistory}
                                onRerun={(prompt) => {
                                    window.dispatchEvent(new CustomEvent('agent-rerun', { detail: { prompt } }));
                                }}
                                onDelete={deleteHistoryItem}
                                onClear={clearHistory}
                            />
                        </motion.div>
                    )}

                    {activeTab === 'memory' && (
                        <motion.div
                            key="memory"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                        >
                            <AgentMemoryPanel />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Demo Mode Buttons - shown when idle on logs tab */}
            {status === 'idle' && activeTab === 'logs' && (
                <DemoModeButtons
                    onRunDemo={(prompt) => {
                        window.dispatchEvent(new CustomEvent('agent-demo', { detail: { prompt } }));
                    }}
                    disabled={false}
                />
            )}
        </div>
    );
}

export default AgentLogs;

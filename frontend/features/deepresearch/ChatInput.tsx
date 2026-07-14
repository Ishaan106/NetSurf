/**
 * ChatInput — Input area with mode switch, provider selector, and action buttons
 */
import React, { useState, useRef, useCallback } from 'react';
import { Send, Square, Pause, Play, Sparkles, MessageSquare } from 'lucide-react';
import type { TaskMode, TaskStatus } from '../../types/messages';

interface ChatInputProps {
    taskMode: TaskMode;
    taskStatus: TaskStatus;
    onSend: (message: string) => void;
    onCancel: () => void;
    onPause: (paused: boolean) => void;
    onModeChange: (mode: TaskMode) => void;
    isPaused: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    taskMode,
    taskStatus,
    onSend,
    onCancel,
    onPause,
    onModeChange,
    isPaused,
}) => {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isRunning = taskStatus === 'running';

    const handleSubmit = useCallback(() => {
        const trimmed = input.trim();
        if (!trimmed || isRunning) return;
        onSend(trimmed);
        setInput('');
        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    }, [input, isRunning, onSend]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        // Auto-resize
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    };

    return (
        <div className="border-t border-zinc-700/50 bg-zinc-900/50 backdrop-blur-sm px-4 py-3">
            {/* Mode switch */}
            <div className="flex items-center gap-1 mb-2">
                <button
                    onClick={() => onModeChange('explore')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        taskMode === 'explore'
                            ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/30'
                    }`}
                    disabled={isRunning}
                >
                    <Sparkles className="w-3 h-3" />
                    Explore
                </button>
                <button
                    onClick={() => onModeChange('chat')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        taskMode === 'chat'
                            ? 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/30'
                    }`}
                    disabled={isRunning}
                >
                    <MessageSquare className="w-3 h-3" />
                    Chat
                </button>
            </div>

            {/* Input area */}
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        isRunning
                            ? 'Agent is working...'
                            : taskMode === 'explore'
                                ? 'Describe a task to research... (Enter to send)'
                                : 'Ask a question... (Enter to send)'
                    }
                    disabled={isRunning}
                    rows={1}
                    className="w-full resize-none bg-zinc-800/60 border border-zinc-600/40 rounded-xl px-4 py-2.5 pr-24 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500/30 disabled:opacity-50 transition-all"
                    style={{ maxHeight: '160px' }}
                />

                {/* Action buttons */}
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                    {isRunning ? (
                        <>
                            <button
                                onClick={() => onPause(!isPaused)}
                                className="p-1.5 rounded-lg hover:bg-zinc-700/50 text-zinc-400 hover:text-amber-400 transition-colors"
                                title={isPaused ? 'Resume' : 'Pause'}
                            >
                                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={onCancel}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors"
                                title="Cancel"
                            >
                                <Square className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={!input.trim()}
                            className={`p-1.5 rounded-lg transition-all ${
                                input.trim()
                                    ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                                    : 'text-zinc-500 cursor-not-allowed'
                            }`}
                            title="Send"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

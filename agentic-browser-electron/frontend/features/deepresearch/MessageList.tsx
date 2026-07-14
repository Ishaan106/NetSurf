/**
 * MessageList — Renders the list of display messages (workflow, agents, tools, chat)
 * Performance: Uses virtualized-like approach with CSS contain
 */
import React, { useRef, useEffect } from 'react';
import { User, Bot, AlertTriangle, Loader2 } from 'lucide-react';
import type {
    DisplayMessage,
    WorkflowMessage,
    AgentGroupMessage,
    UserMessage,
    ChatResponseMessage,
    ErrorMessage,
} from '../../types/messages';
import { ThinkingBubble } from './ThinkingBubble';
import { ToolCallCard } from './ToolCallCard';
import { WorkflowConfirm } from './WorkflowConfirm';

interface MessageListProps {
    messages: DisplayMessage[];
    onWorkflowConfirm: (confirmId: string) => void;
    onWorkflowCancel: (confirmId: string) => void;
    onWorkflowRegenerate: (taskId: string) => void;
    onHumanResponse?: (requestId: string, result: any) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    onWorkflowConfirm,
    onWorkflowCancel,
    onWorkflowRegenerate,
}) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    if (messages.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                Start a conversation to begin
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ contain: 'layout' }}>
            {messages.map((msg) => {
                switch (msg.type) {
                    case 'user':
                        return <UserBubble key={msg.id} message={msg} />;
                    case 'workflow':
                        return (
                            <WorkflowBubble
                                key={msg.id}
                                message={msg}
                                onConfirm={onWorkflowConfirm}
                                onCancel={onWorkflowCancel}
                                onRegenerate={onWorkflowRegenerate}
                            />
                        );
                    case 'agent_group':
                        return <AgentGroupBubble key={msg.id} message={msg} />;
                    case 'chat':
                        return <ChatBubble key={msg.id} message={msg} />;
                    case 'error':
                        return <ErrorBubble key={msg.id} message={msg} />;
                    default:
                        return null;
                }
            })}
            <div ref={bottomRef} />
        </div>
    );
};

// ── Sub-components ────────────────────────────────────────────────────

const UserBubble: React.FC<{ message: UserMessage }> = ({ message }) => (
    <div className="flex items-start gap-2.5 justify-end">
        <div className="max-w-[80%] bg-indigo-600/80 text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed">
            {message.content}
        </div>
        <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-indigo-400" />
        </div>
    </div>
);

const WorkflowBubble: React.FC<{
    message: WorkflowMessage;
    onConfirm: (id: string) => void;
    onCancel: (id: string) => void;
    onRegenerate: (id: string) => void;
}> = ({ message, onConfirm, onCancel, onRegenerate }) => (
    <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
            {message.thinking && (
                <ThinkingBubble
                    content={message.thinking.text}
                    completed={message.thinking.completed}
                />
            )}
            {message.workflow && message.confirmId && message.confirmStatus && (
                <WorkflowConfirm
                    workflow={message.workflow}
                    confirmId={message.confirmId}
                    status={message.confirmStatus}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                    onRegenerate={onRegenerate}
                    taskId={message.taskId}
                />
            )}
        </div>
    </div>
);

const AgentGroupBubble: React.FC<{ message: AgentGroupMessage }> = ({ message }) => (
    <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            {message.status === 'running' ? (
                <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
            ) : (
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
            )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-400">
                    {message.agentName}
                </span>
                {message.status === 'completed' && message.usage && (
                    <span className="text-[10px] text-zinc-500">
                        {message.usage.totalTokens} tokens
                    </span>
                )}
            </div>

            {/* Render agent messages */}
            {message.messages.map((agentMsg, idx) => {
                switch (agentMsg.type) {
                    case 'thinking':
                        return (
                            <ThinkingBubble
                                key={agentMsg.id || idx}
                                content={agentMsg.content}
                                completed={agentMsg.completed}
                            />
                        );
                    case 'text':
                        return (
                            <div key={agentMsg.id || idx} className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                {agentMsg.content}
                            </div>
                        );
                    case 'tool':
                        return <ToolCallCard key={agentMsg.id || idx} tool={agentMsg} />;
                    default:
                        return null;
                }
            })}

            {/* Agent result */}
            {message.result && message.status === 'completed' && (
                <div className="mt-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-xs text-emerald-300/80 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {message.result}
                </div>
            )}
        </div>
    </div>
);

const ChatBubble: React.FC<{ message: ChatResponseMessage }> = ({ message }) => (
    <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-sky-500/20 flex items-center justify-center shrink-0">
            {message.status === 'running' ? (
                <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
            ) : (
                <Bot className="w-3.5 h-3.5 text-sky-400" />
            )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
            {/* Thinking */}
            {message.thinkings.map((t) => (
                <ThinkingBubble key={t.id} content={t.content} completed={t.completed} />
            ))}

            {/* Tool calls */}
            {message.tools.map((tool) => (
                <ToolCallCard key={tool.id} tool={tool} />
            ))}

            {/* Chat text */}
            {message.content && (
                <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {message.content}
                    {message.status === 'running' && (
                        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-sky-400/50 animate-pulse" />
                    )}
                </div>
            )}

            {/* Usage stats */}
            {message.status === 'completed' && message.usage && (
                <div className="text-[10px] text-zinc-500 mt-1">
                    {message.usage.totalTokens} tokens
                    {message.duration && ` · ${(message.duration / 1000).toFixed(1)}s`}
                </div>
            )}
        </div>
    </div>
);

const ErrorBubble: React.FC<{ message: ErrorMessage }> = ({ message }) => (
    <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
        </div>
        <div className="flex-1 p-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
            <div className="text-xs font-medium text-red-400">{message.error}</div>
            {message.detail && (
                <div className="text-[10px] text-red-400/60 mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap">
                    {message.detail}
                </div>
            )}
        </div>
    </div>
);

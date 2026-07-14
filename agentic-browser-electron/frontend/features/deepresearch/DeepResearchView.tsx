/**
 * DeepResearchView — Full-screen deep research view
 * 
 * Overlays the WebView area when active, providing the full chat/workflow
 * experience similar to ai-browser's /main page.
 * 
 * PERFORMANCE:
 * - Lazy message processing (only on new events)
 * - CSS contain for layout isolation
 * - No heavyweight deps (no Ant Design, no react-markdown)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Settings2, Loader2 } from 'lucide-react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { MessageProcessor } from '../../utils/messageTransform';
import type { DisplayMessage, TaskMode, TaskStatus, HumanInteractionMessage } from '../../types/messages';
import { useSettingsStore } from '../../store/settingsStore';


// Helper to get the eko API — component only mounts when electronAPI is available
const getEko = () => window.electronAPI!.eko;

interface DeepResearchViewProps {
    onClose: () => void;
}

export const DeepResearchView: React.FC<DeepResearchViewProps> = ({ onClose }) => {
    // State
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [taskMode, setTaskMode] = useState<TaskMode>('explore');
    const [taskStatus, setTaskStatus] = useState<TaskStatus>('idle');
    const [isPaused, setIsPaused] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
    const [currentChatId, setChatId] = useState<string | null>(null);
    const [humanInteraction, setHumanInteraction] = useState<HumanInteractionMessage | null>(null);
    const [humanInput, setHumanInput] = useState('');

    // Refs
    const processorRef = useRef(new MessageProcessor());
    const cleanupRef = useRef<(() => void) | null>(null);

    // Settings
    const llmProvider = useSettingsStore((s) => s.llmProvider);
    const llmModel = useSettingsStore((s) => s.llmModel);

    // ── Configure agent on mount ────────────────────────────────────
    useEffect(() => {
        const configure = async () => {
            if (!llmProvider || !llmModel) return;
            try {
                const result = await getEko().configure({
                    provider: llmProvider,
                    model: llmModel,
                });
                setIsConfigured(result?.success === true);
            } catch (error) {
                console.error('[DeepResearch] Configure failed:', error);
            }
        };
        configure();
    }, [llmProvider, llmModel]);

    // ── Listen for stream messages ──────────────────────────────────
    useEffect(() => {
        const cleanup = getEko().onStreamMessage((raw: any) => {
            // Handle human interaction separately
            if (raw.type === 'human_interaction') {
                setHumanInteraction(raw as HumanInteractionMessage);
                return;
            }

            // Process message and update display
            const processor = processorRef.current;
            const changed = processor.processMessage(raw);
            if (changed) {
                setMessages([...processor.getMessages()]);
            }

            // Track task completion
            if (raw.type === 'error') {
                setTaskStatus('error');
            }
        });

        cleanupRef.current = cleanup;
        return () => cleanup();
    }, []);

    // ── Send message ────────────────────────────────────────────────
    const handleSend = useCallback(async (text: string) => {
        if (!isConfigured) return;

        // Add user message to display
        const processor = processorRef.current;
        const userMsg: DisplayMessage = {
            id: `user_${Date.now()}`,
            type: 'user',
            content: text,
            timestamp: new Date(),
        };
        processor.getMessages().push(userMsg);
        setMessages([...processor.getMessages()]);
        setTaskStatus('running');

        try {
            if (taskMode === 'explore') {
                // Explore mode: generate workflow → confirm → execute
                const result = await getEko().run(text);
                if (result?.data?.taskId) {
                    setCurrentTaskId(result.data.taskId);
                }
            } else {
                // Chat mode
                const chatId = currentChatId || `chat_${Date.now()}`;
                if (!currentChatId) setChatId(chatId);
                const messageId = `msg_${Date.now()}`;
                await getEko().chatRun(chatId, messageId, text);
            }
        } catch (error) {
            console.error('[DeepResearch] Send failed:', error);
        } finally {
            setTaskStatus('idle');
        }
    }, [isConfigured, taskMode, currentChatId]);

    // ── Workflow controls ───────────────────────────────────────────
    const handleWorkflowConfirm = useCallback((confirmId: string) => {
        getEko().workflowConfirmResponse(confirmId, true);
        // Update local state
        const processor = processorRef.current;
        const msgs = processor.getMessages();
        const wf = msgs.find((m) => m.type === 'workflow' && (m as any).confirmId === confirmId);
        if (wf && wf.type === 'workflow') {
            (wf as any).confirmStatus = 'confirmed';
            setMessages([...msgs]);
        }
    }, []);

    const handleWorkflowCancel = useCallback((confirmId: string) => {
        getEko().workflowConfirmResponse(confirmId, false);
        setTaskStatus('idle');
    }, []);

    const handleWorkflowRegenerate = useCallback((taskId: string) => {
        getEko().regenerateWorkflow(taskId);
        // Update local state
        const processor = processorRef.current;
        const msgs = processor.getMessages();
        const wf = msgs.find((m) => m.type === 'workflow' && (m as any).taskId === taskId);
        if (wf && wf.type === 'workflow') {
            (wf as any).confirmStatus = 'regenerating';
            setMessages([...msgs]);
        }
    }, []);

    // ── Task controls ───────────────────────────────────────────────
    const handleCancel = useCallback(() => {
        if (taskMode === 'explore' && currentTaskId) {
            getEko().cancelTask(currentTaskId);
        } else if (taskMode === 'chat' && currentChatId) {
            getEko().chatCancel(currentChatId);
        }
        setTaskStatus('idle');
        setIsPaused(false);
    }, [taskMode, currentTaskId, currentChatId]);

    const handlePause = useCallback((paused: boolean) => {
        if (currentTaskId) {
            getEko().pauseTask(currentTaskId, paused);
            setIsPaused(paused);
        }
    }, [currentTaskId]);

    // ── Human interaction ───────────────────────────────────────────
    const handleHumanConfirm = useCallback((confirmed: boolean) => {
        if (!humanInteraction) return;
        getEko().humanResponse({
            requestId: humanInteraction.requestId,
            success: true,
            result: confirmed,
        });
        setHumanInteraction(null);
    }, [humanInteraction]);

    const handleHumanInputSubmit = useCallback(() => {
        if (!humanInteraction || !humanInput.trim()) return;
        getEko().humanResponse({
            requestId: humanInteraction.requestId,
            success: true,
            result: humanInput.trim(),
        });
        setHumanInteraction(null);
        setHumanInput('');
    }, [humanInteraction, humanInput]);

    // ── Render ───────────────────────────────────────────────────────
    return (
        <div className="absolute inset-0 z-40 flex flex-col bg-zinc-900/95 backdrop-blur-md">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-700/50 bg-zinc-900/80">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-sm font-semibold text-zinc-200">Deep Research</span>
                    {taskStatus === 'running' && (
                        <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!isConfigured && (
                        <span className="text-xs text-amber-400 flex items-center gap-1">
                            <Settings2 className="w-3 h-3" />
                            Configure provider in Settings
                        </span>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 transition-colors"
                        title="Close Deep Research"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <MessageList
                messages={messages}
                onWorkflowConfirm={handleWorkflowConfirm}
                onWorkflowCancel={handleWorkflowCancel}
                onWorkflowRegenerate={handleWorkflowRegenerate}
            />

            {/* Human Interaction Overlay */}
            {humanInteraction && (
                <div className="px-4 py-3 border-t border-amber-500/20 bg-amber-500/5">
                    <div className="text-sm text-amber-300 mb-2 font-medium">
                        {humanInteraction.interactType === 'confirm' ? '🤔 Confirmation Required' :
                         humanInteraction.interactType === 'input' ? '✏️ Input Required' :
                         humanInteraction.interactType === 'request_help' ? '🙋 Help Needed' :
                         '📋 Selection Required'}
                    </div>
                    <div className="text-xs text-zinc-300 mb-3">{humanInteraction.prompt}</div>

                    {humanInteraction.interactType === 'confirm' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleHumanConfirm(true)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
                            >
                                Yes
                            </button>
                            <button
                                onClick={() => handleHumanConfirm(false)}
                                className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium transition-colors"
                            >
                                No
                            </button>
                        </div>
                    )}

                    {humanInteraction.interactType === 'input' && (
                        <div className="flex gap-2">
                            <input
                                value={humanInput}
                                onChange={(e) => setHumanInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleHumanInputSubmit()}
                                className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-600/40 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                                placeholder="Type your response..."
                                autoFocus
                            />
                            <button
                                onClick={handleHumanInputSubmit}
                                className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors"
                            >
                                Submit
                            </button>
                        </div>
                    )}

                    {humanInteraction.interactType === 'request_help' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleHumanConfirm(true)}
                                className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Input */}
            <ChatInput
                taskMode={taskMode}
                taskStatus={taskStatus}
                onSend={handleSend}
                onCancel={handleCancel}
                onPause={handlePause}
                onModeChange={setTaskMode}
                isPaused={isPaused}
            />
        </div>
    );
};

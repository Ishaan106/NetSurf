import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAgentStore, useUIStore, useSettingsStore, useTabStore, useAgentWorkspaceStore } from '@/store';
import { makeId, textFrom, normalizeForDedupe } from '../utils/helpers';
import { PanelEvent } from '../components/EventCard';

interface DynamicProviderConfig {
    name: string;
}

export function useAgentExecution() {
    const isPanelOpen = useUIStore(s => s.isPanelOpen);
    const activePanel = useUIStore(s => s.activePanel);
    const agentMode = useUIStore(s => s.agentMode);
    const setAgentMode = useUIStore(s => s.setAgentMode);

    const llmProvider = useSettingsStore(s => s.llmProvider);
    const llmModel = useSettingsStore(s => s.llmModel);
    const screenshotEnabled = useSettingsStore(s => s.screenshotEnabled);
    const availableModels = useSettingsStore(s => s.availableModels);
    const enabledModels = useSettingsStore(s => s.enabledModels);
    const setLLMProvider = useSettingsStore(s => s.setLLMProvider);
    const setLLMModel = useSettingsStore(s => s.setLLMModel);
    const setEnabledModels = useSettingsStore(s => s.setEnabledModels);

    const status = useAgentStore(s => s.status);
    const streamingText = useAgentStore(s => s.streamingText);
    const startAgent = useAgentStore(s => s.startAgent);
    const stopAgent = useAgentStore(s => s.stopAgent);
    const setError = useAgentStore(s => s.setError);
    const activeTabId = useTabStore(s => s.activeTabId);
    const tabs = useTabStore(s => s.tabs);
    const activeTab = tabs.find(t => t.id === activeTabId);

    const [prompt, setPrompt] = useState('');
    const [isExec, setIsExec] = useState(false);
    const [events, setEvents] = useState<PanelEvent[]>([]);
    const [isPlanReady, setIsPlanReady] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [pickerMode, setPickerMode] = useState<'select' | 'manage'>('select');
    const [haltPrompt, setHaltPrompt] = useState('');
    const [showHalt, setShowHalt] = useState(false);
    const [currentRequestId, setCurrentRequestId] = useState('');
    const [currentConfirmId, setCurrentConfirmId] = useState('');
    const [chatId] = useState(() => 'chat-' + Date.now());
    const [currentTaskId, setCurrentTaskId] = useState('');
    const [providerConfigs, setProviderConfigs] = useState<Record<string, DynamicProviderConfig>>({});
    const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);

    const sawStreamTextRef = useRef(false);
    const lastAssistantTextRef = useRef('');

    const isVisible = isPanelOpen && activePanel === 'agent';
    const canSend = prompt.trim().length > 0 && !isExec;

    // Suggestion configurations based on context
    const isNewTab = !activeTab || activeTab.url === 'about:blank' || activeTab.url.includes('netsurf://newtab');
    const suggestions = useMemo(() => {
        return isNewTab ? [
            { label: 'Search and summarize', text: 'Search the web for a topic and summarize the most useful result.' },
            { label: 'Compare options', text: 'Compare the strongest options for this question: ' },
            { label: 'Plan research', text: 'Build a browsing plan to research: ' },
            { label: 'Explain shortcuts', text: 'Explain the browser shortcuts that help me move faster.' }
        ] : [
            { label: 'Summarize page', text: 'Analyze the current web page and write a concise summary with bullet points.' },
            { label: 'Extract key points', text: 'Extract the key terms, decisions, and action items from this page.' },
            { label: 'Find related resources', text: 'Find related resources that deepen the current page context.' },
            { label: 'Explain simply', text: 'Explain the important ideas on this page in simple terms.' }
        ];
    }, [isNewTab]);

    const providerGroups = useMemo(() => {
        return configuredProviders
            .map(providerId => {
                const models = availableModels[providerId] || [];
                const enabled = enabledModels[providerId] || [];
                return {
                    id: providerId,
                    name: providerConfigs[providerId]?.name || providerId,
                    models,
                    enabledModels: models.filter(model => enabled.includes(model)),
                };
            })
            .filter(group => group.models.length > 0);
    }, [availableModels, configuredProviders, enabledModels, providerConfigs]);

    const selectableGroups = useMemo(
        () => providerGroups.filter(group => group.enabledModels.length > 0),
        [providerGroups]
    );

    const isModelSelectedAndEnabled = useMemo(() => {
        return selectableGroups.some(group => group.id === llmProvider && group.enabledModels.includes(llmModel));
    }, [selectableGroups, llmProvider, llmModel]);
    const modelLabel = isModelSelectedAndEnabled ? llmModel : 'Configure your model';

    const currentProviderName = providerConfigs[llmProvider]?.name || llmProvider;

    const loadProviderState = useCallback(async () => {
        const api = window.electronAPI;
        if (!api?.settings) return;
        try {
            const [configs, configured] = await Promise.all([
                api.settings.getProviders(),
                api.settings.getConfiguredProviders(),
            ]);
            const mapped: Record<string, DynamicProviderConfig> = {};
            Object.entries(configs || {}).forEach(([key, config]: [string, any]) => {
                mapped[key] = { name: config.name || key };
            });
            setProviderConfigs(mapped);
            setConfiguredProviders(configured || []);
        } catch (error) {
            console.error('[AgentPanel] Failed to load provider state:', error);
        }
    }, []);

    useEffect(() => {
        if (isVisible) loadProviderState();
    }, [isVisible, loadProviderState]);

    useEffect(() => {
        const rehydrate = () => {
            (useSettingsStore as any).persist?.rehydrate?.();
            loadProviderState();
        };
        window.addEventListener('storage', rehydrate);
        return () => window.removeEventListener('storage', rehydrate);
    }, [loadProviderState]);

    useEffect(() => {
        if (!showPicker) return;
        (useSettingsStore as any).persist?.rehydrate?.();
        loadProviderState();
    }, [loadProviderState, showPicker]);

    useEffect(() => {
        const currentIsSelectable = selectableGroups.some(group => group.id === llmProvider && group.enabledModels.includes(llmModel));
        const firstGroup = selectableGroups[0];
        const firstModel = firstGroup?.enabledModels[0];
        if (!currentIsSelectable && firstGroup && firstModel) {
            setLLMProvider(firstGroup.id as any);
            setLLMModel(firstModel);
        }
    }, [llmModel, llmProvider, selectableGroups, setLLMModel, setLLMProvider]);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.prompt) {
                setPrompt(detail.prompt);
            }
        };
        window.addEventListener('agent:set-prompt', handler);
        return () => window.removeEventListener('agent:set-prompt', handler);
    }, []);

    const appendEvent = useCallback((event: PanelEvent) => {
        setEvents(prev => [...prev, event]);
    }, []);

    const upsertAssistantText = useCallback((streamId: string, fullText: string) => {
        if (!fullText) return;
        sawStreamTextRef.current = true;
        lastAssistantTextRef.current = normalizeForDedupe(fullText);
        setEvents(prev => {
            const index = [...prev].reverse().findIndex(event => event.kind === 'assistant' && event.streamId === streamId);
            if (index === -1) {
                const normalized = normalizeForDedupe(fullText);
                const dupIndex = [...prev].reverse().findIndex(event => event.kind === 'assistant' && normalizeForDedupe(event.content) === normalized);
                if (dupIndex !== -1) {
                    const actualIndex = prev.length - 1 - dupIndex;
                    return prev.map((event, i) => i === actualIndex && event.kind === 'assistant'
                        ? { ...event, content: fullText }
                        : event);
                }
                return [...prev, { id: makeId('assistant'), kind: 'assistant', streamId, content: fullText }];
            }
            const actualIndex = prev.length - 1 - index;
            return prev.map((event, i) => i === actualIndex && event.kind === 'assistant'
                ? { ...event, content: fullText }
                : event);
        });
    }, []);

    const upsertThinking = useCallback((streamId: string, fullText: string, completed: boolean) => {
        if (!fullText && !completed) return;
        setEvents(prev => {
            const existing = prev.find(event => event.kind === 'thinking' && event.streamId === streamId);
            if (!existing) {
                return [...prev, { id: makeId('thinking'), kind: 'thinking', streamId, content: fullText, completed }];
            }
            return prev.map(event => event.kind === 'thinking' && event.streamId === streamId
                ? { ...event, content: fullText || event.content, completed: completed || event.completed }
                : event);
        });
    }, []);

    const upsertTool = useCallback((message: any, nextStatus: 'streaming' | 'running' | 'completed') => {
        const toolCallId = message.toolCallId || message.id || makeId('tool-call');
        const toolName = message.toolName || message.name || 'tool';
        setEvents(prev => {
            const existing = prev.find(event => event.kind === 'tool' && event.toolCallId === toolCallId);
            if (!existing) {
                return [...prev, {
                    id: makeId('tool'),
                    kind: 'tool',
                    toolCallId,
                    toolName,
                    status: nextStatus,
                    params: message.params || message.input || message.arguments,
                    result: message.toolResult || message.result,
                }];
            }
            return prev.map(event => event.kind === 'tool' && event.toolCallId === toolCallId
                ? {
                    ...event,
                    toolName,
                    status: nextStatus,
                    params: message.params || message.input || message.arguments || event.params,
                    result: message.toolResult || message.result || event.result,
                }
                : event);
        });
    }, []);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.eko?.onStreamMessage) return;
        const unsubscribe = api.eko.onStreamMessage((message: any) => {
            const type = message.type;
            if (type === 'thinking' || type === 'chat_thinking') {
                upsertThinking(message.streamId || type, textFrom(message.text ?? message.thinking ?? message.content), Boolean(message.streamDone));
                return;
            }
            if (type === 'tool_streaming') {
                upsertTool(message, 'streaming');
                return;
            }
            if (type === 'tool_use' || type === 'chat_tool_use') {
                upsertTool(message, 'running');
                return;
            }
            if (type === 'tool_result' || type === 'chat_tool_result') {
                upsertTool(message, 'completed');
                return;
            }
            if (type === 'workflow_confirm') {
                const confirmId = message.confirmId || makeId('confirm');
                setIsPlanReady(true);
                setCurrentConfirmId(confirmId);
                if (message.taskId) setCurrentTaskId(message.taskId);
                appendEvent({
                    id: makeId('plan'),
                    kind: 'plan',
                    taskId: message.taskId || '',
                    confirmId,
                    workflow: message.workflow,
                    status: 'pending',
                });
                return;
            }
            if (type === 'human_interaction') {
                setShowHalt(true);
                setCurrentRequestId(message.requestId || '');
                appendEvent({
                    id: makeId('halt'),
                    kind: 'halt',
                    requestId: message.requestId || '',
                    prompt: message.prompt || 'The agent needs your input to continue.',
                    interactType: message.interactType,
                    options: message.selectOptions,
                });
                return;
            }
            if (type === 'chat_text' || type === 'text') {
                upsertAssistantText(message.streamId || message.messageId || type, textFrom(message.text ?? message.content));
                return;
            }
            if (type === 'agent_start') {
                appendEvent({ id: makeId('status'), kind: 'status', content: `${message.agentName || 'Agent'} started`, tone: 'muted' });
                return;
            }
            if (type === 'agent_result') {
                const agentName = message.agentName || message.agentNode?.name || 'Agent';
                const resultText = textFrom(message.result || '');
                const normalizedResult = normalizeForDedupe(resultText);

                if (normalizedResult && normalizedResult !== lastAssistantTextRef.current) {
                    upsertAssistantText(message.streamId || message.messageId || `agent_result_${agentName}`, resultText);
                }
                appendEvent({ id: makeId('status'), kind: 'status', content: `${agentName} finished`, tone: 'ok' });
                return;
            }
            if (type === 'task_complete') {
                setIsExec(false);
                try {
                    const resultText = textFrom(message.result?.result ?? message.result ?? '');
                    const store = useAgentStore.getState();
                    if (resultText) store.completeAgent(resultText);
                    else store.stopAgent();
                } catch {
                    // ignore
                }
                appendEvent({ id: makeId('status'), kind: 'status', content: 'Task completed successfully.', tone: 'ok' });
                return;
            }
            if (type === 'task_error' || type === 'error') {
                setIsExec(false);
                try {
                    useAgentStore.getState().stopAgent();
                } catch {
                    // ignore
                }
                appendEvent({
                    id: makeId('error'),
                    kind: 'error',
                    content: message.error || 'Task failed',
                    detail: message.detail,
                });
            }
        });

        return unsubscribe;
    }, [appendEvent, upsertAssistantText, upsertThinking, upsertTool]);

    const ensureModelReady = useCallback(() => {
        const selected = selectableGroups.some(group => group.id === llmProvider && group.enabledModels.includes(llmModel));
        if (selected) return true;
        appendEvent({
            id: makeId('error'),
            kind: 'error',
            content: 'No enabled model selected. Enable a model in Settings first.',
        });
        return false;
    }, [appendEvent, llmModel, llmProvider, selectableGroups]);

    const handleHaltReply = useCallback(() => {
        if (!haltPrompt.trim()) return;
        const api = window.electronAPI;
        if (api?.eko && currentRequestId) {
            api.eko.humanResponse({ requestId: currentRequestId, success: true, result: haltPrompt.trim() });
        }
        appendEvent({ id: makeId('user'), kind: 'user', content: haltPrompt.trim() });
        setHaltPrompt('');
        setShowHalt(false);
        setCurrentRequestId('');
    }, [appendEvent, currentRequestId, haltPrompt]);

    const configureAgent = useCallback(async () => {
        const api = window.electronAPI;
        if (!api?.eko) throw new Error('Agent API not available');
        await api.eko.configure({ provider: llmProvider, model: llmModel, screenshotEnabled });
    }, [llmModel, llmProvider, screenshotEnabled]);

    const handleChatWithPrompt = useCallback(async (textToSubmit: string) => {
        if (!textToSubmit.trim() || !ensureModelReady()) return;
        setIsExec(true);
        sawStreamTextRef.current = false;
        appendEvent({ id: makeId('user'), kind: 'user', content: textToSubmit });
        useAgentWorkspaceStore.getState().openWorkspace();
        try {
            await configureAgent();
            const response = await window.electronAPI!.eko.chatRun(chatId, makeId('chat-msg'), textToSubmit);
            if (response?.success && response?.data?.result && !sawStreamTextRef.current) {
                appendEvent({ id: makeId('assistant'), kind: 'assistant', content: response.data.result });
            } else if (response?.data?.error || response?.error) {
                appendEvent({ id: makeId('error'), kind: 'error', content: response.data?.error || response.error });
            }
        } catch (error: any) {
            appendEvent({ id: makeId('error'), kind: 'error', content: error.message || 'Chat failed' });
        } finally {
            setIsExec(false);
        }
    }, [appendEvent, chatId, configureAgent, ensureModelReady]);

    const handleResearchWithPrompt = useCallback(async (textToSubmit: string) => {
        if (!textToSubmit.trim() || !ensureModelReady()) return;
        setIsExec(true);
        sawStreamTextRef.current = false;
        setIsPlanReady(false);
        setCurrentConfirmId('');
        appendEvent({ id: makeId('user'), kind: 'user', content: textToSubmit });
        startAgent(textToSubmit, activeTabId || '');
        useAgentWorkspaceStore.getState().openWorkspace();
        try {
            await configureAgent();
            const response = await window.electronAPI!.eko.run(textToSubmit, false);
            if (response?.success && response?.data?.taskId) {
                setCurrentTaskId(response.data.taskId);
            } else if (response?.data?.stopReason === 'abort') {
                appendEvent({ id: makeId('status'), kind: 'status', content: 'Task cancelled.', tone: 'muted' });
            } else if (!response?.success && response?.error) {
                appendEvent({ id: makeId('error'), kind: 'error', content: response.error });
            }
        } catch (error: any) {
            setError(error.message);
            appendEvent({ id: makeId('error'), kind: 'error', content: error.message || 'Task failed' });
        } finally {
            setIsExec(false);
        }
    }, [activeTabId, appendEvent, configureAgent, ensureModelReady, setError, startAgent]);

    const handleChat = useCallback(() => handleChatWithPrompt(prompt), [handleChatWithPrompt, prompt]);
    const handleResearch = useCallback(() => handleResearchWithPrompt(prompt), [handleResearchWithPrompt, prompt]);

    const handleSuggestionClick = useCallback((suggestionText: string) => {
        setPrompt('');
        if (agentMode === 'chat') {
            handleChatWithPrompt(suggestionText);
        } else {
            handleResearchWithPrompt(suggestionText);
        }
    }, [agentMode, handleChatWithPrompt, handleResearchWithPrompt]);

    const approvePlan = useCallback(async () => {
        setIsPlanReady(false);
        setEvents(prev => prev.map(event => event.kind === 'plan' && event.confirmId === currentConfirmId
            ? { ...event, status: 'approved' }
            : event));
        appendEvent({ id: makeId('status'), kind: 'status', content: 'Plan approved. Executing...', tone: 'ok' });
        try {
            const api = window.electronAPI;
            if (!api?.eko) throw new Error('Agent API not available');
            await api.eko.workflowConfirmResponse(currentConfirmId, true);
        } catch (error: any) {
            appendEvent({ id: makeId('error'), kind: 'error', content: error.message || 'Failed to approve plan' });
        }
    }, [appendEvent, currentConfirmId]);

    const rejectPlan = useCallback(() => {
        setIsPlanReady(false);
        setIsExec(false);
        setEvents(prev => prev.map(event => event.kind === 'plan' && event.confirmId === currentConfirmId
            ? { ...event, status: 'rejected' }
            : event));
        stopAgent();
        const api = window.electronAPI;
        if (api?.eko && currentConfirmId) {
            api.eko.workflowConfirmResponse(currentConfirmId, false);
        }
        appendEvent({ id: makeId('status'), kind: 'status', content: 'Plan rejected.', tone: 'muted' });
    }, [appendEvent, currentConfirmId, stopAgent]);

    const handleSubmit = useCallback(() => {
        if (!canSend) return;
        agentMode === 'chat' ? handleChat() : handleResearch();
        setPrompt('');
    }, [agentMode, canSend, handleChat, handleResearch]);

    const handleKey = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit]);

    const stopCurrentTask = useCallback(() => {
        const api = window.electronAPI;
        if (api?.eko) {
            if (agentMode === 'chat') api.eko.chatCancel(chatId);
            else if (currentTaskId) api.eko.cancelTask(currentTaskId);
        }
        stopAgent();
        setIsExec(false);
    }, [agentMode, chatId, currentTaskId, stopAgent]);

    const setModelEnabled = useCallback((providerId: string, models: string[]) => {
        setEnabledModels(providerId, models);
        if (providerId === llmProvider && models.length > 0 && !models.includes(llmModel)) {
            setLLMModel(models[0]);
        }
    }, [llmModel, llmProvider, setEnabledModels, setLLMModel]);

    return {
        prompt,
        setPrompt,
        isExec,
        events,
        isPlanReady,
        showPicker,
        setShowPicker,
        pickerMode,
        setPickerMode,
        haltPrompt,
        setHaltPrompt,
        showHalt,
        modelLabel,
        suggestions,
        selectableGroups,
        providerGroups,
        enabledModels,
        llmProvider,
        llmModel,
        setLLMProvider,
        setLLMModel,
        currentProviderName,
        handleHaltReply,
        handleSuggestionClick,
        approvePlan,
        rejectPlan,
        handleSubmit,
        handleKey,
        stopCurrentTask,
        setModelEnabled,
        agentMode,
        setAgentMode,
        activeTab,
        screenshotEnabled,
        streamingText,
        status,
        canSend,
        isVisible,
    };
}

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';
export type LogViewMode = 'user' | 'dev';

export interface AgentLog {
    id: string;
    timestamp: number;
    type: 'thought' | 'action' | 'observation' | 'error' | 'tool';
    content: string;
    reason?: string; // Why this action was taken
    toolName?: string;
    toolParams?: Record<string, unknown>;
    duration?: number;
}

export interface ToolUsage {
    name: string;
    params: Record<string, unknown>;
    result?: string;
    status: 'pending' | 'running' | 'success' | 'error';
    startTime: number;
    endTime?: number;
}

// Timeline step for step-by-step playback
export interface TimelineStep {
    id: string;
    action: string; // User-friendly action description
    status: 'pending' | 'running' | 'completed' | 'error';
    timestamp: number;
    details?: string;
}

// Task history item for storing completed tasks
export interface TaskHistoryItem {
    id: string;
    prompt: string;
    result: string;
    status: 'completed' | 'error';
    startTime: number;
    endTime: number;
    duration: number; // in ms
    timeline: TimelineStep[];
}

interface AgentState {
    status: AgentStatus;
    prompt: string;
    logs: AgentLog[];
    currentStep: number;
    totalSteps: number;
    currentTool: ToolUsage | null;
    toolHistory: ToolUsage[];
    streamingText: string;
    error: string | null;
    // Tab binding - agent can work on multiple tabs
    assignedTabIds: string[];
    // Initialization state
    isInitialized: boolean;
    isInitializing: boolean;
    initializationError: string | null;
    shouldLazyInit: boolean;
    // UI Enhancement state
    logViewMode: LogViewMode;
    timeline: TimelineStep[];
    taskHistory: TaskHistoryItem[];
    taskStartTime: number | null;
    soundEnabled: boolean;
}

interface AgentActions {
    startAgent: (prompt: string, tabId: string) => void;
    pauseAgent: () => void;
    resumeAgent: () => void;
    stopAgent: () => void;
    completeAgent: (result: string) => void;
    addLog: (log: Omit<AgentLog, 'id' | 'timestamp'>) => void;
    setStep: (current: number, total: number) => void;
    setStreamingText: (text: string) => void;
    appendStreamingText: (chunk: string) => void;
    startTool: (name: string, params: Record<string, unknown>) => void;
    completeTool: (result: string, success: boolean) => void;
    setError: (error: string) => void;
    reset: () => void;
    // Tab binding - multi-tab support
    getAssignedTabId: () => string | null;
    getAssignedTabIds: () => string[];
    addAssignedTab: (tabId: string) => void;
    removeAssignedTab: (tabId: string) => void;
    // Lazy initialization
    requestLazyInit: () => void;
    clearLazyInit: () => void;
    // Initialization actions
    initializeAgent: (provider: string, model: string) => Promise<boolean>;
    reinitializeAgent: (provider: string, model: string) => Promise<boolean>;
    setInitialized: (initialized: boolean) => void;
    // UI Enhancement actions
    setLogViewMode: (mode: LogViewMode) => void;
    toggleLogViewMode: () => void;
    addTimelineStep: (action: string, details?: string) => void;
    completeTimelineStep: (stepId: string, status?: 'completed' | 'error') => void;
    saveToHistory: () => void;
    deleteHistoryItem: (id: string) => void;
    clearHistory: () => void;
    toggleSound: () => void;
}

type AgentStore = AgentState & AgentActions;

const initialState: AgentState = {
    status: 'idle',
    prompt: '',
    logs: [],
    currentStep: 0,
    totalSteps: 0,
    currentTool: null,
    toolHistory: [],
    streamingText: '',
    error: null,
    // Multi-tab binding
    assignedTabIds: [],
    // Initialization defaults
    isInitialized: false,
    isInitializing: false,
    initializationError: null,
    shouldLazyInit: false,
    // UI Enhancement defaults
    logViewMode: 'user',
    timeline: [],
    taskHistory: [],
    taskStartTime: null,
    soundEnabled: true,
};

const generateLogId = () => `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useAgentStore = create<AgentStore>()(
    devtools(
        (set, get) => ({
            ...initialState,

            startAgent: (prompt, tabId) => {
                console.log('[AgentStore] Starting agent on tab:', tabId);
                set({
                    status: 'running',
                    prompt,
                    logs: [],
                    currentStep: 0,
                    totalSteps: 0,
                    currentTool: null,
                    toolHistory: [],
                    streamingText: '',
                    error: null,
                    assignedTabIds: [tabId],
                    shouldLazyInit: false,
                    // UI Enhancement - track task timing & reset timeline
                    taskStartTime: Date.now(),
                    timeline: [],
                });
            },

            pauseAgent: () => {
                if (get().status === 'running') {
                    set({ status: 'paused' });
                }
            },

            resumeAgent: () => {
                if (get().status === 'paused') {
                    set({ status: 'running' });
                }
            },

            stopAgent: () => {
                set({ status: 'idle' });
            },

            addLog: (log) => {
                const newLog: AgentLog = {
                    ...log,
                    id: generateLogId(),
                    timestamp: Date.now(),
                };
                set((state) => ({
                    logs: [...state.logs, newLog],
                }));
            },

            setStep: (current, total) => {
                set({ currentStep: current, totalSteps: total });
            },

            setStreamingText: (text) => {
                set({ streamingText: text });
            },

            appendStreamingText: (chunk) => {
                set((state) => ({
                    streamingText: state.streamingText + chunk,
                }));
            },

            startTool: (name, params) => {
                const tool: ToolUsage = {
                    name,
                    params,
                    status: 'running',
                    startTime: Date.now(),
                };
                set({ currentTool: tool });
                get().addLog({
                    type: 'tool',
                    content: `Using tool: ${name}`,
                    toolName: name,
                    toolParams: params,
                });
            },

            completeTool: (result, success) => {
                const { currentTool } = get();
                if (currentTool) {
                    const completedTool: ToolUsage = {
                        ...currentTool,
                        result,
                        status: success ? 'success' : 'error',
                        endTime: Date.now(),
                    };
                    set((state) => ({
                        currentTool: null,
                        toolHistory: [...state.toolHistory, completedTool],
                    }));
                }
            },

            setError: (error) => {
                set({ status: 'error', error });
                get().addLog({ type: 'error', content: error });
            },

            // Get the primary tab ID the agent is bound to
            getAssignedTabId: () => {
                const tabIds = get().assignedTabIds;
                return tabIds.length > 0 ? tabIds[0] : null;
            },

            // Get all assigned tab IDs
            getAssignedTabIds: () => {
                return get().assignedTabIds;
            },

            // Add a tab to the agent's assigned tabs
            addAssignedTab: (tabId) => {
                const current = get().assignedTabIds;
                if (!current.includes(tabId)) {
                    set({ assignedTabIds: [...current, tabId] });
                    console.log('[AgentStore] Added tab to agent:', tabId);
                }
            },

            // Remove a tab from the agent's assigned tabs
            removeAssignedTab: (tabId) => {
                const current = get().assignedTabIds;
                set({ assignedTabIds: current.filter(id => id !== tabId) });
                console.log('[AgentStore] Removed tab from agent:', tabId);
            },

            // Request lazy initialization (when panel opens)
            requestLazyInit: () => {
                if (!get().isInitialized && !get().isInitializing) {
                    set({ shouldLazyInit: true });
                    console.log('[AgentStore] Lazy init requested');
                }
            },

            // Clear lazy init flag after initialization
            clearLazyInit: () => {
                set({ shouldLazyInit: false });
            },

            reset: () => {
                set(initialState);
            },

            // Initialization actions
            initializeAgent: async (provider, model) => {
                set({ isInitializing: true, initializationError: null });

                try {
                    const { electronAPI } = window;
                    if (!electronAPI?.eko) {
                        throw new Error('Electron API not available');
                    }

                    const result = await electronAPI.eko.configure({ provider, model });

                    if (result.success) {
                        set({ isInitialized: true, isInitializing: false });
                        get().addLog({ type: 'observation', content: `Agent configured with ${provider}/${model}` });
                        return true;
                    } else {
                        set({
                            isInitialized: false,
                            isInitializing: false,
                            initializationError: result.error || 'Failed to configure agent'
                        });
                        return false;
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    set({
                        isInitialized: false,
                        isInitializing: false,
                        initializationError: errorMessage
                    });
                    return false;
                }
            },

            reinitializeAgent: async (provider, model) => {
                // Reset state
                set({ isInitialized: false, error: null });

                // Reinitialize with new config
                return get().initializeAgent(provider, model);
            },

            setInitialized: (initialized) => {
                set({ isInitialized: initialized });
            },

            // ========== UI Enhancement Actions ==========

            // Complete agent task with result summary
            completeAgent: (result) => {
                const startTime = get().taskStartTime;
                const endTime = Date.now();
                set({
                    status: 'completed',
                    streamingText: result,
                });

                // Play completion sound if enabled
                if (get().soundEnabled) {
                    try {
                        // Create a simple completion beep
                        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
                        const oscillator = audioContext.createOscillator();
                        const gainNode = audioContext.createGain();
                        oscillator.connect(gainNode);
                        gainNode.connect(audioContext.destination);
                        oscillator.frequency.value = 880; // A5 note
                        oscillator.type = 'sine';
                        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                        oscillator.start(audioContext.currentTime);
                        oscillator.stop(audioContext.currentTime + 0.3);
                    } catch {
                        // Audio not available
                    }
                }

                // Auto-save to history
                if (startTime) {
                    get().saveToHistory();
                }

                get().addLog({
                    type: 'observation',
                    content: `✅ Task completed in ${startTime ? ((endTime - startTime) / 1000).toFixed(1) + 's' : 'unknown time'}`
                });
            },

            // Set log view mode (user-friendly vs developer)
            setLogViewMode: (mode) => {
                set({ logViewMode: mode });
            },

            // Toggle between user and dev log views
            toggleLogViewMode: () => {
                set({ logViewMode: get().logViewMode === 'user' ? 'dev' : 'user' });
            },

            // Add a step to the timeline
            addTimelineStep: (action, details) => {
                const step: TimelineStep = {
                    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    action,
                    status: 'running',
                    timestamp: Date.now(),
                    details,
                };
                set((state) => ({
                    timeline: [...state.timeline, step],
                }));
                return step.id;
            },

            // Complete a timeline step
            completeTimelineStep: (stepId, status = 'completed') => {
                set((state) => ({
                    timeline: state.timeline.map(step =>
                        step.id === stepId ? { ...step, status } : step
                    ),
                }));
            },

            // Save current task to history
            saveToHistory: () => {
                const { prompt, timeline, taskStartTime, status, streamingText } = get();
                if (!prompt || !taskStartTime) return;

                const endTime = Date.now();
                const historyItem: TaskHistoryItem = {
                    id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    prompt,
                    result: streamingText || 'No result captured',
                    status: status === 'error' ? 'error' : 'completed',
                    startTime: taskStartTime,
                    endTime,
                    duration: endTime - taskStartTime,
                    timeline: [...timeline],
                };

                set((state) => ({
                    taskHistory: [historyItem, ...state.taskHistory].slice(0, 50), // Keep last 50 tasks
                }));

                console.log('[AgentStore] Task saved to history:', historyItem.id);
            },

            // Delete a history item
            deleteHistoryItem: (id) => {
                set((state) => ({
                    taskHistory: state.taskHistory.filter(item => item.id !== id),
                }));
            },

            // Clear all history
            clearHistory: () => {
                set({ taskHistory: [] });
            },

            // Toggle sound on/off
            toggleSound: () => {
                set({ soundEnabled: !get().soundEnabled });
            },
        }),
        { name: 'AgentStore' }
    )
);

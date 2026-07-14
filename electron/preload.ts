import { contextBridge, ipcRenderer } from 'electron';

// ============ SECURE MAIN WINDOW PRELOAD ============
// Uses contextBridge for full security (contextIsolation: true)
// Screen capture is handled by separate hidden worker window

// Types
interface CaptureToggleResult {
    success: boolean;
    active: boolean;
}

interface CaptureStats {
    type: string;
    fps?: number;
    frameCount?: number;
    width?: number;
    height?: number;
    timestamp?: number;
}

interface ValidationResult {
    valid: boolean;
    statusCode: number;
    message: string;
    error?: string;
}

interface AgentResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

// Expose protected methods via contextBridge (SECURE)
contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    window: {
        minimize: () => ipcRenderer.send('window:minimize'),
        maximize: () => ipcRenderer.send('window:maximize'),
        close: () => ipcRenderer.send('window:close'),
        create: () => ipcRenderer.send('window:create'),
        isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
        toggleFullScreen: () => ipcRenderer.send('window:toggleFullScreen'),
        isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
        onFullScreenChange: (callback: (isFullScreen: boolean) => void) => {
            const h = (_: any, isFullScreen: boolean) => callback(isFullScreen);
            ipcRenderer.on('window:fullscreen-change', h);
            return () => ipcRenderer.removeListener('window:fullscreen-change', h);
        },
        onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
            ipcRenderer.on('window:maximized', (_, isMaximized) => callback(isMaximized));
        },
    },
    webview: {
        showContextMenu: (params: any) => ipcRenderer.send('webview:show-context-menu', params),
        onOpenLinkNewTab: (callback: (url: string) => void) => {
            const h = (_: any, url: string) => callback(url);
            ipcRenderer.on('webview:open-link-new-tab', h);
            return () => ipcRenderer.removeListener('webview:open-link-new-tab', h);
        },
        onActionBack: (callback: (tabId: string) => void) => {
            const h = (_: any, tabId: string) => callback(tabId);
            ipcRenderer.on('webview:action-back', h);
            return () => ipcRenderer.removeListener('webview:action-back', h);
        },
        onActionForward: (callback: (tabId: string) => void) => {
            const h = (_: any, tabId: string) => callback(tabId);
            ipcRenderer.on('webview:action-forward', h);
            return () => ipcRenderer.removeListener('webview:action-forward', h);
        },
        onActionReload: (callback: (tabId: string) => void) => {
            const h = (_: any, tabId: string) => callback(tabId);
            ipcRenderer.on('webview:action-reload', h);
            return () => ipcRenderer.removeListener('webview:action-reload', h);
        },
        onActionInspect: (callback: (info: { id: string; x: number; y: number }) => void) => {
            const h = (_: any, info: any) => callback(info);
            ipcRenderer.on('webview:action-inspect', h);
            return () => ipcRenderer.removeListener('webview:action-inspect', h);
        },
    },

    // Theme
    theme: {
        get: () => ipcRenderer.invoke('theme:get'),
        set: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke('theme:set', theme),
        onChange: (callback: (theme: 'light' | 'dark') => void) => {
            ipcRenderer.on('theme:changed', (_, theme) => callback(theme));
        },
    },

    // Platform info
    platform: {
        get: () => ipcRenderer.invoke('platform:get'),
    },

    // Desktop Capturer - for valid display tracks with displaySurface metadata
    desktopCapturer: {
        getSources: (opts: { types: Array<'screen' | 'window'>; thumbnailSize?: { width: number; height: number } }) =>
            ipcRenderer.invoke('desktopCapturer:getSources', opts),
    },

    // Privacy Recorder - zero-copy GPU recording with blur
    recorder: {
        start: (config?: { fps?: number; outputPath?: string; privacyEnabled?: boolean }) =>
            ipcRenderer.invoke('recorder:start', config || {}),
        stop: () => ipcRenderer.invoke('recorder:stop'),
        getStatus: () => ipcRenderer.invoke('recorder:getStatus'),
        getLastRecordingPath: () => ipcRenderer.invoke('recorder:getLastRecordingPath'),
        setLastRecordingPath: (path: string) => ipcRenderer.invoke('recorder:setLastRecordingPath', path),
        onStatus: (callback: (status: any) => void) => {
            const h = (_: any, status: any) => callback(status);
            ipcRenderer.on('recorder:status', h);
            return () => ipcRenderer.removeListener('recorder:status', h);
        },
        onReady: (callback: (info: any) => void) => {
            const h = (_: any, info: any) => callback(info);
            ipcRenderer.on('recorder:ready', h);
            return () => ipcRenderer.removeListener('recorder:ready', h);
        },
        onError: (callback: (error: any) => void) => {
            const h = (_: any, error: any) => callback(error);
            ipcRenderer.on('recorder:error', h);
            return () => ipcRenderer.removeListener('recorder:error', h);
        },
    },

    // Log Buffer - for CDP log synchronization
    logBuffer: {
        init: () => ipcRenderer.invoke('logBuffer:init'),
        push: (timestamp_ms: number, type: number, payload: string) =>
            ipcRenderer.invoke('logBuffer:push', timestamp_ms, type, payload),
        clear: () => ipcRenderer.invoke('logBuffer:clear'),
        getCount: () => ipcRenderer.invoke('logBuffer:getCount'),
        setRecordingStart: (epochMs: number) => ipcRenderer.invoke('logs:setRecordingStart', epochMs),
        getAllLogs: () => ipcRenderer.invoke('logs:getAllLogs'),
    },

    // Video Ring Buffer - 2 minute RAM buffer for flight recorder style recording
    ringBuffer: {
        init: () => ipcRenderer.invoke('ringBuffer:init'),
        start: () => ipcRenderer.invoke('ringBuffer:start'),
        stop: () => ipcRenderer.invoke('ringBuffer:stop'),
        clear: () => ipcRenderer.invoke('ringBuffer:clear'),
        isRecording: () => ipcRenderer.invoke('ringBuffer:isRecording'),
        getStatus: () => ipcRenderer.invoke('ringBuffer:getStatus'),
        save: (outputPath: string) => ipcRenderer.invoke('ringBuffer:save', outputPath),
    },


    // Netsurf Export - save/open recordings in .netsurf ZIP format
    netsurf: {
        saveNetsurf: (outputPath: string) =>
            ipcRenderer.invoke('netsurf:saveNetsurf', outputPath),
        openRecording: async (filePath: string) => {
            const result = await ipcRenderer.invoke('netsurf:openRecording', filePath);
            if (result?.success && result.videoBuffer) {
                const blob = new Blob([result.videoBuffer], { type: 'video/mp4' });
                result.videoUrl = URL.createObjectURL(blob);
                delete result.videoBuffer;
            }
            return result;
        },
        saveRecording: (start_ms: number, end_ms: number, output_path: string, video_path?: string) =>
            ipcRenderer.invoke('netsurf:saveRecording', start_ms, end_ms, output_path, video_path),
    },

    // Unified NetSurf Recorder - single-command API
    netsurfRecorder: {
        start: (opts?: { fps?: 30 | 60; durationMinutes?: 1 | 2 | 3 | 4 | 5 }) =>
            ipcRenderer.invoke('netsurfRecorder:start', opts),
        stop: () => ipcRenderer.invoke('netsurfRecorder:stop'),
        save: (outputPath: string) => ipcRenderer.invoke('netsurfRecorder:save', outputPath),
        status: () => ipcRenderer.invoke('netsurfRecorder:status'),
    },

    // Dialog APIs for file picker
    dialog: {
        showSaveDialog: (options: any) => ipcRenderer.invoke('dialog:showSaveDialog', options),
        showOpenDialog: (options: any) => ipcRenderer.invoke('dialog:showOpenDialog', options),
    },

    // Keyboard shortcuts
    shortcuts: {
        onNewTab: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:newTab', h);
            return () => ipcRenderer.removeListener('shortcut:newTab', h);
        },
        onCloseTab: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:closeTab', h);
            return () => ipcRenderer.removeListener('shortcut:closeTab', h);
        },
        onNextTab: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:nextTab', h);
            return () => ipcRenderer.removeListener('shortcut:nextTab', h);
        },
        onPrevTab: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:prevTab', h);
            return () => ipcRenderer.removeListener('shortcut:prevTab', h);
        },
        onReopenTab: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:reopenTab', h);
            return () => ipcRenderer.removeListener('shortcut:reopenTab', h);
        },
        onHistory: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:history', h);
            return () => ipcRenderer.removeListener('shortcut:history', h);
        },
        onNewWindow: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:newWindow', h);
            return () => ipcRenderer.removeListener('shortcut:newWindow', h);
        },
        onToggleVerticalMode: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:toggleVerticalMode', h);
            return () => ipcRenderer.removeListener('shortcut:toggleVerticalMode', h);
        },
        onReload: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:reload', h);
            return () => ipcRenderer.removeListener('shortcut:reload', h);
        },
        onGoBack: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:goBack', h);
            return () => ipcRenderer.removeListener('shortcut:goBack', h);
        },
        onGoForward: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:goForward', h);
            return () => ipcRenderer.removeListener('shortcut:goForward', h);
        },
        onToggleSidebar: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('shortcut:toggleSidebar', h);
            return () => ipcRenderer.removeListener('shortcut:toggleSidebar', h);
        },
    },

    // Tab sync for BrowserAgent
    tabs: {
        sync: (tabInfos: Array<{ tabId: number; webContentsId: number; url: string; title: string }>, activeTabId: number) =>
            ipcRenderer.invoke('tabs:sync', tabInfos, activeTabId),
        // Agent workspace sync
        syncAgentWebviews: (webviews: Array<{ id: string; webContentsId: number; url: string; title: string }>, focusedId: string | null) =>
            ipcRenderer.invoke('tabs:syncAgentWebviews', webviews, focusedId),
        onSwitchTab: (callback: (tabId: number) => void) => {
            const h = (_: any, tabId: number) => callback(tabId);
            ipcRenderer.on('agent:switch-tab', h);
            return () => ipcRenderer.removeListener('agent:switch-tab', h);
        },
        onCreateTab: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('agent:create-tab', h);
            return () => ipcRenderer.removeListener('agent:create-tab', h);
        },
        // Workspace events from backend
        onOpenWorkspace: (callback: () => void) => {
            const h = () => callback();
            ipcRenderer.on('agent:open-workspace', h);
            return () => ipcRenderer.removeListener('agent:open-workspace', h);
        },
        onAgentAddWebview: (callback: (label: string, url: string) => void) => {
            const h = (_: any, label: string, url: string) => callback(label, url);
            ipcRenderer.on('agent:add-webview', h);
            return () => ipcRenderer.removeListener('agent:add-webview', h);
        },
        onAgentFocusWebview: (callback: (webviewId: string) => void) => {
            const h = (_: any, webviewId: string) => callback(webviewId);
            ipcRenderer.on('agent:focus-webview', h);
            return () => ipcRenderer.removeListener('agent:focus-webview', h);
        },
        // Destroy webContents to free memory when tab is closed
        destroyWebContents: (webContentsId: number) =>
            ipcRenderer.send('tabs:destroyWebContents', webContentsId),
    },

    // Settings API
    settings: {
        openWindow: () =>
            ipcRenderer.invoke('settings:openWindow'),
        saveApiKey: (provider: string, apiKey: string) =>
            ipcRenderer.invoke('settings:saveApiKey', provider, apiKey),
        getApiKey: (provider: string) =>
            ipcRenderer.invoke('settings:getApiKey', provider),
        deleteApiKey: (provider: string) =>
            ipcRenderer.invoke('settings:deleteApiKey', provider),
        hasApiKey: (provider: string) =>
            ipcRenderer.invoke('settings:hasApiKey', provider),
        validateApiKey: (provider: string, apiKey: string): Promise<ValidationResult> =>
            ipcRenderer.invoke('settings:validateApiKey', provider, apiKey),
        getProviders: () =>
            ipcRenderer.invoke('settings:getProviders'),
        getProviderKeys: () =>
            ipcRenderer.invoke('settings:getProviderKeys'),
        getConfiguredProviders: () =>
            ipcRenderer.invoke('settings:getConfiguredProviders'),
        // Local server URL management
        saveLocalServerUrl: (url: string) =>
            ipcRenderer.invoke('settings:saveLocalServerUrl', url),
        getLocalServerUrl: () =>
            ipcRenderer.invoke('settings:getLocalServerUrl'),
        testLocalServer: (url: string): Promise<ValidationResult> =>
            ipcRenderer.invoke('settings:testLocalServer', url),
        deleteLocalServer: () =>
            ipcRenderer.invoke('settings:deleteLocalServer'),
        hasLocalServer: () =>
            ipcRenderer.invoke('settings:hasLocalServer'),
        // Fetch models from provider API. Second arg is a temporary API key, or local base URL.
        fetchModels: (provider: string, credentialOrBaseUrl?: string) =>
            ipcRenderer.invoke('settings:fetchModels', provider, credentialOrBaseUrl),
    },

    // Eko Agent API — Full-featured agent service
    eko: {
        // Task execution (Explore mode)
        run: (message: string, skipConfirm?: boolean) =>
            ipcRenderer.invoke('eko:run', message, skipConfirm),
        modify: (taskId: string, message: string) =>
            ipcRenderer.invoke('eko:modify', taskId, message),
        execute: (taskId: string) =>
            ipcRenderer.invoke('eko:execute', taskId),
        pauseTask: (taskId: string, pause: boolean) =>
            ipcRenderer.invoke('eko:pause-task', taskId, pause),
        cancelTask: (taskId: string) =>
            ipcRenderer.invoke('eko:cancel-task', taskId),

        // Workflow confirm
        workflowConfirmResponse: (confirmId: string, confirmed: boolean, modifiedWorkflow?: any) =>
            ipcRenderer.invoke('eko:workflow-confirm-response', confirmId, confirmed, modifiedWorkflow),
        regenerateWorkflow: (taskId: string) =>
            ipcRenderer.invoke('eko:regenerate-workflow', taskId),

        // Human interaction
        humanResponse: (response: { requestId: string; success: boolean; result?: any; error?: string }) =>
            ipcRenderer.invoke('eko:human-response', response),

        // Task context (for restore/continue)
        getTaskContext: (taskId: string) =>
            ipcRenderer.invoke('eko:get-task-context', taskId),
        restoreTask: (workflow: any, contextParams?: any, chainPlanRequest?: any, chainPlanResult?: string) =>
            ipcRenderer.invoke('eko:restore-task', workflow, contextParams, chainPlanRequest, chainPlanResult),

        // Chat mode
        chatRun: (chatId: string, messageId: string, text: string) =>
            ipcRenderer.invoke('eko:chat-run', chatId, messageId, text),
        chatCancel: (chatId: string) =>
            ipcRenderer.invoke('eko:chat-cancel', chatId),

        // Configuration
        configure: (config: { provider: string; model: string; screenshotEnabled?: boolean }) =>
            ipcRenderer.invoke('eko:configure', config),
        reloadConfig: () =>
            ipcRenderer.invoke('eko:reload-config'),

        // Unified stream message listener (single channel for all events)
        onStreamMessage: (callback: (message: any) => void) => {
            const h = (_: unknown, message: any) => callback(message);
            ipcRenderer.on('eko-stream-message', h);
            return () => ipcRenderer.removeListener('eko-stream-message', h);
        },
    },

    // Voice Transcription API (whisper.cpp)
    voice: {
        transcribe: (audioPath: string) =>
            ipcRenderer.invoke('voice:transcribe-local', audioPath),
        downloadModel: () =>
            ipcRenderer.invoke('voice:download-model'),
        checkStatus: () =>
            ipcRenderer.invoke('voice:check-status'),
        saveTempAudio: (buffer: ArrayBuffer) =>
            ipcRenderer.invoke('voice:save-temp-audio', buffer),
        onDownloadProgress: (callback: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void) => {
            const h = (_: any, progress: any) => callback(progress);
            ipcRenderer.on('voice:download-progress', h);
            return () => ipcRenderer.removeListener('voice:download-progress', h);
        },
        // Streaming API (whisper-stream.exe)
        startStream: () =>
            ipcRenderer.invoke('voice:start-stream'),
        stopStream: () =>
            ipcRenderer.invoke('voice:stop-stream'),
        onPartialTranscript: (callback: (data: { text: string; chunkIndex: number; isFinal: boolean }) => void) => {
            const h = (_: any, data: any) => callback(data);
            ipcRenderer.on('voice:partial-transcript', h);
            return () => ipcRenderer.removeListener('voice:partial-transcript', h);
        },
    },

    // Ad Blocker API
    adblock: {
        setEnabled: (enabled: boolean) =>
            ipcRenderer.invoke('adblock:setEnabled', enabled),
        getState: () =>
            ipcRenderer.invoke('adblock:getState'),
        getStats: () =>
            ipcRenderer.invoke('adblock:getStats'),
        addToWhitelist: (domain: string) =>
            ipcRenderer.invoke('adblock:addToWhitelist', domain),
        removeFromWhitelist: (domain: string) =>
            ipcRenderer.invoke('adblock:removeFromWhitelist', domain),
        addCustomRule: (rule: string) =>
            ipcRenderer.invoke('adblock:addCustomRule', rule),
        removeCustomRule: (rule: string) =>
            ipcRenderer.invoke('adblock:removeCustomRule', rule),
        refreshFilters: () =>
            ipcRenderer.invoke('adblock:refreshFilters'),
        resetTabCount: () =>
            ipcRenderer.send('adblock:resetTabCount'),
    },
});

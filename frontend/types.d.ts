/// <reference types="vite/client" />
/// <reference types="electron" />

import React from 'react';

// Types for settings API
export interface ValidationResult {
    valid: boolean;
    statusCode: number;
    message: string;
    error?: string;
}

export interface AgentResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

export type LLMProvider = 'local' | 'deepseek' | 'openrouter' | 'google' | 'openai' | 'anthropic' | 'qwen';

export interface ProviderConfig {
    name: string;
    provider: string;
    models: string[];
    defaultModel: string;
    baseURL?: string;
    hint?: string;
    getKeyUrl?: string;
    supportsVision?: boolean;
}

declare global {
    namespace JSX {
        interface IntrinsicElements {
            // Override built-in webview to fix allowpopups attribute type
            // React expects string for custom DOM attributes, but Electron's type uses boolean
            webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
                src?: string;
                webpreferences?: string;
                allowpopups?: string; // Must be string for React DOM (not boolean)
                partition?: string;
                preload?: string; // Path to preload script
            }, HTMLElement>;
        }
    }

    interface Window {
        electronAPI?: {
            window: {
                minimize: () => void;
                maximize: () => void;
                close: () => void;
                create: () => void; // Creates a new browser window
                isMaximized: () => Promise<boolean>;
                onMaximizedChange: (callback: (isMaximized: boolean) => void) => void;
            };
            theme: {
                get: () => Promise<'light' | 'dark'>;
                set: (theme: 'light' | 'dark' | 'system') => Promise<'light' | 'dark'>;
                onChange: (callback: (theme: 'light' | 'dark') => void) => void;
            };
            platform: {
                get: () => Promise<NodeJS.Platform>;
                getWebviewPreloadPath: () => Promise<string>;
            };
            desktopCapturer: {
                getSources: (opts: { types: Array<'screen' | 'window'>; thumbnailSize?: { width: number; height: number } }) => Promise<Array<{
                    id: string;
                    name: string;
                    display_id: string;
                    appIcon: null;
                    thumbnail: null;
                }>>;
            };
            shortcuts: {
                onNewTab: (callback: () => void) => () => void;
                onCloseTab: (callback: () => void) => () => void;
                onNextTab: (callback: () => void) => () => void;
                onPrevTab: (callback: () => void) => () => void;
                onReopenTab: (callback: () => void) => () => void;
                onHistory: (callback: () => void) => () => void;
                onNewWindow: (callback: () => void) => () => void;
                onToggleVerticalMode: (callback: () => void) => () => void;
                onReload: (callback: () => void) => () => void;
                onGoBack: (callback: () => void) => () => void;
                onGoForward: (callback: () => void) => () => void;
                onToggleSidebar: (callback: () => void) => () => void;
            };
            // Tab sync for BrowserAgent
            tabs: {
                sync: (tabInfos: Array<{ tabId: number; webContentsId: number; url: string; title: string }>, activeTabId: number) => Promise<{ success: boolean }>;
                syncAgentWebviews: (webviews: Array<{ id: string; webContentsId: number; url: string; title: string }>, focusedId: string | null) => Promise<{ success: boolean }>;
                onSwitchTab: (callback: (tabId: number) => void) => () => void;
                onCreateTab: (callback: () => void) => () => void;
                onOpenWorkspace: (callback: () => void) => () => void;
                onAgentAddWebview: (callback: (label: string, url: string) => void) => () => void;
                onAgentFocusWebview: (callback: (webviewId: string) => void) => () => void;
            };
            settings: {
                openWindow: () => Promise<{ success: boolean }>;
                saveApiKey: (provider: string, apiKey: string) => Promise<{ success: boolean; error?: string }>;
                getApiKey: (provider: string) => Promise<string | null>;
                deleteApiKey: (provider: string) => Promise<{ success: boolean; error?: string }>;
                hasApiKey: (provider: string) => Promise<boolean>;
                validateApiKey: (provider: string, apiKey: string) => Promise<ValidationResult>;
                getProviders: () => Promise<Record<LLMProvider, ProviderConfig>>;
                getProviderKeys: () => Promise<LLMProvider[]>;
                getConfiguredProviders: () => Promise<string[]>;
                // Local server URL management
                saveLocalServerUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
                getLocalServerUrl: () => Promise<string>;
                testLocalServer: (url: string) => Promise<ValidationResult>;
                deleteLocalServer: () => Promise<{ success: boolean; error?: string }>;
                hasLocalServer: () => Promise<boolean>;
                // Fetch models from provider API
                fetchModels: (provider: string, credentialOrBaseUrl?: string) => Promise<{ success: boolean; models?: string[]; error?: string }>;
            };
            // Eko Agent Service — Full-featured
            eko: {
                // Task execution (Explore mode)
                run: (message: string, skipConfirm?: boolean) => Promise<{ success: boolean; data?: any; error?: string }>;
                modify: (taskId: string, message: string) => Promise<{ success: boolean; data?: any; error?: string }>;
                execute: (taskId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
                pauseTask: (taskId: string, pause: boolean) => Promise<{ success: boolean }>;
                cancelTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
                // Workflow confirm
                workflowConfirmResponse: (confirmId: string, confirmed: boolean, modifiedWorkflow?: any) => Promise<{ success: boolean }>;
                regenerateWorkflow: (taskId: string) => Promise<{ success: boolean }>;
                // Human interaction
                humanResponse: (response: { requestId: string; success: boolean; result?: any; error?: string }) => Promise<{ success: boolean }>;
                // Task context
                getTaskContext: (taskId: string) => Promise<{ success: boolean; data?: any }>;
                restoreTask: (workflow: any, contextParams?: any, chainPlanRequest?: any, chainPlanResult?: string) => Promise<{ success: boolean; data?: { taskId: string } }>;
                // Chat mode
                chatRun: (chatId: string, messageId: string, text: string) => Promise<{ success: boolean; data?: any; error?: string }>;
                chatCancel: (chatId: string) => Promise<{ success: boolean }>;
                // Configuration
                configure: (config: { provider: string; model: string; screenshotEnabled?: boolean }) => Promise<{ success: boolean; error?: string }>;
                reloadConfig: () => Promise<{ success: boolean }>;
                // Unified stream message listener
                onStreamMessage: (callback: (message: any) => void) => () => void;
            };
            adblock: {
                getState: () => Promise<{
                    enabled: boolean;
                    whitelistedDomains: string[];
                    customRules: string[];
                    lastUpdate: number;
                    totalBlockedCount: number;
                    blockedByDomain: Record<string, number>;
                }>;
                setEnabled: (enabled: boolean) => Promise<unknown>;
                getStats: () => Promise<{
                    sessionBlocked: number;
                    totalBlocked: number;
                    currentPageBlocked: number;
                    currentDomain: string;
                    blockedByDomain?: Record<string, number>;
                }>;
                addToWhitelist: (domain: string) => Promise<unknown>;
                removeFromWhitelist: (domain: string) => Promise<unknown>;
                addCustomRule: (rule: string) => Promise<unknown>;
                removeCustomRule: (rule: string) => Promise<unknown>;
                refreshFilters: () => Promise<unknown>;
                resetTabCount: () => void;
            };
            // Screen Capture - On-Demand Hidden Worker Pattern
            capture: {
                toggle: (enabled: boolean) => Promise<{ success: boolean; active: boolean }>;
                status: () => Promise<{ active: boolean }>;
                onUpdate: (callback: (data: { type: string; fps?: number; frameCount?: number; width?: number; height?: number; timestamp?: number }) => void) => () => void;
                onReady: (callback: (config: { width: number; height: number; bufferSize: number }) => void) => () => void;
                onStatusChanged: (callback: (active: boolean) => void) => () => void;
            };
            // Voice Transcription (whisper.cpp)
            voice: {
                transcribe: (audioPath: string) => Promise<{ success: boolean; text: string; error?: string }>;
                downloadModel: () => Promise<{ success: boolean; error?: string }>;
                checkStatus: () => Promise<{
                    binaryExists: boolean;
                    modelExists: boolean;
                    isTranscribing: boolean;
                    modelPath: string;
                    binaryPath: string;
                }>;
                saveTempAudio: (buffer: ArrayBuffer) => Promise<{ success: boolean; path: string; error?: string }>;
                onDownloadProgress: (callback: (progress: { percent: number; downloadedMB: number; totalMB: number }) => void) => () => void;
                // Streaming API (whisper-stream.exe)
                startStream: () => Promise<{ success: boolean; error?: string }>;
                stopStream: () => Promise<{ success: boolean; fullText: string; error?: string }>;
                onPartialTranscript: (callback: (data: { text: string; chunkIndex: number; isFinal: boolean }) => void) => () => void;
            };
        };
    }
}


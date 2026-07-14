/**
 * EkoService — Full-featured agent service adapted from ai-browser
 *
 * FEATURES:
 * - Workflow generate → confirm → execute flow (Explore mode)
 * - ChatAgent for conversational mode (Chat mode)
 * - Human interaction (confirm, input, select, help)
 * - Multi-task with pause/resume/cancel
 * - Task-specific work directories
 * - Thinking stream deduplication
 *
 * PERFORMANCE:
 * - No MCP, no memory service, no scheduled tasks (kept lightweight)
 * - Lazy initialization — agents only created when needed
 * - Singleton BrowserAgent reused across tasks
 */

import {
    Agent,
    Eko,
    ChatAgent,
    global as ekoGlobal,
    type LLMs,
    type StreamCallbackMessage,
    type AgentContext,
    type EkoResult,
    type EkoDialogueConfig,
    type ChatStreamCallback,
    type ChatStreamMessage,
} from '@jarvis-agent/core';
import { BrowserAgent } from '@jarvis-agent/electron';
import { createElectronFileAgent } from './ElectronFileAgent';
import { BrowserWindow, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { buildLLMsConfig, getDefaultAgentConfig, type ResolvedLLMConfig } from './ConfigAdapter';
import { WebViewTabManager } from './WebViewTabManager';
import { AppBrowserService } from './AppBrowserService';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface HumanRequestMessage {
    type: 'human_interaction';
    requestId: string;
    taskId?: string;
    agentName?: string;
    interactType: 'confirm' | 'input' | 'select' | 'request_help';
    prompt: string;
    helpType?: 'request_login' | 'request_assistance';
    selectOptions?: string[];
    selectMultiple?: boolean;
    context?: { siteName?: string; actionUrl?: string };
    timestamp: Date;
}

export interface HumanResponseMessage {
    requestId: string;
    success: boolean;
    result?: any;
    error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EkoService
// ═══════════════════════════════════════════════════════════════════════════

export class EkoService {
    private eko: Eko | null = null;
    private mainWindow: BrowserWindow;
    private browserAgent: BrowserAgent | null = null;
    private currentConfig: ResolvedLLMConfig | null = null;
    private tabManager: WebViewTabManager;

    // Human interaction state
    private pendingHumanRequests = new Map<string, {
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
    }>();
    private toolCallIdToRequestId = new Map<string, string>();
    private currentHumanInteractToolCallId: string | null = null;

    // Workflow confirm state
    private pendingWorkflowConfirms = new Map<string, {
        resolve: (result: 'confirm' | 'cancel' | 'regenerate') => void;
    }>();
    private confirmIdToTaskId = new Map<string, string>();

    // Task tracking
    private runningTaskIds: Set<string> = new Set();
    private taskPrompts = new Map<string, string>();

    // Thinking stream dedup (e.g. DeepSeek always returns "reasoning-0")
    private thinkingStreamIdMap: { originalId: string; mappedId: string; done: boolean } | null = null;

    // ChatAgent
    private chatAgent: ChatAgent | null = null;
    private chatAbortControllers = new Map<string, AbortController>();

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.tabManager = new WebViewTabManager(mainWindow);
        this.initializeGlobalServices();
    }

    /** Get the tab manager for IPC sync */
    getTabManager(): WebViewTabManager {
        return this.tabManager;
    }

    /** Inject BrowserService into jarvis-agent global (only once) */
    private initializeGlobalServices(): void {
        if (!ekoGlobal.browserService) {
            ekoGlobal.browserService = new AppBrowserService(this.tabManager);
            console.log('[EkoService] Global browserService injected');
        }
    }

    // ─── Configuration ───────────────────────────────────────────────────

    /**
     * Set or update the LLM configuration and reinitialize
     */
    public configure(config: ResolvedLLMConfig): void {
        this.currentConfig = config;
        this.initializeEko();
    }

    /**
     * Reload configuration (e.g. after API key change)
     */
    public reloadConfig(): void {
        if (!this.currentConfig) return;

        // Abort all running tasks
        if (this.eko) {
            this.eko.getAllTaskId().forEach((taskId: any) => {
                try { this.eko!.abortTask(taskId, 'config-reload'); } catch {}
            });
        }
        this.rejectAllHumanRequests(new Error('Configuration reloaded'));
        this.initializeEko();

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('eko-stream-message', {
                type: 'config_reloaded',
                model: this.currentConfig.model,
                provider: this.currentConfig.provider,
            });
        }
    }

    // ─── Initialization ──────────────────────────────────────────────────

    private initializeEko(): void {
        if (!this.currentConfig) return;

        const llms = buildLLMsConfig(this.currentConfig);
        const agentConfig = getDefaultAgentConfig();

        // Create BrowserAgent with proper tabManager (reused across tasks)
        if (agentConfig.browserAgent.enabled) {
            this.browserAgent = new BrowserAgent(this.tabManager);
        }

        const agents: any[] = this.browserAgent ? [this.browserAgent] : [];

        this.eko = new Eko({
            llms,
            agents,
            callback: this.createCallback(),
        });
    }

    /**
     * Create Eko instance for a specific task with unique work directory
     */
    private createEkoForTask(taskId: string): Eko {
        if (!this.currentConfig) throw new Error('EkoService not configured');

        const llms = buildLLMsConfig(this.currentConfig);
        const agentConfig = getDefaultAgentConfig();
        const agents: any[] = [];

        if (this.browserAgent) {
            agents.push(this.browserAgent);
        }

        // Create custom ElectronFileAgent with task-specific work directory setup
        if (agentConfig.fileAgent.enabled) {
            const taskWorkPath = this.getTaskWorkPath(taskId);
            fs.mkdirSync(taskWorkPath, { recursive: true });
            agents.push(createElectronFileAgent());
        }

        return new Eko({
            llms,
            agents,
            callback: this.createCallback(),
        });
    }

    // ─── Thinking stream dedup ───────────────────────────────────────────

    private deduplicateThinkingStreamId(msg: any): void {
        const map = this.thinkingStreamIdMap;
        if (!map || map.done) {
            const needsRemap = map?.done && map.originalId === msg.streamId;
            const mappedId = needsRemap ? randomUUID() : msg.streamId;
            this.thinkingStreamIdMap = { originalId: msg.streamId, mappedId, done: false };
            msg.streamId = mappedId;
        } else {
            msg.streamId = map.mappedId;
        }
        if (msg.streamDone && this.thinkingStreamIdMap) {
            this.thinkingStreamIdMap.done = true;
        }
    }

    // ─── Callback ────────────────────────────────────────────────────────

    private createCallback() {
        return {
            onMessage: (message: StreamCallbackMessage): Promise<void> => {
                if (!this.mainWindow || this.mainWindow.isDestroyed()) {
                    return Promise.resolve();
                }

                // Fix duplicate thinking streamId
                if (message.type === 'thinking') {
                    this.deduplicateThinkingStreamId(message as any);
                }

                if (message.type === 'tool_use' && (message as any).toolName === 'human_interact' && (message as any).toolCallId) {
                    this.currentHumanInteractToolCallId = (message as any).toolCallId;
                }

                return new Promise((resolve) => {
                    this.mainWindow.webContents.send('eko-stream-message', message);
                    resolve();
                });
            },

            // Human interaction callbacks
            onHumanConfirm: async (agentContext: AgentContext, prompt: string): Promise<boolean> => {
                const result = await this.requestHumanInteraction(agentContext, {
                    interactType: 'confirm',
                    prompt,
                });
                return Boolean(result);
            },

            onHumanInput: async (agentContext: AgentContext, prompt: string): Promise<string> => {
                const result = await this.requestHumanInteraction(agentContext, {
                    interactType: 'input',
                    prompt,
                });
                return String(result ?? '');
            },

            onHumanSelect: async (
                agentContext: AgentContext,
                prompt: string,
                options: string[],
                multiple?: boolean,
            ): Promise<string[]> => {
                const result = await this.requestHumanInteraction(agentContext, {
                    interactType: 'select',
                    prompt,
                    selectOptions: options,
                    selectMultiple: multiple ?? false,
                });
                return Array.isArray(result) ? result : [];
            },

            onHumanHelp: async (
                agentContext: AgentContext,
                helpType: 'request_login' | 'request_assistance',
                prompt: string,
            ): Promise<boolean> => {
                const result = await this.requestHumanInteraction(agentContext, {
                    interactType: 'request_help',
                    prompt,
                    helpType,
                });
                return Boolean(result);
            },
        };
    }

    // ─── File paths ──────────────────────────────────────────────────────

    private getBaseWorkPath(): string {
        return app.isPackaged
            ? path.join(app.getPath('userData'), 'static')
            : path.join(process.cwd(), 'public', 'static');
    }

    private getTaskWorkPath(taskId: string): string {
        return path.join(this.getBaseWorkPath(), taskId);
    }

    // ─── Workflow confirm ────────────────────────────────────────────────

    private requestWorkflowConfirm(taskId: string): Promise<'confirm' | 'cancel' | 'regenerate'> {
        if (!this.eko || !this.mainWindow || this.mainWindow.isDestroyed()) {
            return Promise.resolve('confirm');
        }

        const context = this.eko.getTask(taskId);
        if (!context?.workflow) return Promise.resolve('confirm');

        const confirmId = randomUUID();
        this.confirmIdToTaskId.set(confirmId, taskId);
        return new Promise((resolve) => {
            this.pendingWorkflowConfirms.set(confirmId, { resolve });
            this.mainWindow.webContents.send('eko-stream-message', {
                type: 'workflow_confirm',
                taskId,
                confirmId,
                workflow: context.workflow,
            });
        });
    }

    private async generateAndConfirm(taskId: string, prompt: string): Promise<boolean> {
        if (!this.eko) return false;

        await this.eko.generate(prompt, taskId);

        while (true) {
            const result = await this.requestWorkflowConfirm(taskId);
            if (result === 'confirm') return true;
            if (result === 'cancel') return false;
            // regenerate
            await this.eko.generate(prompt, taskId);
        }
    }

    // ─── Task execution ──────────────────────────────────────────────────

    /**
     * Ensure there's a real tab with a webview available for the agent.
     * If no webview exists, opens the Shadow Workspace which creates one.
     */
    private async ensureActiveTab(): Promise<void> {
        const view = this.tabManager.getActiveView();
        if (view) return; // Already have a valid view

        // getActiveView() already sent 'agent:open-workspace' to frontend.
        // Wait for the workspace to create a webview and sync its webContentsId.
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 400));
            if (this.tabManager.getActiveView()) return;
        }
        console.warn('[EkoService] No active tab available after waiting for workspace');
    }

    async run(message: string, skipConfirm = false): Promise<EkoResult | null> {
        let taskId: string | null = null;
        try {
            taskId = randomUUID();
            this.eko = this.createEkoForTask(taskId);
            this.runningTaskIds.add(taskId);
            this.taskPrompts.set(taskId, message);
            this.thinkingStreamIdMap = null;

            // Ensure we have a real tab before starting
            await this.ensureActiveTab();

            if (skipConfirm) {
                await this.eko.generate(message, taskId);
            } else {
                const confirmed = await this.generateAndConfirm(taskId, message);
                if (!confirmed) {
                    return { taskId, success: false, stopReason: 'abort', result: 'User cancelled workflow' };
                }
            }

            const result = await this.eko.execute(taskId);
            // Notify frontend that the task is complete
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('eko-stream-message', {
                    type: 'task_complete', taskId, result,
                });
            }
            return result;
        } catch (error: unknown) {
            console.error('[EkoService] Run error:', error);
            const errMsg = error instanceof Error ? error.message : 'Unknown error occurred';
            this.sendErrorToFrontend(errMsg, error);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('eko-stream-message', {
                    type: 'task_error', taskId, error: errMsg,
                });
            }
            return null;
        } finally {
            if (taskId) {
                this.runningTaskIds.delete(taskId);
                this.taskPrompts.delete(taskId);
            }
        }
    }

    async modify(taskId: string, message: string): Promise<EkoResult | null> {
        if (!this.eko) {
            this.sendErrorToFrontend('Eko service not initialized', undefined, taskId);
            return null;
        }

        try {
            const context = this.eko.getTask(taskId);
            if (context?.controller?.signal?.aborted) {
                context.reset();
            }

            await this.eko.modify(taskId, message);
            this.runningTaskIds.add(taskId);
            this.taskPrompts.set(taskId, message);

            while (true) {
                const result = await this.requestWorkflowConfirm(taskId);
                if (result === 'cancel') {
                    return { taskId, success: false, stopReason: 'abort', result: 'User cancelled workflow' };
                }
                if (result === 'confirm') break;
                await this.eko.modify(taskId, message);
            }

            return await this.eko.execute(taskId);
        } catch (error: unknown) {
            console.error('[EkoService] Modify error:', error);
            const errMsg = error instanceof Error ? error.message : 'Failed to modify task';
            this.sendErrorToFrontend(errMsg, error, taskId);
            return null;
        } finally {
            this.runningTaskIds.delete(taskId);
            this.taskPrompts.delete(taskId);
        }
    }

    async execute(taskId: string): Promise<EkoResult | null> {
        if (!this.eko) {
            this.sendErrorToFrontend('Eko service not initialized', undefined, taskId);
            return null;
        }

        try {
            this.runningTaskIds.add(taskId);
            return await this.eko.execute(taskId);
        } catch (error: unknown) {
            console.error('[EkoService] Execute error:', error);
            const errMsg = error instanceof Error ? error.message : 'Failed to execute task';
            this.sendErrorToFrontend(errMsg, error, taskId);
            return null;
        } finally {
            this.runningTaskIds.delete(taskId);
        }
    }

    pauseTask(taskId: string, pause: boolean): boolean {
        if (!this.eko) return false;
        return this.eko.pauseTask(taskId, pause);
    }

    async cancelTask(taskId: string): Promise<any> {
        if (!this.eko) return { success: false, error: 'Service not initialized' };
        try {
            const result = await this.eko.abortTask(taskId, 'cancel');
            return { success: result };
        } catch (error: unknown) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    hasRunningTask(): boolean {
        return this.runningTaskIds.size > 0;
    }

    getTaskContext(taskId: string): {
        workflow: any;
        contextParams: Record<string, any>;
        chainPlanRequest?: any;
        chainPlanResult?: string;
    } | null {
        if (!this.eko) return null;
        const context = this.eko.getTask(taskId);
        if (!context) return null;

        const contextParams: Record<string, any> = {};
        context.variables.forEach((value: any, key: any) => {
            contextParams[key] = value;
        });

        return {
            workflow: context.workflow,
            contextParams,
            chainPlanRequest: context.chain?.planRequest,
            chainPlanResult: context.chain?.planResult,
        };
    }

    async restoreTask(
        workflow: any,
        contextParams?: Record<string, any>,
        chainPlanRequest?: any,
        chainPlanResult?: string,
    ): Promise<string | null> {
        try {
            const taskId = workflow.taskId;
            this.eko = this.createEkoForTask(taskId);
            const context = await this.eko.initContext(workflow, contextParams);

            if (chainPlanRequest && chainPlanResult) {
                context.chain.planRequest = chainPlanRequest;
                context.chain.planResult = chainPlanResult;
            }

            return taskId;
        } catch (error: any) {
            console.error('[EkoService] Failed to restore task:', error);
            return null;
        }
    }

    async abortAllTasks(): Promise<void> {
        if (!this.eko) return;
        const abortPromises = this.eko.getAllTaskId().map((taskId: any) =>
            this.eko!.abortTask(taskId, 'window-closing')
        );
        await Promise.all(abortPromises);
        this.rejectAllHumanRequests(new Error('All tasks aborted'));
    }

    // ─── Workflow confirm resolution ─────────────────────────────────────

    public resolveWorkflowConfirm(confirmId: string, confirmed: boolean, modifiedWorkflow?: any): void {
        const pending = this.pendingWorkflowConfirms.get(confirmId);
        if (!pending) return;

        if (confirmed && modifiedWorkflow?.agents && this.eko) {
            const taskId = this.confirmIdToTaskId.get(confirmId);
            if (taskId) {
                const context = this.eko.getTask(taskId);
                if (context?.workflow) {
                    context.workflow.agents = modifiedWorkflow.agents;
                }
            }
        }

        pending.resolve(confirmed ? 'confirm' : 'cancel');
        this.pendingWorkflowConfirms.delete(confirmId);
        this.confirmIdToTaskId.delete(confirmId);
    }

    public regenerateWorkflow(taskId: string): void {
        let foundCid: string | null = null;
        this.pendingWorkflowConfirms.forEach((pending, cid) => {
            if (!foundCid && this.confirmIdToTaskId.get(cid) === taskId) {
                foundCid = cid;
                pending.resolve('regenerate');
            }
        });
        if (foundCid) {
            this.pendingWorkflowConfirms.delete(foundCid);
            this.confirmIdToTaskId.delete(foundCid);
        }
    }

    // ─── Human interaction ───────────────────────────────────────────────

    private requestHumanInteraction(
        agentContext: AgentContext,
        payload: Omit<HumanRequestMessage, 'type' | 'requestId' | 'timestamp'>,
    ): Promise<any> {
        const requestId = randomUUID();
        const message: HumanRequestMessage = {
            type: 'human_interaction',
            requestId,
            taskId: agentContext?.context?.taskId,
            agentName: agentContext?.agent?.Name,
            timestamp: new Date(),
            ...payload,
        };

        return new Promise((resolve, reject) => {
            this.pendingHumanRequests.set(requestId, { resolve, reject });

            if (this.currentHumanInteractToolCallId) {
                this.toolCallIdToRequestId.set(this.currentHumanInteractToolCallId, requestId);
                this.currentHumanInteractToolCallId = null;
            }

            agentContext?.context?.controller?.signal?.addEventListener('abort', () => {
                this.pendingHumanRequests.delete(requestId);
                reject(new Error('Task aborted during human interaction'));
            });

            if (!this.mainWindow || this.mainWindow.isDestroyed()) {
                this.pendingHumanRequests.delete(requestId);
                reject(new Error('Main window destroyed'));
                return;
            }

            this.mainWindow.webContents.send('eko-stream-message', message);
        });
    }

    public handleHumanResponse(response: HumanResponseMessage): boolean {
        let pending = this.pendingHumanRequests.get(response.requestId);
        let actualRequestId = response.requestId;

        if (!pending) {
            const mappedRequestId = this.toolCallIdToRequestId.get(response.requestId);
            if (mappedRequestId) {
                pending = this.pendingHumanRequests.get(mappedRequestId);
                actualRequestId = mappedRequestId;
            }
        }

        if (!pending) return false;

        this.pendingHumanRequests.delete(actualRequestId);
        this.toolCallIdToRequestId.delete(response.requestId);

        if (response.success) {
            pending.resolve(response.result);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('eko-stream-message', {
                    type: 'human_interaction_result',
                    requestId: response.requestId,
                    result: response.result,
                    timestamp: new Date(),
                });
            }
        } else {
            pending.reject(new Error(response.error || 'Human interaction cancelled'));
        }

        return true;
    }

    private rejectAllHumanRequests(error: Error): void {
        this.pendingHumanRequests.forEach((pending) => {
            pending.reject(error);
        });
        this.pendingHumanRequests.clear();
        this.toolCallIdToRequestId.clear();
        this.currentHumanInteractToolCallId = null;

        this.pendingWorkflowConfirms.forEach((pending) => {
            pending.resolve('cancel');
        });
        this.pendingWorkflowConfirms.clear();
    }

    // ─── Chat mode ───────────────────────────────────────────────────────

    private async createChatAgent(chatId: string): Promise<ChatAgent> {
        if (!this.currentConfig) throw new Error('EkoService not configured');

        const llms = buildLLMsConfig(this.currentConfig);
        const agentConfig = getDefaultAgentConfig();
        const agents: Agent[] = [];
        if (this.browserAgent) agents.push(this.browserAgent);

        if (agentConfig.fileAgent.enabled) {
            const taskWorkPath = this.getTaskWorkPath(chatId);
            fs.mkdirSync(taskWorkPath, { recursive: true });
            agents.push(createElectronFileAgent());
        }

        const config: EkoDialogueConfig = { llms, agents };
        return new ChatAgent(config, chatId);
    }

    private createChatCallback(): ChatStreamCallback {
        return {
            chatCallback: {
                onMessage: async (message: ChatStreamMessage) => {
                    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
                    this.mainWindow.webContents.send('eko-stream-message', message);
                },
            },
            taskCallback: this.createCallback(),
        };
    }

    async chatRun(chatId: string, messageId: string, text: string): Promise<{ chatId: string; result: string | null; error?: string }> {
        try {
            // Ensure we have a real tab before starting
            await this.ensureActiveTab();

            if (!this.chatAgent || this.chatAgent.getChatContext().getChatId() !== chatId) {
                this.chatAgent = await this.createChatAgent(chatId);
            }

            this.runningTaskIds.add(chatId);
            const controller = new AbortController();
            this.chatAbortControllers.set(chatId, controller);

            const result = await this.chatAgent.chat({
                messageId,
                user: [{ type: 'text', text }],
                callback: this.createChatCallback(),
                signal: controller.signal,
            });

            // Notify frontend that chat response is complete
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('eko-stream-message', {
                    type: 'task_complete', taskId: chatId,
                });
            }
            return { chatId, result };
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Chat error';
            console.error('[EkoService] chatRun error:', errMsg);
            this.sendErrorToFrontend(errMsg, error, chatId);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('eko-stream-message', {
                    type: 'task_error', taskId: chatId, error: errMsg,
                });
            }
            return { chatId, result: null, error: errMsg };
        } finally {
            this.runningTaskIds.delete(chatId);
            this.chatAbortControllers.delete(chatId);
        }
    }

    async chatCancel(chatId: string): Promise<void> {
        const controller = this.chatAbortControllers.get(chatId);
        if (controller) controller.abort();
    }

    // ─── Error handling ──────────────────────────────────────────────────

    private sendErrorToFrontend(errorMessage: string, error?: unknown, taskId?: string): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('eko-stream-message', {
                type: 'error',
                error: errorMessage,
                detail: error instanceof Error ? error.stack : String(error ?? errorMessage),
                taskId,
            });
        }
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────

    async destroy(): Promise<void> {
        if (this.eko) {
            for (const taskId of this.eko.getAllTaskId()) {
                try { this.eko.deleteTask(taskId); } catch {}
            }
        }

        this.chatAbortControllers.forEach((controller) => {
            controller.abort();
        });

        this.rejectAllHumanRequests(new Error('EkoService destroyed'));
        this.eko = null;
        this.browserAgent = null;
        this.chatAgent = null;
        this.chatAbortControllers.clear();
        this.runningTaskIds.clear();
        this.taskPrompts.clear();
    }
}

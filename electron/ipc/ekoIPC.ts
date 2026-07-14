import { ipcMain, BrowserWindow, safeStorage, nativeTheme, nativeImage } from 'electron';
import path from 'path';
import { EkoService } from '../../backend/agent_core/EkoService';
import type { ResolvedLLMConfig } from '../../backend/agent_core/ConfigAdapter';
import { LLMProvider, LLM_PROVIDERS } from '../../backend/models/llmProviders';
import {
    readLocalServerUrl,
    readSecureKeys,
    readSecureKeysPlain
} from '../settingsStore';

let ekoService: EkoService | null = null;
let settingsWindow: BrowserWindow | null = null;

function getOrCreateEkoService(getMainWindow: () => BrowserWindow | null): EkoService | null {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    if (!ekoService) {
        ekoService = new EkoService(mainWindow);
    }
    return ekoService;
}

function createSettingsWindow(getMainWindow: () => BrowserWindow | null) {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
        return;
    }

    const mainWindow = getMainWindow();

    settingsWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 500,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#161618' : '#f5f5f7',
        icon: nativeImage.createFromPath(path.join(__dirname, '../../../public/netsurf.png')),
        parent: mainWindow || undefined,
        webPreferences: {
            preload: path.join(__dirname, '../preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    });

    const isDev = !process.env.npm_lifecycle_event || process.env.npm_lifecycle_event === 'electron:start' || process.env.npm_lifecycle_event === 'dev';

    if (isDev) {
        settingsWindow.loadURL('http://localhost:5173?route=settings');
    } else {
        settingsWindow.loadFile(path.join(__dirname, '../../../dist/index.html'), {
            query: { route: 'settings' }
        });
    }

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

export function registerEkoIPC(getMainWindow: () => BrowserWindow | null) {
    // Settings Window
    ipcMain.handle('settings:openWindow', async () => {
        createSettingsWindow(getMainWindow);
        return { success: true };
    });

    // Tab synchronization
    ipcMain.handle('tabs:sync', async (_, tabInfos: Array<{ tabId: number; webContentsId: number; url: string; title: string }>, activeTabId: number) => {
        try {
            const service = getOrCreateEkoService(getMainWindow);
            if (!service) return { success: false };
            service.getTabManager().syncTabs(tabInfos, activeTabId);
            return { success: true };
        } catch {
            return { success: false };
        }
    });

    ipcMain.handle('tabs:syncAgentWebviews', async (_, webviews: Array<{ id: string; webContentsId: number; url: string; title: string }>, focusedId: string | null) => {
        try {
            const service = getOrCreateEkoService(getMainWindow);
            if (!service) return { success: false };
            service.getTabManager().syncAgentWebviews(webviews, focusedId);
            return { success: true };
        } catch {
            return { success: false };
        }
    });

    // Configure Eko Service
    ipcMain.handle('eko:configure', async (_, config: { provider: LLMProvider; model: string; screenshotEnabled?: boolean }) => {
        try {
            const service = getOrCreateEkoService(getMainWindow);
            if (!service) return { success: false, error: 'No main window' };

            let apiKey = '';
            let baseURL: string | undefined;
            let modelName = config.model;

            if (config.provider === 'local') {
                apiKey = 'not-needed';
                baseURL = readLocalServerUrl();
                if (modelName === 'auto') {
                    try {
                        const modelsUrl = `${baseURL}/models`;
                        const response = await fetch(modelsUrl);
                        if (response.ok) {
                            const data = await response.json();
                            if (data.data && data.data.length > 0) {
                                modelName = data.data[0].id;
                            }
                        }
                    } catch { }
                }
            } else {
                const useEncrypted = safeStorage.isEncryptionAvailable();
                const keys = useEncrypted ? readSecureKeys() : readSecureKeysPlain();
                apiKey = keys[config.provider];
                if (!apiKey) return { success: false, error: 'API key not configured' };

                const providerConfig = LLM_PROVIDERS[config.provider];
                if (providerConfig?.baseURL) {
                    baseURL = providerConfig.baseURL;
                }
            }

            const resolvedConfig: ResolvedLLMConfig = {
                provider: config.provider,
                apiKey,
                model: modelName,
                baseURL,
                screenshotEnabled: config.screenshotEnabled ?? true,
            };

            service.configure(resolvedConfig);
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('eko:reload-config', async () => {
        const service = getOrCreateEkoService(getMainWindow);
        if (!service) return { success: false };
        service.reloadConfig();
        return { success: true };
    });

    ipcMain.handle('eko:run', async (_, message: string, skipConfirm?: boolean) => {
        try {
            const service = getOrCreateEkoService(getMainWindow);
            if (!service) return { success: false, error: 'EkoService not available' };
            const result = await service.run(message, skipConfirm);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('eko:modify', async (_, taskId: string, message: string) => {
        try {
            const service = getOrCreateEkoService(getMainWindow);
            if (!service) return { success: false, error: 'EkoService not available' };
            const result = await service.modify(taskId, message);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('eko:execute', async (_, taskId: string) => {
        try {
            const service = getOrCreateEkoService(getMainWindow);
            if (!service) return { success: false, error: 'EkoService not available' };
            const result = await service.execute(taskId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('eko:pause-task', async (_, taskId: string, pause: boolean) => {
        const service = getOrCreateEkoService(getMainWindow);
        if (!service) return { success: false };
        return { success: service.pauseTask(taskId, pause) };
    });

    ipcMain.handle('eko:cancel-task', async (_, taskId: string) => {
        const service = getOrCreateEkoService(getMainWindow);
        if (!service) return { success: false };
        return await service.cancelTask(taskId);
    });

    ipcMain.handle('eko:workflow-confirm-response', async (_, confirmId: string, confirmed: boolean, modifiedWorkflow?: any) => {
        const service = getOrCreateEkoService(getMainWindow);
        if (!service) return { success: false };
        service.resolveWorkflowConfirm(confirmId, confirmed, modifiedWorkflow);
        return { success: true };
    });

    ipcMain.handle('eko:regenerate-workflow', (_, taskId: string) => {
        const service = getOrCreateEkoService(getMainWindow);
        if (!service) return { success: false };
        service.regenerateWorkflow(taskId);
        return { success: true };
    });

    ipcMain.handle('eko:human-response', async (_, response: any) => {
        const service = getOrCreateEkoService(getMainWindow);
        if (!service) return { success: false };
        return { success: service.handleHumanResponse(response) };
    });

    ipcMain.handle('eko:get-task-context', async (_, taskId: string) => {
        const service = getOrCreateEkoService(getMainWindow);
        if (!service) return { success: false };
        const context = service.getTaskContext(taskId);
        return { success: true, data: context };
    });

    ipcMain.handle('eko:restore-task', async (_, workflow: any, contextParams?: any, chainPlanRequest?: any, chainPlanResult?: string) => {
        const service = getOrCreateEkoService(getMainWindow);
        if (!service) return { success: false };
        const taskId = await service.restoreTask(workflow, contextParams, chainPlanRequest, chainPlanResult);
        return { success: !!taskId, data: { taskId } };
    });

    ipcMain.handle('eko:chat-run', async (_, chatId: string, messageId: string, text: string) => {
        try {
            const service = getOrCreateEkoService(getMainWindow);
            if (!service) return { success: false, error: 'EkoService not available' };
            const result = await service.chatRun(chatId, messageId, text);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('eko:chat-cancel', async (_, chatId: string) => {
        const service = getOrCreateEkoService(getMainWindow);
        if (!service) return { success: false };
        await service.chatCancel(chatId);
        return { success: true };
    });
}

import { ipcMain, BrowserWindow, desktopCapturer, app } from 'electron';
import path from 'path';

// Debug logging
const DEBUG = false;
const log = (...args: any[]) => { if (DEBUG) console.log(...args); };

let recorderWorkerWindow: BrowserWindow | null = null;

const createRecorderWorker = (getMainWindow: () => BrowserWindow | null): boolean => {
    if (recorderWorkerWindow && !recorderWorkerWindow.isDestroyed()) {
        log('[RecorderWorker] Already exists');
        return true;
    }

    log('[RecorderWorker] Creating privacy recorder worker...');

    recorderWorkerWindow = new BrowserWindow({
        width: 400,
        height: 300,
        show: false,  // HIDDEN for performance
        skipTaskbar: true,
        title: 'Privacy Recorder Worker',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,  // Critical for consistent FPS
        }
    });

    const isDev = !app.isPackaged || process.env.npm_lifecycle_event === 'dev';
    if (isDev) {
        recorderWorkerWindow.loadURL('http://localhost:5173/recorder-worker.html');
    } else {
        recorderWorkerWindow.loadFile(path.join(__dirname, '../../../dist/recorder-worker.html'));
    }

    recorderWorkerWindow.webContents.on('console-message', (_, level, message) => {
        log(`[RecorderWorker] ${message}`);
    });

    recorderWorkerWindow.on('closed', () => {
        recorderWorkerWindow = null;
        log('[RecorderWorker] Window closed');
        const mainWindow = getMainWindow();
        mainWindow?.webContents.send('recorder:stopped', {});
    });

    return true;
};

const destroyRecorderWorker = (): void => {
    log('[Recorder] Destroying worker window...');
    if (recorderWorkerWindow && !recorderWorkerWindow.isDestroyed()) {
        recorderWorkerWindow.close();
        recorderWorkerWindow = null;
    }
};

export function registerRecorderIPC(getMainWindow: () => BrowserWindow | null) {
    // IPC: Start recording
    ipcMain.handle('recorder:start', async (_, config: { fps?: number; outputPath?: string; privacyEnabled?: boolean }) => {
        log('[Recorder] Start requested:', config);

        if (!createRecorderWorker(getMainWindow)) {
            return { success: false, error: 'Failed to create recorder worker' };
        }

        // Setup promises for events from recorder worker
        const setupWorker = new Promise<{ success: boolean; error?: string }>((resolve) => {
            if (!recorderWorkerWindow) {
                resolve({ success: false, error: 'Worker window not available' });
                return;
            }

            ipcMain.once('recorder:ready', (_, info) => {
                log('[Recorder] Worker is ready:', info);
                recorderWorkerWindow?.webContents.send('recorder:startCommand', config);
            });

            ipcMain.once('recorder:started', () => {
                log('[Recorder] Started capturing successfully');
                resolve({ success: true });
            });

            ipcMain.once('recorder:error', (_, error) => {
                console.error('[Recorder] Worker error during start:', error);
                destroyRecorderWorker();
                resolve({ success: false, error });
            });
        });

        return setupWorker;
    });

    // IPC: Stop recording
    ipcMain.handle('recorder:stop', async () => {
        log('[Recorder] Stop requested');
        if (!recorderWorkerWindow) {
            return { success: false, error: 'No active recorder worker' };
        }

        return new Promise((resolve) => {
            ipcMain.once('recorder:stopped', (_, result) => {
                log('[Recorder] Stopped successfully, result:', result);
                destroyRecorderWorker();
                resolve({ success: true, result });
            });

            recorderWorkerWindow?.webContents.send('recorder:stopCommand');
        });
    });

    // IPC: Get Status
    ipcMain.handle('recorder:getStatus', async () => {
        if (!recorderWorkerWindow) {
            return { isRecording: false };
        }

        return new Promise((resolve) => {
            ipcMain.once('recorder:statusResponse', (_, status) => {
                resolve(status);
            });
            recorderWorkerWindow?.webContents.send('recorder:getStatusCommand');
        });
    });

    // Forward status update from recorder worker window to main browser window
    ipcMain.on('recorder:status', (_, status) => {
        const mainWindow = getMainWindow();
        mainWindow?.webContents.send('recorder:status', status);
    });

    ipcMain.on('recorder:ready', (_, info) => {
        const mainWindow = getMainWindow();
        mainWindow?.webContents.send('recorder:ready', info);
    });

    ipcMain.on('recorder:error', (_, error) => {
        const mainWindow = getMainWindow();
        mainWindow?.webContents.send('recorder:error', error);
    });

    ipcMain.handle('logBuffer:init', async () => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('logBuffer:initResponse', (_, result) => resolve(result));
            recorderWorkerWindow?.webContents.send('logBuffer:initCommand');
        });
    });

    ipcMain.handle('logBuffer:push', async (_, timestamp_ms: number, type: number, payload: string) => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        recorderWorkerWindow.webContents.send('logBuffer:pushCommand', { timestamp_ms, type, payload });
        return { success: true };
    });

    ipcMain.handle('logBuffer:clear', async () => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        recorderWorkerWindow.webContents.send('logBuffer:clearCommand');
        return { success: true };
    });

    ipcMain.handle('logBuffer:getCount', async () => {
        if (!recorderWorkerWindow) return 0;
        return new Promise((resolve) => {
            ipcMain.once('logBuffer:getCountResponse', (_, count) => resolve(count));
            recorderWorkerWindow?.webContents.send('logBuffer:getCountCommand');
        });
    });

    ipcMain.handle('logs:setRecordingStart', async (_, epochMs: number) => {
        if (!recorderWorkerWindow) return { success: false };
        recorderWorkerWindow.webContents.send('logs:setRecordingStartCommand', epochMs);
        return { success: true };
    });

    ipcMain.handle('logs:getAllLogs', async () => {
        if (!recorderWorkerWindow) return [];
        return new Promise((resolve) => {
            ipcMain.once('logs:getAllLogsResponse', (_, logs) => resolve(logs));
            recorderWorkerWindow?.webContents.send('logs:getAllLogsCommand');
        });
    });

    ipcMain.handle('netsurf:saveNetsurf', async (_, outputPath: string) => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('netsurf:saveNetsurfResponse', (_, result) => resolve(result));
            recorderWorkerWindow?.webContents.send('netsurf:saveNetsurfCommand', outputPath);
        });
    });

    ipcMain.handle('netsurf:openRecording', async (_, filePath: string) => {
        if (!createRecorderWorker(getMainWindow)) return { success: false, error: 'Failed to create worker' };
        return new Promise((resolve) => {
            ipcMain.once('netsurf:openRecordingResponse', (_, result) => resolve(result));
            ipcMain.once('recorder:ready', () => {
                recorderWorkerWindow?.webContents.send('netsurf:openRecordingCommand', filePath);
            });
        });
    });

    ipcMain.handle('netsurf:saveRecording', async (_, start_ms: number, end_ms: number, output_path: string, video_path?: string) => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('netsurf:saveRecordingResponse', (_, result) => resolve(result));
            recorderWorkerWindow?.webContents.send('netsurf:saveRecordingCommand', { start_ms, end_ms, output_path, video_path });
        });
    });

    ipcMain.handle('netsurfRecorder:start', async (_, opts?: { fps?: number; durationMinutes?: number }) => {
        if (!createRecorderWorker(getMainWindow)) return { success: false, error: 'Failed to create worker' };
        return new Promise((resolve) => {
            ipcMain.once('netsurfRecorder:startResponse', (_, result) => resolve(result));
            ipcMain.once('recorder:ready', () => {
                recorderWorkerWindow?.webContents.send('netsurfRecorder:startCommand', opts);
            });
        });
    });

    ipcMain.handle('netsurfRecorder:stop', async () => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('netsurfRecorder:stopResponse', (_, result) => resolve(result));
            recorderWorkerWindow?.webContents.send('netsurfRecorder:stopCommand');
        });
    });

    ipcMain.handle('netsurfRecorder:save', async (_, outputPath: string) => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('netsurfRecorder:saveResponse', (_, result) => resolve(result));
            recorderWorkerWindow?.webContents.send('netsurfRecorder:saveCommand', outputPath);
        });
    });

    ipcMain.handle('netsurfRecorder:status', async () => {
        if (!recorderWorkerWindow) return { isRecording: false };
        return new Promise((resolve) => {
            ipcMain.once('netsurfRecorder:statusResponse', (_, status) => resolve(status));
            recorderWorkerWindow?.webContents.send('netsurfRecorder:statusCommand');
        });
    });

    ipcMain.handle('recorder:getLastRecordingPath', async () => {
        if (!recorderWorkerWindow) return null;
        return new Promise((resolve) => {
            ipcMain.once('recorder:getLastRecordingPathResponse', (_, val) => resolve(val));
            recorderWorkerWindow?.webContents.send('recorder:getLastRecordingPathCommand');
        });
    });

    // Ring Buffer IPCs
    ipcMain.handle('ringBuffer:init', async () => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('ringBuffer:initResponse', (_, val) => resolve(val));
            recorderWorkerWindow?.webContents.send('ringBuffer:initCommand');
        });
    });

    ipcMain.handle('ringBuffer:start', async () => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('ringBuffer:startResponse', (_, val) => resolve(val));
            recorderWorkerWindow?.webContents.send('ringBuffer:startCommand');
        });
    });

    ipcMain.handle('ringBuffer:stop', async () => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('ringBuffer:stopResponse', (_, val) => resolve(val));
            recorderWorkerWindow?.webContents.send('ringBuffer:stopCommand');
        });
    });

    ipcMain.handle('ringBuffer:getStatus', async () => {
        if (!recorderWorkerWindow) return { isRecording: false };
        return new Promise((resolve) => {
            ipcMain.once('ringBuffer:getStatusResponse', (_, status) => resolve(status));
            recorderWorkerWindow?.webContents.send('ringBuffer:getStatusCommand');
        });
    });

    ipcMain.handle('ringBuffer:isRecording', async () => {
        if (!recorderWorkerWindow) return false;
        return new Promise((resolve) => {
            ipcMain.once('ringBuffer:isRecordingResponse', (_, val) => resolve(val));
            recorderWorkerWindow?.webContents.send('ringBuffer:isRecordingCommand');
        });
    });

    ipcMain.handle('ringBuffer:save', async (_event, outputPath: string) => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('ringBuffer:saveResponse', (_, val) => resolve(val));
            recorderWorkerWindow?.webContents.send('ringBuffer:saveCommand', outputPath);
        });
    });

    ipcMain.handle('ringBuffer:clear', async () => {
        if (!recorderWorkerWindow) return { success: false, error: 'Worker not running' };
        return new Promise((resolve) => {
            ipcMain.once('ringBuffer:clearResponse', (_, val) => resolve(val));
            recorderWorkerWindow?.webContents.send('ringBuffer:clearCommand');
        });
    });

    // Desktop Capturer sources
    ipcMain.handle('desktopCapturer:getSources', async (_, opts: {
        types: Array<'screen' | 'window'>;
        thumbnailSize?: { width: number; height: number };
        fetchWindowIcons?: boolean;
    }) => {
        log('[Main] Getting desktop capturer sources:', opts.types);
        try {
            const sources = await desktopCapturer.getSources({
                types: opts.types,
                thumbnailSize: opts.thumbnailSize || { width: 0, height: 0 },
                fetchWindowIcons: opts.fetchWindowIcons || false
            });

            return sources.map(source => ({
                id: source.id,
                name: source.name,
                display_id: source.display_id,
                appIcon: null,
                thumbnail: null
            }));
        } catch (error) {
            console.error('[Main] Failed to get desktop sources:', error);
            throw error;
        }
    });
}

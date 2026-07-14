import { ipcMain, BrowserWindow, app } from 'electron';
import path from 'path';
import { Worker } from 'worker_threads';
import type { VoiceWorkerRequest, VoiceWorkerResponse, VoiceWorkerData } from '../../backend/voice/voiceWorkerTypes';

class VoiceWorkerBridge {
    private worker: Worker | null = null;
    private pendingRequests = new Map<string, {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
    }>();
    private requestCounter = 0;
    private isReady = false;

    constructor(private getMainWindow: () => BrowserWindow | null) {}

    /**
     * Start the voice worker thread
     */
    start(): void {
        if (this.worker) {
            console.log('[VoiceWorkerBridge] Worker already running');
            return;
        }

        const workerPath = path.join(__dirname, '../../backend/voice/voiceWorker.js');
        const workerData: VoiceWorkerData = {
            appPath: app.getAppPath(),
            resourcesPath: process.resourcesPath || '',
            userDataPath: app.getPath('userData'),
            isPackaged: app.isPackaged,
        };

        console.log('[VoiceWorkerBridge] Starting worker:', workerPath);

        this.worker = new Worker(workerPath, { workerData });

        this.worker.on('message', (response: VoiceWorkerResponse) => {
            this.handleWorkerResponse(response);
        });

        this.worker.on('error', (error) => {
            console.error('[VoiceWorkerBridge] Worker error:', error);
            // Reject all pending requests
            this.pendingRequests.forEach(({ reject }, id) => {
                reject(new Error(`Worker error: ${error.message}`));
            });
            this.pendingRequests.clear();
            this.isReady = false;
        });

        this.worker.on('exit', (code) => {
            console.log('[VoiceWorkerBridge] Worker exited with code:', code);
            this.worker = null;
            this.isReady = false;

            // Reject all pending requests
            this.pendingRequests.forEach(({ reject }, id) => {
                reject(new Error(`Worker exited with code ${code}`));
            });
            this.pendingRequests.clear();

            // Auto-restart on unexpected exit
            if (code !== 0) {
                console.log('[VoiceWorkerBridge] Auto-restarting worker after crash...');
                setTimeout(() => this.start(), 1000);
            }
        });
    }

    /**
     * Stop the voice worker thread
     */
    async stop(): Promise<void> {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.isReady = false;
        }
    }

    /**
     * Generate a unique request ID
     */
    private nextRequestId(): string {
        return `voice_${++this.requestCounter}_${Date.now()}`;
    }

    /**
     * Send a request to the worker and wait for the response
     */
    private sendRequest<T>(request: VoiceWorkerRequest): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Voice worker not started'));
                return;
            }

            this.pendingRequests.set(request.requestId, { resolve, reject });

            // Timeout safety (60s for downloads, 35s for other ops)
            const timeoutMs = request.type === 'DOWNLOAD_MODEL' ? 120_000 : 35_000;
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(request.requestId)) {
                    this.pendingRequests.delete(request.requestId);
                    reject(new Error(`Voice worker request timed out: ${request.type}`));
                }
            }, timeoutMs);

            // Store timeout ref for cleanup
            const original = this.pendingRequests.get(request.requestId)!;
            this.pendingRequests.set(request.requestId, {
                resolve: (value: any) => {
                    clearTimeout(timeout);
                    original.resolve(value);
                },
                reject: (reason: any) => {
                    clearTimeout(timeout);
                    original.reject(reason);
                },
            });

            this.worker.postMessage(request);
        });
    }

    /**
     * Handle a response from the worker
     */
    private handleWorkerResponse(response: VoiceWorkerResponse): void {
        switch (response.type) {
            case 'READY':
                this.isReady = true;
                console.log('[VoiceWorkerBridge] Worker is ready');
                break;

            case 'AUDIO_SAVED': {
                const pending = this.pendingRequests.get(response.requestId);
                if (pending) {
                    this.pendingRequests.delete(response.requestId);
                    pending.resolve({ success: response.success, path: response.path, error: response.error });
                }
                break;
            }

            case 'TRANSCRIPTION_RESULT': {
                const pending = this.pendingRequests.get(response.requestId);
                if (pending) {
                    this.pendingRequests.delete(response.requestId);
                    pending.resolve(response.result);
                }
                break;
            }

            case 'STATUS_RESULT': {
                const pending = this.pendingRequests.get(response.requestId);
                if (pending) {
                    this.pendingRequests.delete(response.requestId);
                    pending.resolve(response.status);
                }
                break;
            }

            case 'DOWNLOAD_PROGRESS': {
                const mainWindow = this.getMainWindow();
                mainWindow?.webContents.send('voice:download-progress', response.progress);
                break;
            }

            case 'DOWNLOAD_COMPLETE': {
                const pending = this.pendingRequests.get(response.requestId);
                if (pending) {
                    this.pendingRequests.delete(response.requestId);
                    pending.resolve({ success: response.success, error: response.error });
                }
                break;
            }

            case 'STREAM_STARTED': {
                const pending = this.pendingRequests.get(response.requestId);
                if (pending) {
                    this.pendingRequests.delete(response.requestId);
                    pending.resolve({ success: response.success, error: response.error });
                }
                break;
            }

            case 'PARTIAL_TRANSCRIPT': {
                const mainWindow = this.getMainWindow();
                mainWindow?.webContents.send('voice:partial-transcript', {
                    text: response.text,
                    chunkIndex: response.chunkIndex,
                    isFinal: response.isFinal,
                });
                break;
            }

            case 'STREAM_STOPPED': {
                const pending = this.pendingRequests.get(response.requestId);
                if (pending) {
                    this.pendingRequests.delete(response.requestId);
                    pending.resolve({ success: response.success, fullText: response.fullText, error: response.error });
                }
                break;
            }

            case 'ERROR': {
                const pending = this.pendingRequests.get(response.requestId);
                if (pending) {
                    this.pendingRequests.delete(response.requestId);
                    pending.reject(new Error(response.error));
                }
                break;
            }
        }
    }

    async saveTempAudio(buffer: ArrayBuffer): Promise<{ success: boolean; path: string; error?: string }> {
        const requestId = this.nextRequestId();
        return this.sendRequest({ type: 'SAVE_AUDIO', requestId, buffer: Buffer.from(buffer) });
    }

    async transcribe(audioPath: string): Promise<{ success: boolean; text: string; error?: string }> {
        const requestId = this.nextRequestId();
        return this.sendRequest({ type: 'TRANSCRIBE', requestId, audioPath });
    }

    async checkStatus(): Promise<{ binaryExists: boolean; modelExists: boolean; isTranscribing: boolean; modelPath: string; binaryPath: string }> {
        const requestId = this.nextRequestId();
        return this.sendRequest({ type: 'CHECK_STATUS', requestId });
    }

    async downloadModel(): Promise<{ success: boolean; error?: string }> {
        const requestId = this.nextRequestId();
        return this.sendRequest({ type: 'DOWNLOAD_MODEL', requestId });
    }

    async startStream(options?: { cpuThreads?: number; maxDurationSec?: number }): Promise<{ success: boolean; error?: string }> {
        const requestId = this.nextRequestId();
        return this.sendRequest({
            type: 'START_STREAM',
            requestId,
            cpuThreads: options?.cpuThreads,
            maxDurationSec: options?.maxDurationSec,
        });
    }

    async stopStream(): Promise<{ success: boolean; fullText: string; error?: string }> {
        const requestId = this.nextRequestId();
        return this.sendRequest({ type: 'STOP_STREAM', requestId });
    }
}

export function registerVoiceIPC(getMainWindow: () => BrowserWindow | null) {
    const voiceWorkerBridge = new VoiceWorkerBridge(getMainWindow);

    app.whenReady().then(() => {
        voiceWorkerBridge.start();
    });

    app.on('will-quit', () => {
        voiceWorkerBridge.stop();
    });

    ipcMain.handle('voice:transcribe-local', async (_, audioPath: string) => {
        try {
            return await voiceWorkerBridge.transcribe(audioPath);
        } catch (error: any) {
            return { success: false, text: '', error: error.message || 'Transcription failed' };
        }
    });

    ipcMain.handle('voice:download-model', async () => {
        try {
            return await voiceWorkerBridge.downloadModel();
        } catch (error: any) {
            return { success: false, error: error.message || 'Model download failed' };
        }
    });

    ipcMain.handle('voice:check-status', async () => {
        try {
            return await voiceWorkerBridge.checkStatus();
        } catch (error: any) {
            return { binaryExists: false, modelExists: false, isTranscribing: false, modelPath: '', binaryPath: '' };
        }
    });

    ipcMain.handle('voice:save-temp-audio', async (_, buffer: ArrayBuffer) => {
        try {
            return await voiceWorkerBridge.saveTempAudio(buffer);
        } catch (error: any) {
            return { success: false, path: '', error: error.message };
        }
    });

    ipcMain.handle('voice:start-stream', async () => {
        try {
            return await voiceWorkerBridge.startStream();
        } catch (error: any) {
            return { success: false, error: error.message || 'Failed to start stream' };
        }
    });

    ipcMain.handle('voice:stop-stream', async () => {
        try {
            return await voiceWorkerBridge.stopStream();
        } catch (error: any) {
            return { success: false, fullText: '', error: error.message || 'Failed to stop stream' };
        }
    });
}

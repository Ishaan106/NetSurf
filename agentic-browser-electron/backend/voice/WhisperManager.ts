/**
 * WhisperManager — Local voice transcription via whisper.cpp CLI
 * 
 * Spawns whisper-cli as a child process for privacy-first, CPU-only transcription.
 * No cloud services, no large buffer IPC — just file paths.
 * 
 * ARCHITECTURE NOTE:
 * This module is designed to run inside a worker_threads Worker.
 * It does NOT import any Electron modules (app, etc.).
 * Paths are injected via constructor parameters.
 * All file I/O uses async fs.promises to avoid blocking the thread.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import os from 'os';

// ============ TYPES ============

export interface TranscribeResult {
    success: boolean;
    text: string;
    error?: string;
    durationMs?: number;
}

export interface VoiceStatus {
    binaryExists: boolean;
    modelExists: boolean;
    isTranscribing: boolean;
    modelPath: string;
    binaryPath: string;
}

export interface DownloadProgress {
    percent: number;
    downloadedMB: number;
    totalMB: number;
}

// ============ CONSTANTS ============

// Primary model: small.en for best accuracy/speed balance
const MODEL_FILENAME = 'ggml-small.en.bin';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin';

// Fallback model: base.en if small.en is too slow for the CPU
const FALLBACK_MODEL_FILENAME = 'ggml-base.en.bin';
const FALLBACK_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';

const WHISPER_BINARY_NAME = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
const WHISPER_STREAM_BINARY_NAME = process.platform === 'win32' ? 'whisper-stream.exe' : 'whisper-stream';
const TRANSCRIPTION_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_MAX_DURATION_SEC = 60;

// Performance threshold: if inference time exceeds this, fall back to smaller model
const INFERENCE_SLOW_THRESHOLD_MS = 5000; // slightly above stepMs (4500)
const SLOW_INFERENCE_COUNT_BEFORE_FALLBACK = 3; // consecutive slow inferences before switching

// ============ WHISPER MANAGER ============

export interface WhisperManagerConfig {
    /** Path to the app root (app.getAppPath() equivalent) */
    appPath: string;
    /** Path to resources (process.resourcesPath equivalent) */
    resourcesPath: string;
    /** Path to user data (app.getPath('userData') equivalent) */
    userDataPath: string;
    /** Whether the app is packaged */
    isPackaged: boolean;
}

export interface StreamingSessionOptions {
    cpuThreads?: number;
    maxDurationSec?: number;
    /** Audio step size in ms (default 2000) */
    stepMs?: number;
    /** Audio window length in ms (default 5000) */
    lengthMs?: number;
    /** Overlap from previous step in ms (default 500) */
    keepMs?: number;
}

class WhisperManager {
    private activeProcess: ChildProcess | null = null;
    private isRunning = false;
    private config: WhisperManagerConfig;

    // ---- Model state ----
    private activeModelFilename: string = MODEL_FILENAME;
    private usingFallbackModel: boolean = false;

    // ---- Streaming state ----
    private streamProcess: ChildProcess | null = null;
    private isStreaming = false;
    private streamChunkIndex = 0;
    private streamAccumulatedText = '';
    private streamLastTranscriptLine = '';
    private streamStepMs: number = 4500; // track step interval for drain calculation
    private streamMaxDurationTimer: ReturnType<typeof setTimeout> | null = null;
    private onPartialTranscript: ((text: string, chunkIndex: number, isFinal: boolean) => void) | null = null;

    // ---- Performance monitoring ----
    private lastChunkTimestamp: number = 0;
    private slowInferenceCount: number = 0;
    private inferenceTimesMs: number[] = [];
    private avgInferenceTimeMs: number = 4500; // default estimate for small.en on CPU

    constructor(config: WhisperManagerConfig) {
        this.config = config;
        console.log('[WhisperManager] Initialized with config:', JSON.stringify({
            appPath: config.appPath,
            resourcesPath: config.resourcesPath,
            userDataPath: config.userDataPath,
            isPackaged: config.isPackaged,
        }));
    }

    /**
     * Get the path to the whisper binary inside native/whisper/
     */
    getBinaryPath(): string {
        // In dev: project_root/native/whisper/
        // In production: resources/native/whisper/
        if (!this.config.isPackaged) {
            return path.join(this.config.appPath, 'native', 'whisper', WHISPER_BINARY_NAME);
        }
        return path.join(this.config.resourcesPath, 'native', 'whisper', WHISPER_BINARY_NAME);
    }

    /**
     * Get the models directory (appData/agentic-browser/models/)
     */
    getModelsDir(): string {
        return path.join(this.config.userDataPath, 'models');
    }

    /**
     * Get the full path to the active model file
     */
    getModelPath(): string {
        return path.join(this.getModelsDir(), this.activeModelFilename);
    }

    /**
     * Get the full path to the fallback model file
     */
    getFallbackModelPath(): string {
        return path.join(this.getModelsDir(), FALLBACK_MODEL_FILENAME);
    }

    /**
     * Check if the whisper binary exists (async)
     */
    async binaryExists(): Promise<boolean> {
        try {
            await fs.promises.access(this.getBinaryPath(), fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if the model file exists (async)
     */
    async modelExists(): Promise<boolean> {
        try {
            await fs.promises.access(this.getModelPath(), fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the current status of the whisper system
     */
    async getStatus(): Promise<VoiceStatus> {
        const status = {
            binaryExists: await this.binaryExists(),
            modelExists: await this.modelExists(),
            isTranscribing: this.isRunning,
            modelPath: this.getModelPath(),
            binaryPath: this.getBinaryPath(),
        };
        console.log('[WhisperManager] Status:', JSON.stringify(status));
        return status;
    }

    /**
     * Save audio buffer to a temp WAV file (async)
     */
    async saveTempAudio(buffer: Buffer): Promise<{ success: boolean; path: string; error?: string }> {
        try {
            const tempDir = os.tmpdir();
            const tempPath = path.join(tempDir, `whisper_audio_${Date.now()}.wav`);
            await fs.promises.writeFile(tempPath, buffer);
            return { success: true, path: tempPath };
        } catch (error: any) {
            return { success: false, path: '', error: error.message };
        }
    }

    /**
     * Download the whisper model from HuggingFace
     * Returns a promise that resolves when download is complete
     */
    async downloadModel(
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<{ success: boolean; error?: string }> {
        const modelPath = this.getModelPath();

        // Already downloaded
        if (await this.modelExists()) {
            return { success: true };
        }

        // Ensure models directory exists
        const modelsDir = this.getModelsDir();
        await fs.promises.mkdir(modelsDir, { recursive: true });

        const tempPath = modelPath + '.download';

        return new Promise((resolve) => {
            const makeRequest = (url: string, redirectCount = 0) => {
                if (redirectCount > 5) {
                    resolve({ success: false, error: 'Too many redirects' });
                    return;
                }

                const protocol = url.startsWith('https') ? https : http;
                const request = protocol.get(url, (response) => {
                    // Handle redirects
                    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        makeRequest(response.headers.location, redirectCount + 1);
                        return;
                    }

                    if (response.statusCode !== 200) {
                        resolve({ success: false, error: `HTTP ${response.statusCode}` });
                        return;
                    }

                    const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
                    let downloadedBytes = 0;

                    const fileStream = fs.createWriteStream(tempPath);

                    response.on('data', (chunk: Buffer) => {
                        downloadedBytes += chunk.length;
                        if (onProgress && totalBytes > 0) {
                            onProgress({
                                percent: Math.round((downloadedBytes / totalBytes) * 100),
                                downloadedMB: Math.round(downloadedBytes / 1024 / 1024 * 10) / 10,
                                totalMB: Math.round(totalBytes / 1024 / 1024 * 10) / 10,
                            });
                        }
                    });

                    response.pipe(fileStream);

                    fileStream.on('finish', async () => {
                        fileStream.close();
                        // Rename temp to final (async)
                        try {
                            await fs.promises.rename(tempPath, modelPath);
                            resolve({ success: true });
                        } catch (err: any) {
                            resolve({ success: false, error: `Failed to save model: ${err.message}` });
                        }
                    });

                    fileStream.on('error', async (err) => {
                        // Cleanup temp file
                        try { await fs.promises.unlink(tempPath); } catch { /* ignore */ }
                        resolve({ success: false, error: `Download write error: ${err.message}` });
                    });
                });

                request.on('error', async (err) => {
                    try { await fs.promises.unlink(tempPath); } catch { /* ignore */ }
                    resolve({ success: false, error: `Download error: ${err.message}` });
                });

                request.setTimeout(60_000, () => {
                    request.destroy();
                    fs.promises.unlink(tempPath).catch(() => { /* ignore */ });
                    resolve({ success: false, error: 'Download timeout' });
                });
            };

            makeRequest(MODEL_URL);
        });
    }

    /**
     * Transcribe an audio file using whisper.cpp CLI
     * 
     * @param audioPath - Path to the WAV audio file (16kHz mono)
     * @param options - Transcription options
     * @returns Transcription result with text or error
     */
    async transcribe(
        audioPath: string,
        options: { cpuThreads?: number } = {}
    ): Promise<TranscribeResult> {
        const startTime = Date.now();

        // Guard: only 1 concurrent transcription
        if (this.isRunning) {
            return { success: false, text: '', error: 'Transcription already in progress' };
        }

        // Guard: check binary exists (async)
        const binaryPath = this.getBinaryPath();
        const binExists = await this.binaryExists();
        console.log('[WhisperManager] Binary path:', binaryPath, 'exists:', binExists);
        if (!binExists) {
            return {
                success: false,
                text: '',
                error: `Whisper binary not found at: ${binaryPath}. Please place whisper-cli in native/whisper/`,
            };
        }

        // Guard: check model exists (async)
        const modelPath = this.getModelPath();
        const modExists = await this.modelExists();
        console.log('[WhisperManager] Model path:', modelPath, 'exists:', modExists);
        if (!modExists) {
            return {
                success: false,
                text: '',
                error: 'Whisper model not downloaded. Enable voice in settings to trigger download.',
            };
        }

        // Guard: check audio file exists (async)
        try {
            await fs.promises.access(audioPath, fs.constants.F_OK);
        } catch {
            return { success: false, text: '', error: `Audio file not found: ${audioPath}` };
        }

        this.isRunning = true;

        const cpuThreads = options.cpuThreads || 4;

        return new Promise<TranscribeResult>((resolve) => {
            let stdout = '';
            let stderr = '';
            let settled = false;

            const settle = (result: TranscribeResult) => {
                if (settled) return;
                settled = true;
                this.cleanup(audioPath);
                resolve(result);
            };

            // Spawn whisper process
            const args = [
                '-m', modelPath,
                '-f', audioPath,
                '-t', String(cpuThreads),
                '--output-txt',
                '--no-timestamps',
            ];

            console.log('[WhisperManager] Spawning:', binaryPath, args.join(' '));

            try {
                this.activeProcess = spawn(binaryPath, args, {
                    stdio: ['ignore', 'pipe', 'pipe'],
                    windowsHide: true,
                });
            } catch (err: any) {
                this.isRunning = false;
                settle({
                    success: false,
                    text: '',
                    error: `Failed to spawn whisper process: ${err.message}`,
                });
                return;
            }

            const proc = this.activeProcess;

            // Timeout kill after 30 seconds
            const timeout = setTimeout(() => {
                if (proc && !proc.killed) {
                    proc.kill('SIGKILL');
                }
                settle({
                    success: false,
                    text: '',
                    error: 'Transcription timed out (30s)',
                    durationMs: Date.now() - startTime,
                });
            }, TRANSCRIPTION_TIMEOUT_MS);

            // Collect stdout
            proc.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
                console.log('[WhisperManager] stdout chunk:', data.toString().substring(0, 200));
            });

            // Collect stderr (whisper logs progress here)
            proc.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
                console.log('[WhisperManager] stderr chunk:', data.toString().substring(0, 200));
            });

            proc.on('close', (code) => {
                clearTimeout(timeout);
                console.log('[WhisperManager] Process exited with code:', code);
                console.log('[WhisperManager] Full stdout:', stdout.substring(0, 500));
                console.log('[WhisperManager] Full stderr:', stderr.substring(0, 500));

                if (code === 0) {
                    // Parse transcript from stdout
                    const text = this.parseTranscript(stdout);
                    settle({
                        success: true,
                        text,
                        durationMs: Date.now() - startTime,
                    });
                } else {
                    settle({
                        success: false,
                        text: '',
                        error: `Whisper exited with code ${code}: ${stderr.substring(0, 200)}`,
                        durationMs: Date.now() - startTime,
                    });
                }
            });

            proc.on('error', (err) => {
                clearTimeout(timeout);
                settle({
                    success: false,
                    text: '',
                    error: `Whisper process error: ${err.message}`,
                    durationMs: Date.now() - startTime,
                });
            });
        });
    }

    /**
     * Parse the transcript from whisper stdout
     * Whisper outputs raw text, sometimes with leading/trailing whitespace
     */
    private parseTranscript(stdout: string): string {
        return stdout
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            // Filter out whisper log lines (they start with timestamps like [00:00:00.000 -->)
            .filter(line => !line.startsWith('['))
            .join(' ')
            .trim();
    }

    /**
     * Memory safety cleanup after transcription (async)
     */
    private cleanup(audioPath: string): void {
        // Delete temp audio file (fire-and-forget async)
        fs.promises.unlink(audioPath).catch(() => { /* ignore */ });

        // Kill process reference
        if (this.activeProcess) {
            this.activeProcess.removeAllListeners();
            if (!this.activeProcess.killed) {
                try { this.activeProcess.kill(); } catch { /* ignore */ }
            }
            this.activeProcess = null;
        }

        this.isRunning = false;
    }

    /**
     * Force kill any running transcription
     */
    kill(): void {
        if (this.activeProcess && !this.activeProcess.killed) {
            try { this.activeProcess.kill('SIGKILL'); } catch { /* ignore */ }
        }
        this.activeProcess = null;
        this.isRunning = false;
    }

    // ============ STREAMING (whisper-stream.exe) ============

    /**
     * Get the path to the whisper-stream binary
     */
    getStreamBinaryPath(): string {
        if (!this.config.isPackaged) {
            return path.join(this.config.appPath, 'native', 'whisper', WHISPER_STREAM_BINARY_NAME);
        }
        return path.join(this.config.resourcesPath, 'native', 'whisper', WHISPER_STREAM_BINARY_NAME);
    }

    /**
     * Check if whisper-stream binary exists (async)
     */
    async streamBinaryExists(): Promise<boolean> {
        try {
            await fs.promises.access(this.getStreamBinaryPath(), fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Start a streaming session using whisper-stream.exe
     * 
     * whisper-stream captures mic audio via SDL and runs sliding window inference,
     * outputting partial transcripts to stdout continuously.
     * 
     * @param options - Streaming session configuration
     * @param onPartial - Callback for each partial transcript
     * @returns Success/error status
     */
    async startStreamingSession(
        options: StreamingSessionOptions = {},
        onPartial: (text: string, chunkIndex: number, isFinal: boolean) => void
    ): Promise<{ success: boolean; error?: string }> {
        // Guard: no double streaming
        if (this.isStreaming) {
            return { success: false, error: 'Streaming session already active' };
        }

        // Guard: don't stream while batch transcribing
        if (this.isRunning) {
            return { success: false, error: 'Batch transcription in progress' };
        }

        // Guard: check stream binary exists
        const streamBinPath = this.getStreamBinaryPath();
        const binExists = await this.streamBinaryExists();
        console.log('[WhisperManager] Stream binary path:', streamBinPath, 'exists:', binExists);
        if (!binExists) {
            return {
                success: false,
                error: `whisper-stream binary not found at: ${streamBinPath}. Place whisper-stream in native/whisper/`,
            };
        }

        // Guard: check model exists
        const modelPath = this.getModelPath();
        const modExists = await this.modelExists();
        if (!modExists) {
            return {
                success: false,
                error: 'Whisper model not downloaded. Enable voice in settings to trigger download.',
            };
        }

        // Initialize streaming state
        this.isStreaming = true;
        this.streamChunkIndex = 0;
        this.streamAccumulatedText = '';
        this.streamLastTranscriptLine = '';
        this.onPartialTranscript = onPartial;
        this.lastChunkTimestamp = 0;
        this.slowInferenceCount = 0;
        this.inferenceTimesMs = [];
        this.avgInferenceTimeMs = 4500;

        const cpuThreads = options.cpuThreads || 4;
        // step=4500: matches small.en CPU inference time to prevent backlog.
        const stepMs = options.stepMs || 4500;
        this.streamStepMs = stepMs; // store for drain calculation
        // length=7000: enough context for accuracy, light enough for CPU.
        const lengthMs = options.lengthMs || 7000;
        // keep=2000: 2s overlap prevents word cuts at chunk boundaries.
        const keepMs = options.keepMs || 2000;
        const maxDurationSec = options.maxDurationSec || DEFAULT_STREAM_MAX_DURATION_SEC;

        // Build args for whisper-stream
        const args = [
            '-m', modelPath,
            '-t', String(cpuThreads),
            '--step', String(stepMs),
            '--length', String(lengthMs),
            '--keep', String(keepMs),
            '--keep-context',
            '-l', 'en',
        ];

        console.log('[WhisperManager] Starting streaming session:', streamBinPath, args.join(' '));

        try {
            this.streamProcess = spawn(streamBinPath, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });
        } catch (err: any) {
            this.cleanupStream();
            return { success: false, error: `Failed to spawn whisper-stream: ${err.message}` };
        }

        const proc = this.streamProcess;

        // Max session duration safety
        this.streamMaxDurationTimer = setTimeout(() => {
            console.log(`[WhisperManager] Max streaming duration reached (${maxDurationSec}s), stopping...`);
            this.stopStreamingSession();
        }, maxDurationSec * 1000);

        // Parse stdout line-by-line for partial transcripts
        let stdoutBuffer = '';
        proc.stdout?.on('data', (data: Buffer) => {
            stdoutBuffer += data.toString();
            const lines = stdoutBuffer.split('\n');
            // Keep the last (potentially incomplete) line in buffer
            stdoutBuffer = lines.pop() || '';

            for (const rawLine of lines) {
                // Strip ANSI escape codes (e.g. \x1b[2K erase-line) that whisper-stream uses
                const line = rawLine.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
                if (!line || line.startsWith('[') || line.startsWith('init') || line.startsWith('whisper_') || line.startsWith('SDL_main')) {
                    // Skip log lines, init messages, whisper info
                    continue;
                }

                // --- Performance monitoring + rolling average ---
                const now = Date.now();
                if (this.lastChunkTimestamp > 0) {
                    const inferenceTime = now - this.lastChunkTimestamp;

                    // Track rolling average of last 5 inference times
                    this.inferenceTimesMs.push(inferenceTime);
                    if (this.inferenceTimesMs.length > 5) {
                        this.inferenceTimesMs.shift();
                    }
                    this.avgInferenceTimeMs = this.inferenceTimesMs.reduce((a, b) => a + b, 0)
                        / this.inferenceTimesMs.length;

                    console.log(`[WhisperManager] Inference: ${inferenceTime}ms (avg: ${Math.round(this.avgInferenceTimeMs)}ms)`);

                    if (inferenceTime > INFERENCE_SLOW_THRESHOLD_MS) {
                        this.slowInferenceCount++;
                        console.warn(`[WhisperManager] Slow inference: ${inferenceTime}ms (count: ${this.slowInferenceCount}/${SLOW_INFERENCE_COUNT_BEFORE_FALLBACK})`);
                        if (this.slowInferenceCount >= SLOW_INFERENCE_COUNT_BEFORE_FALLBACK && !this.usingFallbackModel) {
                            console.warn('[WhisperManager] Too many slow inferences — will use fallback model (base.en) next session');
                            this.activeModelFilename = FALLBACK_MODEL_FILENAME;
                            this.usingFallbackModel = true;
                        }
                    } else {
                        this.slowInferenceCount = Math.max(0, this.slowInferenceCount - 1);
                    }
                }
                this.lastChunkTimestamp = now;

                // --- Duplicate word prevention ---
                // With 2s overlap (keepMs=2000), whisper-stream may repeat
                // the tail of the previous chunk. Remove overlapping suffix.
                const deduped = this.deduplicateOverlap(line);
                if (!deduped) continue; // Entire line was a duplicate

                // This is a transcript line
                this.streamChunkIndex++;
                this.streamAccumulatedText += (this.streamAccumulatedText ? ' ' : '') + deduped;
                this.streamLastTranscriptLine = deduped;
                console.log(`[WhisperManager] Streaming chunk ${this.streamChunkIndex}:`, deduped.substring(0, 100));

                if (this.onPartialTranscript) {
                    this.onPartialTranscript(deduped, this.streamChunkIndex, false);
                }
            }
        });

        // Log stderr (whisper progress/info)
        proc.stderr?.on('data', (data: Buffer) => {
            const msg = data.toString().trim();
            if (msg) {
                console.log('[WhisperManager] stream stderr:', msg.substring(0, 200));
            }
        });

        // Handle process exit
        proc.on('close', (code) => {
            console.log('[WhisperManager] whisper-stream exited with code:', code);

            // Flush any remaining data in stdoutBuffer (last line without trailing \n)
            if (stdoutBuffer.trim()) {
                const line = stdoutBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
                if (line && !line.startsWith('[') && !line.startsWith('init') && !line.startsWith('whisper_') && !line.startsWith('SDL_main')) {
                    const deduped = this.deduplicateOverlap(line);
                    if (deduped) {
                        this.streamChunkIndex++;
                        this.streamAccumulatedText += (this.streamAccumulatedText ? ' ' : '') + deduped;
                        this.streamLastTranscriptLine = deduped;
                        console.log(`[WhisperManager] Flushed final chunk ${this.streamChunkIndex}:`, deduped.substring(0, 100));
                        if (this.onPartialTranscript) {
                            this.onPartialTranscript(deduped, this.streamChunkIndex, false);
                        }
                    }
                }
                stdoutBuffer = '';
            }

            // Send isFinal=true signal (empty text — just marks the end)
            // The full accumulated text is returned via stopStreamingSession() result
            if (this.isStreaming && this.onPartialTranscript) {
                this.onPartialTranscript('', this.streamChunkIndex, true);
            }
            this.cleanupStream();
        });

        proc.on('error', (err) => {
            console.error('[WhisperManager] whisper-stream error:', err.message);
            this.cleanupStream();
        });

        return { success: true };
    }

    /**
     * Gracefully stop the streaming session.
     * Uses a "smart drain" that waits for the next inference result to arrive,
     * then exits quickly — instead of a fixed timer that might be too short.
     * @returns The full accumulated transcript
     */
    async stopStreamingSession(): Promise<{ success: boolean; fullText: string; error?: string }> {
        if (!this.isStreaming || !this.streamProcess) {
            return { success: false, fullText: '', error: 'No active streaming session' };
        }

        console.log('[WhisperManager] Stopping streaming session — smart drain starting...');

        // Smart drain: wait for the next inference result, then exit quickly.
        // Max timeout = stepMs + 2*avgInferenceTime + margin (covers worst case:
        // stop triggered right after an inference, need to wait for next step + inference).
        // But if a new transcript arrives during drain, just wait 1.5s more and exit.
        const maxDrainMs = Math.max(8000, this.streamStepMs + Math.round(this.avgInferenceTimeMs * 2) + 2000);
        const currentChunkIndex = this.streamChunkIndex;
        console.log(`[WhisperManager] Smart drain: max ${maxDrainMs}ms, waiting for chunk > ${currentChunkIndex} (step: ${this.streamStepMs}ms, avg inference: ${Math.round(this.avgInferenceTimeMs)}ms)`);

        await new Promise<void>((resolve) => {
            let settled = false;
            const settle = () => { if (!settled) { settled = true; clearInterval(poll); clearTimeout(maxTimer); resolve(); } };

            // Max timeout — always resolve eventually
            const maxTimer = setTimeout(settle, maxDrainMs);

            // Poll for new transcript arrival every 200ms
            const poll = setInterval(() => {
                if (this.streamChunkIndex > currentChunkIndex) {
                    // New transcript arrived during drain!
                    // Wait a short extra margin for any trailing data, then done.
                    console.log(`[WhisperManager] Smart drain: new chunk ${this.streamChunkIndex} arrived, waiting 1.5s more...`);
                    clearInterval(poll);
                    clearTimeout(maxTimer);
                    setTimeout(settle, 1500);
                }
            }, 200);
        });

        console.log('[WhisperManager] Drain complete, accumulated chunks:', this.streamChunkIndex);

        // Kill the process
        if (this.streamProcess && !this.streamProcess.killed) {
            try { this.streamProcess.kill(); } catch { /* ignore */ }
        }

        // Wait for close (which triggers stdout buffer flush from Fix 1)
        await new Promise<void>((resolve) => {
            const forceKillTimer = setTimeout(() => {
                if (this.streamProcess && !this.streamProcess.killed) {
                    try { this.streamProcess.kill('SIGKILL'); } catch { /* ignore */ }
                }
                resolve();
            }, 2000);

            if (this.streamProcess) {
                this.streamProcess.once('close', () => {
                    clearTimeout(forceKillTimer);
                    resolve();
                });
            } else {
                clearTimeout(forceKillTimer);
                resolve();
            }
        });

        // Capture text AFTER process exit — includes flushed stdout buffer
        const fullText = this.streamAccumulatedText;
        console.log('[WhisperManager] Final text length:', fullText.length, 'chars');

        this.cleanupStream();
        return { success: true, fullText };
    }

    /**
     * Force kill the streaming session immediately
     */
    killStreamingSession(): void {
        if (this.streamProcess && !this.streamProcess.killed) {
            try { this.streamProcess.kill('SIGKILL'); } catch { /* ignore */ }
        }
        this.cleanupStream();
    }

    /**
     * Remove duplicate words caused by overlapping audio segments.
     * whisper-stream with keepMs>0 re-transcribes the tail of the previous window.
     *
     * This algorithm compares the new line against the FULL accumulated text
     * (not just the last line), and allows a small word-offset (0-3) at the
     * start of the new line to handle whisper's rewording at overlap boundaries.
     *
     * Example: accumulated ends with "...of the points table in the"
     *          new line = "in the points table in the Indian Premier League"
     *          At offset=1, "the points table in the" matches perfectly.
     *          Result: "Indian Premier League" (5 overlap words + 1 offset = 6 stripped)
     */
    private deduplicateOverlap(newLine: string): string {
        if (!this.streamAccumulatedText) return newLine;

        const accWords = this.streamAccumulatedText.toLowerCase().split(/\s+/);
        const newWords = newLine.split(/\s+/);
        const newWordsLower = newWords.map(w => w.toLowerCase());

        // Try different offsets at the start of newWords (0 = exact, 1-3 = whisper reworded the boundary)
        let bestOverlap = 0;
        const maxNewOffset = Math.min(3, Math.max(0, newWordsLower.length - 2));

        for (let offset = 0; offset <= maxNewOffset; offset++) {
            // Minimum match length: require higher confidence for larger offsets
            const minMatchLen = offset === 0 ? 2 : 3;
            const maxLen = Math.min(accWords.length, newWordsLower.length - offset);

            for (let len = maxLen; len >= minMatchLen; len--) {
                const accSuffix = accWords.slice(-len);
                const newSlice = newWordsLower.slice(offset, offset + len);
                if (accSuffix.join(' ') === newSlice.join(' ')) {
                    const totalOverlap = offset + len;
                    if (totalOverlap > bestOverlap) {
                        bestOverlap = totalOverlap;
                    }
                    break; // Best for this offset found, try next offset
                }
            }
        }

        if (bestOverlap > 0) {
            const deduped = newWords.slice(bestOverlap).join(' ');
            console.log(`[WhisperManager] Dedup: removed ${bestOverlap} overlapping word(s)`);
            return deduped;
        }

        return newLine;
    }

    /**
     * Cleanup streaming state
     */
    private cleanupStream(): void {
        if (this.streamMaxDurationTimer) {
            clearTimeout(this.streamMaxDurationTimer);
            this.streamMaxDurationTimer = null;
        }

        if (this.streamProcess) {
            this.streamProcess.removeAllListeners();
            if (!this.streamProcess.killed) {
                try { this.streamProcess.kill(); } catch { /* ignore */ }
            }
            this.streamProcess = null;
        }

        this.isStreaming = false;
        this.onPartialTranscript = null;
    }

    /**
     * Check if a streaming session is active
     */
    get streaming(): boolean {
        return this.isStreaming;
    }
}

export { WhisperManager };
export default WhisperManager;

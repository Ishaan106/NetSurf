/**
 * Voice Worker Thread — Runs WhisperManager in a dedicated thread
 * 
 * This worker owns WhisperManager and handles all voice-related operations
 * off the Electron main thread: file I/O, model checks, model downloads,
 * temp audio creation, whisper-cli spawning, and transcript parsing.
 * 
 * Communication uses parentPort postMessage/on('message').
 * Pattern follows the existing screenshotWorker.ts design.
 */

import { parentPort, workerData } from 'worker_threads';
import { WhisperManager } from './WhisperManager';
import type {
    VoiceWorkerData,
    VoiceWorkerRequest,
    VoiceWorkerResponse,
} from './voiceWorkerTypes';

// ============ GUARD ============

if (!parentPort) {
    throw new Error('[VoiceWorker] This file must be run as a Worker Thread');
}

// ============ INIT ============

const config = workerData as VoiceWorkerData;
const whisperManager = new WhisperManager({
    appPath: config.appPath,
    resourcesPath: config.resourcesPath,
    userDataPath: config.userDataPath,
    isPackaged: config.isPackaged,
});

console.log('[VoiceWorker] Worker thread started');

// ============ MESSAGE HANDLER ============

parentPort.on('message', async (message: VoiceWorkerRequest) => {
    try {
        switch (message.type) {
            case 'SAVE_AUDIO': {
                const result = await whisperManager.saveTempAudio(Buffer.from(message.buffer));
                const response: VoiceWorkerResponse = {
                    type: 'AUDIO_SAVED',
                    requestId: message.requestId,
                    success: result.success,
                    path: result.path,
                    error: result.error,
                };
                parentPort!.postMessage(response);
                break;
            }

            case 'TRANSCRIBE': {
                const result = await whisperManager.transcribe(
                    message.audioPath,
                    { cpuThreads: message.cpuThreads }
                );
                const response: VoiceWorkerResponse = {
                    type: 'TRANSCRIPTION_RESULT',
                    requestId: message.requestId,
                    result,
                };
                parentPort!.postMessage(response);
                break;
            }

            case 'CHECK_STATUS': {
                const status = await whisperManager.getStatus();
                const response: VoiceWorkerResponse = {
                    type: 'STATUS_RESULT',
                    requestId: message.requestId,
                    status,
                };
                parentPort!.postMessage(response);
                break;
            }

            case 'DOWNLOAD_MODEL': {
                const result = await whisperManager.downloadModel((progress) => {
                    // Forward download progress to main thread
                    const progressResponse: VoiceWorkerResponse = {
                        type: 'DOWNLOAD_PROGRESS',
                        requestId: message.requestId,
                        progress,
                    };
                    parentPort!.postMessage(progressResponse);
                });

                const response: VoiceWorkerResponse = {
                    type: 'DOWNLOAD_COMPLETE',
                    requestId: message.requestId,
                    success: result.success,
                    error: result.error,
                };
                parentPort!.postMessage(response);
                break;
            }

            // ---- Streaming handlers ----

            case 'START_STREAM': {
                const result = await whisperManager.startStreamingSession(
                    {
                        cpuThreads: message.cpuThreads,
                        maxDurationSec: message.maxDurationSec,
                    },
                    (text, chunkIndex, isFinal) => {
                        // Forward partial transcripts to main thread
                        const partialResponse: VoiceWorkerResponse = {
                            type: 'PARTIAL_TRANSCRIPT',
                            text,
                            chunkIndex,
                            isFinal,
                        };
                        parentPort!.postMessage(partialResponse);
                    }
                );

                const response: VoiceWorkerResponse = {
                    type: 'STREAM_STARTED',
                    requestId: message.requestId,
                    success: result.success,
                    error: result.error,
                };
                parentPort!.postMessage(response);
                break;
            }

            case 'STOP_STREAM': {
                const result = await whisperManager.stopStreamingSession();
                const response: VoiceWorkerResponse = {
                    type: 'STREAM_STOPPED',
                    requestId: message.requestId,
                    fullText: result.fullText,
                    success: result.success,
                    error: result.error,
                };
                parentPort!.postMessage(response);
                break;
            }

            case 'KILL_STREAM': {
                whisperManager.killStreamingSession();
                const response: VoiceWorkerResponse = {
                    type: 'STREAM_STOPPED',
                    requestId: message.requestId,
                    fullText: '',
                    success: true,
                };
                parentPort!.postMessage(response);
                break;
            }

            default: {
                console.warn('[VoiceWorker] Unknown message type:', (message as any).type);
                break;
            }
        }
    } catch (error: any) {
        console.error('[VoiceWorker] Error handling message:', error);
        const errorResponse: VoiceWorkerResponse = {
            type: 'ERROR',
            requestId: (message as any).requestId || 'unknown',
            error: error.message || 'Unknown worker error',
        };
        parentPort!.postMessage(errorResponse);
    }
});

// ============ SIGNAL READY ============

const readyResponse: VoiceWorkerResponse = { type: 'READY' };
parentPort.postMessage(readyResponse);
console.log('[VoiceWorker] Ready');


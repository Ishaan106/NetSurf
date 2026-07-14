/**
 * Voice Worker Types — Shared message types between main thread and voice worker
 * 
 * The voice worker runs WhisperManager in a dedicated thread.
 * Main thread sends requests, worker sends responses.
 */

// ============ SHARED TYPES (re-exported from WhisperManager) ============

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

// ============ WORKER INIT DATA ============

export interface VoiceWorkerData {
    appPath: string;
    resourcesPath: string;
    userDataPath: string;
    isPackaged: boolean;
}

// ============ REQUEST MESSAGES (Main → Worker) ============

export interface SaveAudioRequest {
    type: 'SAVE_AUDIO';
    requestId: string;
    buffer: Buffer;
}

export interface TranscribeRequest {
    type: 'TRANSCRIBE';
    requestId: string;
    audioPath: string;
    cpuThreads?: number;
}

export interface CheckStatusRequest {
    type: 'CHECK_STATUS';
    requestId: string;
}

export interface DownloadModelRequest {
    type: 'DOWNLOAD_MODEL';
    requestId: string;
}

// ---- Streaming requests ----

export interface StartStreamRequest {
    type: 'START_STREAM';
    requestId: string;
    /** CPU threads for whisper-stream */
    cpuThreads?: number;
    /** Max streaming session duration in seconds */
    maxDurationSec?: number;
}

export interface StopStreamRequest {
    type: 'STOP_STREAM';
    requestId: string;
}

export interface KillStreamRequest {
    type: 'KILL_STREAM';
    requestId: string;
}

export type VoiceWorkerRequest =
    | SaveAudioRequest
    | TranscribeRequest
    | CheckStatusRequest
    | DownloadModelRequest
    | StartStreamRequest
    | StopStreamRequest
    | KillStreamRequest;

// ============ RESPONSE MESSAGES (Worker → Main) ============

export interface ReadyResponse {
    type: 'READY';
}

export interface AudioSavedResponse {
    type: 'AUDIO_SAVED';
    requestId: string;
    success: boolean;
    path: string;
    error?: string;
}

export interface TranscriptionResultResponse {
    type: 'TRANSCRIPTION_RESULT';
    requestId: string;
    result: TranscribeResult;
}

export interface StatusResultResponse {
    type: 'STATUS_RESULT';
    requestId: string;
    status: VoiceStatus;
}

export interface DownloadProgressResponse {
    type: 'DOWNLOAD_PROGRESS';
    requestId: string;
    progress: DownloadProgress;
}

export interface DownloadCompleteResponse {
    type: 'DOWNLOAD_COMPLETE';
    requestId: string;
    success: boolean;
    error?: string;
}

// ---- Streaming responses ----

export interface StreamStartedResponse {
    type: 'STREAM_STARTED';
    requestId: string;
    success: boolean;
    error?: string;
}

export interface PartialTranscriptResponse {
    type: 'PARTIAL_TRANSCRIPT';
    text: string;
    chunkIndex: number;
    isFinal: boolean;
}

export interface StreamStoppedResponse {
    type: 'STREAM_STOPPED';
    requestId: string;
    fullText: string;
    success: boolean;
    error?: string;
}

export interface ErrorResponse {
    type: 'ERROR';
    requestId: string;
    error: string;
}

export type VoiceWorkerResponse =
    | ReadyResponse
    | AudioSavedResponse
    | TranscriptionResultResponse
    | StatusResultResponse
    | DownloadProgressResponse
    | DownloadCompleteResponse
    | StreamStartedResponse
    | PartialTranscriptResponse
    | StreamStoppedResponse
    | ErrorResponse;

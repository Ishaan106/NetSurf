/**
 * VoiceButton — Mic recording button for voice-to-text transcription
 * 
 * Default mode: streaming via whisper-stream.exe (real-time partial transcripts)
 * Fallback mode: batch recording via MediaRecorder → whisper-cli
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, AlertCircle, Download } from 'lucide-react';
import clsx from 'clsx';
import { TranscriptVAD, type VADState } from '../../audio/vad';
import { useSettingsStore } from '../../store/settingsStore';
import { convertToWav16kMono } from '../../utils/wav';

type VoiceState = 'idle' | 'recording' | 'streaming' | 'transcribing' | 'error' | 'downloading';

interface VoiceButtonProps {
    onTranscript: (text: string) => void;
    onAutoSubmit: (text: string) => void;
    disabled?: boolean;
}

export function VoiceButton({ onTranscript, onAutoSubmit, disabled }: VoiceButtonProps) {
    const [state, setState] = useState<VoiceState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [downloadPercent, setDownloadPercent] = useState(0);
    const [recordingTime, setRecordingTime] = useState(0);

    const [partialText, setPartialText] = useState('');
    const [vadState, setVadState] = useState<VADState>('stopped');

    const voiceSettings = useSettingsStore((s) => s.voice);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const partialUnsubRef = useRef<(() => void) | null>(null);
    const vadRef = useRef<TranscriptVAD | null>(null);
    const stopStreamRef = useRef<() => void>(() => {});
    const accumulatedTextRef = useRef<string>('');

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
            stopStreamRecording();
        };
    }, []);

    const stopRecording = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (maxDurationTimerRef.current) {
            clearTimeout(maxDurationTimerRef.current);
            maxDurationTimerRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setRecordingTime(0);
    }, []);

    const handleDownloadModel = useCallback(async () => {
        const { electronAPI } = window;
        if (!electronAPI?.voice) return;

        setState('downloading');
        setDownloadPercent(0);
        console.log('[VoiceButton] Starting model download...');

        const unsub = electronAPI.voice.onDownloadProgress((progress) => {
            setDownloadPercent(progress.percent);
            console.log('[VoiceButton] Download progress:', progress.percent, '%');
        });

        try {
            const result = await electronAPI.voice.downloadModel();
            unsub();
            console.log('[VoiceButton] Download result:', result);
            if (result.success) {
                setState('idle');
            } else {
                setState('error');
                setErrorMsg(result.error || 'Download failed');
            }
        } catch (err: any) {
            unsub();
            setState('error');
            setErrorMsg(err.message || 'Download failed');
            console.error('[VoiceButton] Download error:', err);
        }
    }, []);

    // ============ STREAMING MODE (default) ============

    const startStreamRecording = useCallback(async () => {
        console.log('[VoiceButton] startStreamRecording called');
        const { electronAPI } = window;
        if (!electronAPI?.voice) {
            console.error('[VoiceButton] electronAPI.voice not available');
            setState('error');
            setErrorMsg('Voice API not available');
            return;
        }

        // Check whisper status first
        const status = await electronAPI.voice.checkStatus();
        console.log('[VoiceButton] Whisper status:', status);

        if (!status.binaryExists) {
            setState('error');
            setErrorMsg('Whisper binary not found. Place whisper-cli in native/whisper/');
            return;
        }

        if (!status.modelExists) {
            console.log('[VoiceButton] Model not found, triggering download...');
            await handleDownloadModel();
            return;
        }

        // Subscribe to partial transcripts
        setPartialText('');
        accumulatedTextRef.current = '';
        setVadState('waiting');
        partialUnsubRef.current = electronAPI.voice.onPartialTranscript((data) => {
            // Skip final marker (empty text) or blank transcripts
            if (!data.text || data.text.trim() === '') return;

            console.log('[VoiceButton] Partial transcript:', data.text.substring(0, 50));
            // Accumulate text in ref (avoids stale closure issues)
            accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + data.text;
            setPartialText(accumulatedTextRef.current);
            // Live update the input box with accumulated text
            onTranscript(accumulatedTextRef.current);
            // Feed transcript to VAD for silence detection
            vadRef.current?.onTranscript(data.text);
        });

        // Start streaming
        setState('streaming');
        setRecordingTime(0);
        console.log('[VoiceButton] Starting stream...');

        const result = await electronAPI.voice.startStream();
        if (!result.success) {
            console.warn('[VoiceButton] Streaming failed, falling back to batch mode:', result.error);
            // Cleanup streaming subscription
            if (partialUnsubRef.current) {
                partialUnsubRef.current();
                partialUnsubRef.current = null;
            }
            setPartialText('');
            // Fallback to batch recording
            startRecording();
            return;
        }

        // Recording timer
        timerRef.current = setInterval(() => {
            setRecordingTime(t => t + 1);
        }, 1000);

        // Max duration auto-stop
        maxDurationTimerRef.current = setTimeout(() => {
            console.log('[VoiceButton] Max streaming duration reached, stopping...');
            stopStreamRef.current();
        }, voiceSettings.maxDurationSec * 1000);

        // Initialize transcript-based VAD for auto-stop on silence
        const vad = new TranscriptVAD(
            {
                onSilenceDetected: () => {
                    console.log('[VoiceButton] VAD silence detected — auto-stopping stream');
                    stopStreamRef.current();
                },
                onStateChange: (state) => {
                    setVadState(state);
                },
            },
            {
                silenceTimeoutMs: 3000,
                cooldownMs: 800,
                minSpeechDurationMs: 1500,
            }
        );
        vad.start();
        vadRef.current = vad;

    }, [voiceSettings, handleDownloadModel]);

    const stopStreamRecording = useCallback(async () => {
        console.log('[VoiceButton] stopStreamRecording called');

        // Cleanup VAD
        if (vadRef.current) {
            vadRef.current.destroy();
            vadRef.current = null;
        }
        setVadState('stopped');

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (maxDurationTimerRef.current) {
            clearTimeout(maxDurationTimerRef.current);
            maxDurationTimerRef.current = null;
        }

        const { electronAPI } = window;
        if (!electronAPI?.voice) {
            setState('idle');
            return;
        }

        // Unsubscribe from partial transcripts BEFORE stopping
        // (prevents race conditions during drain period)
        if (partialUnsubRef.current) {
            partialUnsubRef.current();
            partialUnsubRef.current = null;
        }

        setState('transcribing');
        try {
            const result = await electronAPI.voice.stopStream();
            console.log('[VoiceButton] Stream stop result:', result);

            // Prefer backend fullText (includes drain-period transcripts),
            // fall back to frontend accumulation
            const backendText = result.fullText?.trim() || '';
            const frontendText = accumulatedTextRef.current.trim();
            const finalText = backendText.length >= frontendText.length ? backendText : frontendText;

            if (finalText && finalText.length >= 3) {
                console.log('[VoiceButton] Final streaming transcript:', finalText);
                if (voiceSettings.autoSendToAgent) {
                    onAutoSubmit(finalText);
                } else {
                    onTranscript(finalText);
                }
            } else {
                console.log('[VoiceButton] Streaming transcript too short:', finalText);
            }
        } catch (err: any) {
            console.error('[VoiceButton] Stream stop error:', err);
        }

        setPartialText('');
        accumulatedTextRef.current = '';
        setRecordingTime(0);
        setState('idle');
    }, [voiceSettings, onTranscript, onAutoSubmit]);

    // Keep the ref in sync so startStreamRecording callbacks use the latest version
    useEffect(() => {
        stopStreamRef.current = stopStreamRecording;
    }, [stopStreamRecording]);

    // ============ BATCH MODE (fallback) ============

    const startRecording = useCallback(async () => {
        console.log('[VoiceButton] startRecording (batch mode) called');
        const { electronAPI } = window;
        if (!electronAPI?.voice) {
            console.error('[VoiceButton] electronAPI.voice not available');
            setState('error');
            setErrorMsg('Voice API not available');
            return;
        }

        // Check whisper status first
        const status = await electronAPI.voice.checkStatus();
        console.log('[VoiceButton] Whisper status:', status);

        if (!status.binaryExists) {
            setState('error');
            setErrorMsg('Whisper binary not found. Place whisper-cli in native/whisper/');
            return;
        }

        if (!status.modelExists) {
            console.log('[VoiceButton] Model not found, triggering download...');
            await handleDownloadModel();
            return;
        }

        console.log('[VoiceButton] All checks passed, requesting mic...');

        // Request mic permission
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            streamRef.current = stream;
            chunksRef.current = [];

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm',
            });

            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                // Process recording
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                chunksRef.current = [];

                if (blob.size < 1000) {
                    console.log('[VoiceButton] Recording too short, ignoring');
                    setState('idle');
                    return;
                }

                setState('transcribing');
                console.log('[VoiceButton] Recording blob size:', blob.size, 'bytes');

                try {
                    // Convert to WAV 16kHz mono
                    console.log('[VoiceButton] Converting to WAV 16kHz mono...');
                    const wavBuffer = await convertToWav16kMono(blob);
                    console.log('[VoiceButton] WAV buffer size:', wavBuffer.byteLength, 'bytes');

                    // Save to temp file via IPC
                    console.log('[VoiceButton] Saving to temp file...');
                    const saveResult = await electronAPI.voice!.saveTempAudio(wavBuffer);
                    console.log('[VoiceButton] Save result:', saveResult);
                    if (!saveResult.success) {
                        throw new Error(saveResult.error || 'Failed to save audio');
                    }

                    // Transcribe
                    console.log('[VoiceButton] Calling transcribe with path:', saveResult.path);
                    const result = await electronAPI.voice!.transcribe(saveResult.path);
                    console.log('[VoiceButton] Transcription result:', result);

                    if (result.success && result.text) {
                        const trimmedText = result.text.trim();

                        // Don't send extremely short transcripts
                        if (trimmedText.length < 3) {
                            console.log('[VoiceButton] Transcript too short:', trimmedText);
                            setState('idle');
                            return;
                        }

                        console.log('[VoiceButton] Final transcript:', trimmedText);
                        if (voiceSettings.autoSendToAgent) {
                            onAutoSubmit(trimmedText);
                        } else {
                            onTranscript(trimmedText);
                        }
                        setState('idle');
                    } else {
                        setState('error');
                        setErrorMsg(result.error || 'Transcription returned empty');
                        console.error('[VoiceButton] Transcription failed:', result.error);
                    }
                } catch (err: any) {
                    setState('error');
                    setErrorMsg(err.message || 'Transcription failed');
                    console.error('[VoiceButton] Error in transcription pipeline:', err);
                }
            };

            mediaRecorder.onerror = () => {
                setState('error');
                setErrorMsg('Recording error');
                stopRecording();
            };

            // Start recording
            mediaRecorder.start(1000); // Collect chunks every second
            setState('recording');
            setRecordingTime(0);
            console.log('[VoiceButton] Recording started');

            // Recording timer
            timerRef.current = setInterval(() => {
                setRecordingTime(t => t + 1);
            }, 1000);

            // Hard stop after maxDurationSec
            maxDurationTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    console.log('[VoiceButton] Max duration reached, stopping...');
                    stopRecording();
                }
            }, voiceSettings.maxDurationSec * 1000);

        } catch (err: any) {
            setState('error');
            if (err.name === 'NotAllowedError') {
                setErrorMsg('Microphone access denied');
            } else {
                setErrorMsg(err.message || 'Failed to start recording');
            }
            console.error('[VoiceButton] Mic error:', err);
        }
    }, [voiceSettings, onTranscript, onAutoSubmit, stopRecording, handleDownloadModel]);

    const handleClick = useCallback(() => {
        if (state === 'streaming') {
            stopStreamRecording();
        } else if (state === 'recording') {
            stopRecording();
        } else if (state === 'idle' || state === 'error') {
            setErrorMsg('');
            // Default: streaming mode
            startStreamRecording();
        }
    }, [state, startStreamRecording, stopStreamRecording, startRecording, stopRecording]);

    // Voice button is always shown (no settings UI to toggle yet)

    const isRecording = state === 'recording';
    const isStreaming = state === 'streaming';
    const isTranscribing = state === 'transcribing';
    const isDownloading = state === 'downloading';
    const isError = state === 'error';
    const isActive = isRecording || isStreaming;
    const isDisabled = disabled || isTranscribing || isDownloading;

    return (
        <div className="relative">
            <motion.button
                type="button"
                className={clsx(
                    'flex items-center justify-center w-8 h-8 rounded-[10px] transition-colors',
                    isActive && 'bg-red-500 text-white shadow-lg shadow-red-500/40',
                    isTranscribing && 'bg-agent-primary/20 text-agent-primary cursor-wait',
                    isDownloading && 'bg-blue-500/20 text-blue-400 cursor-wait',
                    isError && 'bg-red-500/20 text-red-400',
                    !isActive && !isTranscribing && !isDownloading && !isError &&
                    'bg-chrome-surface-hover text-chrome-text-secondary hover:text-agent-primary hover:bg-agent-primary/10',
                    isDisabled && !isActive && 'opacity-50 cursor-not-allowed',
                )}
                whileHover={!isDisabled ? { scale: 1.1 } : {}}
                whileTap={!isDisabled ? { scale: 0.9 } : {}}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                onClick={handleClick}
                disabled={isDisabled}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                title={
                    isStreaming ? `Streaming... ${recordingTime}s (click to stop)` :
                    isRecording ? `Recording... ${recordingTime}s (click to stop)` :
                        isTranscribing ? 'Transcribing...' :
                            isDownloading ? `Downloading model... ${downloadPercent}%` :
                                isError ? errorMsg :
                                    'Voice input (whisper.cpp)'
                }
            >
                <AnimatePresence mode="wait">
                    {isActive && (
                        <motion.div
                            key="recording"
                            initial={{ scale: 0 }}
                            animate={{ scale: [1, 1.2, 1] }}
                            exit={{ scale: 0 }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                        >
                            <MicOff className="w-4 h-4" />
                        </motion.div>
                    )}
                    {isTranscribing && (
                        <motion.div
                            key="transcribing"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1, rotate: 360 }}
                            exit={{ scale: 0 }}
                            transition={{ rotate: { repeat: Infinity, duration: 1, ease: 'linear' } }}
                        >
                            <Loader2 className="w-4 h-4" />
                        </motion.div>
                    )}
                    {isDownloading && (
                        <motion.div
                            key="downloading"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                        >
                            <Download className="w-4 h-4" />
                        </motion.div>
                    )}
                    {isError && (
                        <motion.div
                            key="error"
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, rotate: 90 }}
                        >
                            <AlertCircle className="w-4 h-4" />
                        </motion.div>
                    )}
                    {state === 'idle' && (
                        <motion.div
                            key="idle"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                        >
                            <Mic className="w-4 h-4" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.button>

            {/* Recording/Streaming duration indicator */}
            <AnimatePresence>
                {isActive && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.8 }}
                        className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-mono whitespace-nowrap"
                    >
                        <motion.span
                            animate={{ opacity: [1, 0.5, 1] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                        >
                            {isStreaming ? '⚡' : '●'} {recordingTime}s / {voiceSettings.maxDurationSec}s
                            {isStreaming && vadState === 'waiting' && ' 🎤'}
                            {isStreaming && vadState === 'speaking' && ' 🗣️'}
                            {isStreaming && vadState === 'silence' && ' 🔇'}
                        </motion.span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Streaming partial transcript preview */}
            <AnimatePresence>
                {isStreaming && partialText && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="absolute -top-16 left-1/2 -translate-x-1/2 px-3 py-1 rounded-lg bg-agent-primary/90 text-white text-xs max-w-[250px] truncate whitespace-nowrap z-50"
                    >
                        {partialText.length > 40 ? '...' + partialText.slice(-40) : partialText}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Download progress bar */}
            <AnimatePresence>
                {isDownloading && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-blue-500/90 text-white text-xs whitespace-nowrap"
                    >
                        {downloadPercent}%
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Error tooltip */}
            <AnimatePresence>
                {isError && errorMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.8 }}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs whitespace-nowrap max-w-[200px] truncate z-50"
                    >
                        {errorMsg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default VoiceButton;

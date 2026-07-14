/**
 * PrivacyRecorder - Simple UI for zero-copy screen recording
 * 
 * Features:
 * - Start/Stop button
 * - FPS selector (30/60/MAX)
 * - Recording status indicator
 */

import { useState, useEffect, useCallback } from 'react';

interface RecorderStatus {
    initialized: boolean;
    recording: boolean;
    framesRecorded: number;
    currentFps: number;
    width: number;
    height: number;
    error?: string;
}

type FpsMode = 30 | 60 | 0; // 0 = MAX

export function PrivacyRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [fps, setFps] = useState<FpsMode>(60);
    const [status, setStatus] = useState<RecorderStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [privacyEnabled, setPrivacyEnabled] = useState(true);

    // Subscribe to status updates
    useEffect(() => {
        const api = (window as any).electronAPI?.recorder;
        if (!api) return;

        const unsubStatus = api.onStatus((newStatus: RecorderStatus) => {
            setStatus(newStatus);
            setIsRecording(newStatus.recording);
        });

        const unsubError = api.onError((err: any) => {
            setError(err.error);
            setIsRecording(false);
        });

        return () => {
            unsubStatus?.();
            unsubError?.();
        };
    }, []);

    const handleStartStop = useCallback(async () => {
        const api = (window as any).electronAPI?.recorder;
        if (!api) {
            setError('Recorder API not available');
            return;
        }

        setError(null);

        if (isRecording) {
            // Stop recording
            const result = await api.stop();
            if (!result.success) {
                setError(result.error);
            } else {
                setIsRecording(false);
            }
        } else {
            // Start recording
            const result = await api.start({
                fps: fps === 0 ? undefined : fps,  // undefined = MAX
                privacyEnabled
            });
            if (!result.success) {
                setError(result.error);
            } else {
                setIsRecording(true);
            }
        }
    }, [isRecording, fps, privacyEnabled]);

    const formatDuration = (frames: number, currentFps: number) => {
        if (!currentFps || currentFps === 0) return '00:00';
        const seconds = Math.floor(frames / currentFps);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="privacy-recorder p-4 bg-gray-900 rounded-lg max-w-sm">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🔒</span>
                Privacy Recorder
            </h3>

            {/* FPS Selector */}
            <div className="mb-4">
                <label className="text-gray-400 text-sm mb-2 block">Frame Rate</label>
                <div className="flex gap-2">
                    {[30, 60, 0].map((fpsOption) => (
                        <button
                            key={fpsOption}
                            onClick={() => setFps(fpsOption as FpsMode)}
                            disabled={isRecording}
                            className={`
                                px-4 py-2 rounded-lg text-sm font-medium transition-all
                                ${fps === fpsOption
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
                                ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        >
                            {fpsOption === 0 ? 'MAX' : `${fpsOption} FPS`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Privacy Toggle */}
            <div className="mb-4 flex items-center justify-between">
                <label className="text-gray-400 text-sm">Privacy Blur</label>
                <button
                    onClick={() => setPrivacyEnabled(!privacyEnabled)}
                    disabled={isRecording}
                    className={`
                        w-12 h-6 rounded-full transition-all relative
                        ${privacyEnabled ? 'bg-green-500' : 'bg-gray-600'}
                        ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                >
                    <span className={`
                        absolute top-1 w-4 h-4 bg-white rounded-full transition-all
                        ${privacyEnabled ? 'left-7' : 'left-1'}
                    `} />
                </button>
            </div>

            {/* Status Display */}
            {status && isRecording && (
                <div className="mb-4 bg-gray-800 rounded-lg p-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Duration</span>
                        <span className="text-white font-mono">
                            {formatDuration(status.framesRecorded, status.currentFps)}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-400">Frames</span>
                        <span className="text-emerald-400 font-mono">
                            {status.framesRecorded.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-400">FPS</span>
                        <span className="text-blue-400 font-mono">
                            {status.currentFps?.toFixed(1) || '-'}
                        </span>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="mb-4 bg-red-900/50 border border-red-500 rounded-lg p-3">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {/* Start/Stop Button */}
            <button
                onClick={handleStartStop}
                className={`
                    w-full py-3 rounded-lg font-bold text-lg transition-all
                    flex items-center justify-center gap-2
                    ${isRecording
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
                `}
            >
                {isRecording ? (
                    <>
                        <span className="w-4 h-4 bg-white rounded-sm" />
                        STOP RECORDING
                    </>
                ) : (
                    <>
                        <span className="w-0 h-0 border-l-[12px] border-l-white border-y-[8px] border-y-transparent" />
                        START RECORDING
                    </>
                )}
            </button>

            {/* Recording indicator */}
            {isRecording && (
                <div className="mt-3 flex items-center justify-center gap-2 text-red-400">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm">Recording in progress...</span>
                </div>
            )}
        </div>
    );
}

export default PrivacyRecorder;

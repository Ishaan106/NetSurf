/**
 * VideoTrimmer - Video editing component with timeline scrubber
 * 
 * Opens in a new tab when user wants to save a recording.
 * Allows trimming video with draggable handles and exports to .netsurf
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface VideoTrimmerProps {
    videoPath: string;
    onExport: (startMs: number, endMs: number, outputPath: string, videoPath: string) => void;
    onClose: () => void;
}

const VideoTrimmer: React.FC<VideoTrimmerProps> = ({ videoPath, onExport, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isDragging, setIsDragging] = useState<'start' | 'end' | 'playhead' | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    // Format time as MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle video metadata loaded
    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const dur = videoRef.current.duration;
            setDuration(dur);
            setTrimEnd(dur);
        }
    };

    // Handle time update
    const handleTimeUpdate = () => {
        if (videoRef.current && !isDragging) {
            setCurrentTime(videoRef.current.currentTime);
        }
    };

    // Toggle play/pause
    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                // Start from trim start if before
                if (videoRef.current.currentTime < trimStart) {
                    videoRef.current.currentTime = trimStart;
                }
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    // Keep playback within trim range
    useEffect(() => {
        if (videoRef.current && isPlaying) {
            if (videoRef.current.currentTime >= trimEnd) {
                videoRef.current.currentTime = trimStart;
            }
        }
    }, [currentTime, trimStart, trimEnd, isPlaying]);

    // Calculate position percentage
    const getPositionPercent = (time: number): number => {
        return duration > 0 ? (time / duration) * 100 : 0;
    };

    // Handle timeline click
    const handleTimelineClick = (e: React.MouseEvent) => {
        if (timelineRef.current && duration > 0) {
            const rect = timelineRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            const newTime = percent * duration;

            if (videoRef.current) {
                videoRef.current.currentTime = Math.max(trimStart, Math.min(trimEnd, newTime));
                setCurrentTime(newTime);
            }
        }
    };

    // Handle drag start
    const handleDragStart = (type: 'start' | 'end' | 'playhead') => (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(type);
    };

    // Handle drag move
    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !timelineRef.current || duration === 0) return;

        const rect = timelineRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const percent = x / rect.width;
        const newTime = percent * duration;

        if (isDragging === 'start') {
            setTrimStart(Math.min(newTime, trimEnd - 0.5));
        } else if (isDragging === 'end') {
            setTrimEnd(Math.max(newTime, trimStart + 0.5));
        } else if (isDragging === 'playhead') {
            const clampedTime = Math.max(trimStart, Math.min(trimEnd, newTime));
            setCurrentTime(clampedTime);
            if (videoRef.current) {
                videoRef.current.currentTime = clampedTime;
            }
        }
    }, [isDragging, duration, trimStart, trimEnd]);

    // Handle drag end
    const handleDragEnd = useCallback(() => {
        setIsDragging(null);
    }, []);

    // Mouse event listeners
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
            return () => {
                window.removeEventListener('mousemove', handleDragMove);
                window.removeEventListener('mouseup', handleDragEnd);
            };
        }
    }, [isDragging, handleDragMove, handleDragEnd]);

    // Handle export
    const handleExport = async () => {
        setIsExporting(true);
        try {
            // Ask for save location
            const result = await (window as any).electronAPI?.dialog?.showSaveDialog({
                title: 'Export Recording',
                defaultPath: 'recording.netsurf',
                filters: [{ name: 'NetSurf Recording', extensions: ['netsurf'] }]
            });

            if (result && !result.canceled && result.filePath) {
                const startMs = Math.floor(trimStart * 1000);
                const endMs = Math.floor(trimEnd * 1000);
                await onExport(startMs, endMs, result.filePath, videoPath);
            }
        } finally {
            setIsExporting(false);
        }
    };

    const trimDuration = trimEnd - trimStart;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            color: '#fff',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                background: 'rgba(0,0,0,0.3)',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        color: '#fff',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    ← Back
                </button>
                <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Video Trimmer</h1>
                <button
                    onClick={handleExport}
                    disabled={isExporting}
                    style={{
                        background: isExporting ? '#666' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        color: '#fff',
                        padding: '10px 24px',
                        borderRadius: '8px',
                        cursor: isExporting ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '14px'
                    }}
                >
                    {isExporting ? 'Exporting...' : 'Export .netsurf'}
                </button>
            </div>

            {/* Video Player */}
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                minHeight: 0
            }}>
                <video
                    ref={videoRef}
                    src={`file://${videoPath}`}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        borderRadius: '12px',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                    }}
                />
            </div>

            {/* Controls */}
            <div style={{
                padding: '20px',
                background: 'rgba(0,0,0,0.4)',
                borderTop: '1px solid rgba(255,255,255,0.1)'
            }}>
                {/* Play Button and Time */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '16px'
                }}>
                    <button
                        onClick={togglePlay}
                        style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            border: 'none',
                            color: '#fff',
                            fontSize: '20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                        Trim: {formatTime(trimDuration)}
                    </span>
                </div>

                {/* Timeline */}
                <div
                    ref={timelineRef}
                    onClick={handleTimelineClick}
                    style={{
                        position: 'relative',
                        height: '60px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        overflow: 'hidden'
                    }}
                >
                    {/* Trim Region */}
                    <div style={{
                        position: 'absolute',
                        left: `${getPositionPercent(trimStart)}%`,
                        width: `${getPositionPercent(trimEnd) - getPositionPercent(trimStart)}%`,
                        height: '100%',
                        background: 'rgba(102, 126, 234, 0.4)',
                        borderLeft: '3px solid #667eea',
                        borderRight: '3px solid #667eea'
                    }} />

                    {/* Start Handle */}
                    <div
                        onMouseDown={handleDragStart('start')}
                        style={{
                            position: 'absolute',
                            left: `${getPositionPercent(trimStart)}%`,
                            top: 0,
                            width: '12px',
                            height: '100%',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            cursor: 'ew-resize',
                            transform: 'translateX(-50%)',
                            borderRadius: '4px',
                            zIndex: 2
                        }}
                    />

                    {/* End Handle */}
                    <div
                        onMouseDown={handleDragStart('end')}
                        style={{
                            position: 'absolute',
                            left: `${getPositionPercent(trimEnd)}%`,
                            top: 0,
                            width: '12px',
                            height: '100%',
                            background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
                            cursor: 'ew-resize',
                            transform: 'translateX(-50%)',
                            borderRadius: '4px',
                            zIndex: 2
                        }}
                    />

                    {/* Playhead */}
                    <div
                        onMouseDown={handleDragStart('playhead')}
                        style={{
                            position: 'absolute',
                            left: `${getPositionPercent(currentTime)}%`,
                            top: 0,
                            width: '4px',
                            height: '100%',
                            background: '#fff',
                            cursor: 'ew-resize',
                            transform: 'translateX(-50%)',
                            zIndex: 3,
                            boxShadow: '0 0 10px rgba(255,255,255,0.5)'
                        }}
                    />
                </div>

                {/* Trim Values */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '8px',
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.6)'
                }}>
                    <span>Start: {formatTime(trimStart)}</span>
                    <span>End: {formatTime(trimEnd)}</span>
                </div>
            </div>
        </div>
    );
};

export default VideoTrimmer;

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useTabStore } from '@/store';

interface PerformanceMetrics {
    fps: number;
    memory: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
    } | null;
    uptime: number; // Session uptime in seconds
    tabCount: number;
    estimatedBrowserMemory: number;
}

export function PerformanceOverlay() {
    const [metrics, setMetrics] = useState<PerformanceMetrics>({
        fps: 0,
        memory: null,
        uptime: 0,
        tabCount: 0,
        estimatedBrowserMemory: 0,
    });
    const [isVisible, setIsVisible] = useState(false);
    const frameTimesRef = useRef<number[]>([]);
    const lastFrameTimeRef = useRef(performance.now());
    const lastUpdateTimeRef = useRef(0);
    const sessionStartRef = useRef(Date.now());

    const tabs = useTabStore((s) => s.tabs);

    useEffect(() => {
        // Toggle with Ctrl+Shift+P
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                setIsVisible((v) => !v);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Memoized update function to prevent unnecessary re-renders
    const updateMetrics = useCallback(() => {
        const now = performance.now();

        // Only update state every 500ms to reduce re-renders
        if (now - lastUpdateTimeRef.current < 500) {
            return;
        }
        lastUpdateTimeRef.current = now;

        const avgFrameTime =
            frameTimesRef.current.length > 0
                ? frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
                : 16.67;
        const fps = Math.round(1000 / avgFrameTime);

        // Get memory info (Chrome/Electron only)
        let memory = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((performance as any).memory) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mem = (performance as any).memory;
            memory = {
                usedJSHeapSize: mem.usedJSHeapSize,
                totalJSHeapSize: mem.totalJSHeapSize,
            };
        }

        // Calculate session uptime
        const uptime = Math.floor((Date.now() - sessionStartRef.current) / 1000);

        // Estimate total browser memory based on tabs
        const tabCount = tabs.length;
        const webviewTabs = tabs.filter(t => t.url !== 'about:blank').length;
        const baseMemory = memory?.usedJSHeapSize || 0;
        // Rough estimate: base + 80MB per active webview
        const estimatedBrowserMemory = baseMemory + (webviewTabs * 80 * 1024 * 1024);

        setMetrics({
            fps,
            memory,
            uptime,
            tabCount,
            estimatedBrowserMemory,
        });
    }, [tabs]);

    useEffect(() => {
        if (!isVisible) {
            // Reset frame data when hidden
            frameTimesRef.current = [];
            return;
        }

        let animationFrameId: number;

        const measureFrame = () => {
            const now = performance.now();
            const delta = now - lastFrameTimeRef.current;
            lastFrameTimeRef.current = now;

            frameTimesRef.current.push(delta);
            if (frameTimesRef.current.length > 60) {
                frameTimesRef.current.shift();
            }

            // Update metrics (throttled internally)
            updateMetrics();

            animationFrameId = requestAnimationFrame(measureFrame);
        };

        animationFrameId = requestAnimationFrame(measureFrame);

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [isVisible, updateMetrics]);

    const formatBytes = (bytes: number) => {
        if (bytes >= 1024 * 1024 * 1024) {
            return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
        }
        return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    };

    const formatUptime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    };

    const getFPSColor = (fps: number) => {
        if (fps >= 55) return 'text-agent-success';
        if (fps >= 30) return 'text-agent-warning';
        return 'text-agent-error';
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={clsx(
                        'fixed top-[var(--titlebar-height)] left-4 z-[9999]',
                        'bg-chrome-bg/95 backdrop-blur-chrome border border-chrome-border rounded-lg shadow-chrome-lg',
                        'p-3 font-mono text-xs'
                    )}
                >
                    <div className="flex items-center gap-4">
                        {/* FPS */}
                        <div className="flex flex-col items-center min-w-[50px]">
                            <motion.span
                                key={metrics.fps}
                                initial={{ scale: 1.2 }}
                                animate={{ scale: 1 }}
                                className={clsx('text-lg font-bold', getFPSColor(metrics.fps))}
                            >
                                {metrics.fps}
                            </motion.span>
                            <span className="text-chrome-text-secondary">FPS</span>
                        </div>

                        {/* JS Heap Memory */}
                        {metrics.memory && (
                            <div className="flex flex-col items-center min-w-[60px]">
                                <span className="text-lg font-bold text-chrome-accent">
                                    {formatBytes(metrics.memory.usedJSHeapSize)}
                                </span>
                                <span className="text-chrome-text-secondary">JS Heap</span>
                            </div>
                        )}

                        {/* Estimated Browser Memory */}
                        <div className="flex flex-col items-center min-w-[60px]">
                            <span className="text-lg font-bold text-purple-400">
                                {formatBytes(metrics.estimatedBrowserMemory)}
                            </span>
                            <span className="text-chrome-text-secondary">Est. Total</span>
                        </div>

                        {/* Tab count */}
                        <div className="flex flex-col items-center min-w-[40px]">
                            <span className="text-lg font-bold text-agent-primary">
                                {metrics.tabCount}
                            </span>
                            <span className="text-chrome-text-secondary">Tabs</span>
                        </div>

                        {/* Session uptime */}
                        <div className="flex flex-col items-center min-w-[50px]">
                            <span className="text-lg font-bold text-chrome-text">
                                {formatUptime(metrics.uptime)}
                            </span>
                            <span className="text-chrome-text-secondary">Uptime</span>
                        </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-chrome-border text-center text-chrome-text-secondary">
                        Ctrl+Shift+P to toggle
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default PerformanceOverlay;

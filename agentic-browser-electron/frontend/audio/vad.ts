/**
 * Transcript-Based Voice Activity Detection (VAD)
 * 
 * Instead of analyzing raw audio, this VAD tracks partial transcript
 * timestamps from whisper-stream.exe. If no new transcript arrives
 * within the silence timeout, it triggers an auto-stop callback.
 * 
 * SMART VAD: Adapts the silence timeout based on actual inference speed.
 * If the model is slow (e.g. small.en on CPU), the timeout increases
 * automatically to avoid mistaking slow inference for user silence.
 * 
 * Zero CPU overhead — purely event-driven timer logic.
 * Runs entirely in the renderer process.
 */

export interface VADConfig {
    /** Base silence timeout in ms — auto-stop after this much silence (default: 2800) */
    silenceTimeoutMs?: number;
    /** Cooldown after start — ignore silence during this period (default: 800) */
    cooldownMs?: number;
    /** Minimum speech duration before auto-stop is allowed (default: 1500) */
    minSpeechDurationMs?: number;
    /** Enable smart VAD that adapts timeout to inference speed (default: true) */
    adaptiveTimeout?: boolean;
}

export type VADState = 'waiting' | 'speaking' | 'silence' | 'stopped';

export interface VADCallbacks {
    /** Called when silence is detected and auto-stop should fire */
    onSilenceDetected: () => void;
    /** Called whenever the VAD state changes */
    onStateChange?: (state: VADState) => void;
}

const DEFAULT_CONFIG: Required<VADConfig> = {
    silenceTimeoutMs: 3000,
    cooldownMs: 800,
    minSpeechDurationMs: 1500,
    adaptiveTimeout: true,
};

export class TranscriptVAD {
    private config: Required<VADConfig>;
    private callbacks: VADCallbacks;

    private startTime: number = 0;
    private firstSpeechTime: number = 0;
    private lastSpeechTime: number = 0;
    private silenceTimer: ReturnType<typeof setTimeout> | null = null;
    private hasStopped: boolean = false;
    private state: VADState = 'waiting';
    private transcriptCount: number = 0;

    // Smart VAD: track inference intervals to adapt timeout
    private transcriptIntervals: number[] = [];
    private avgInferenceInterval: number = 0;

    constructor(callbacks: VADCallbacks, config?: VADConfig) {
        this.callbacks = callbacks;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Start monitoring. Call this when streaming begins.
     */
    start(): void {
        this.startTime = Date.now();
        this.firstSpeechTime = 0;
        this.lastSpeechTime = 0;
        this.hasStopped = false;
        this.transcriptCount = 0;
        this.transcriptIntervals = [];
        this.avgInferenceInterval = 0;
        this.setState('waiting');

        console.log('[VAD] Started — waiting for speech...');
    }

    /**
     * Feed a partial transcript event. Call this on every onPartialTranscript.
     * The text content doesn't matter — we only care about timing.
     */
    onTranscript(text: string): void {
        if (this.hasStopped) return;

        const now = Date.now();
        this.transcriptCount++;

        // Track first speech time
        if (this.firstSpeechTime === 0) {
            this.firstSpeechTime = now;
            console.log('[VAD] First speech detected');
        }

        // Smart VAD: track interval between transcripts
        if (this.lastSpeechTime > 0) {
            const interval = now - this.lastSpeechTime;
            this.transcriptIntervals.push(interval);
            // Keep last 5 intervals for rolling average
            if (this.transcriptIntervals.length > 5) {
                this.transcriptIntervals.shift();
            }
            this.avgInferenceInterval = this.transcriptIntervals.reduce((a, b) => a + b, 0)
                / this.transcriptIntervals.length;
        }

        this.lastSpeechTime = now;
        this.setState('speaking');

        console.log(`[VAD] Transcript #${this.transcriptCount}: "${text.substring(0, 40)}..." (avg interval: ${Math.round(this.avgInferenceInterval)}ms)`);

        // Reset the silence timer on every transcript
        this.resetSilenceTimer();
    }

    /**
     * Get the effective silence timeout, adapted to model speed.
     * If the model is slow, the timeout automatically increases
     * so we don't mistake "still inferring" for "user stopped speaking."
     */
    private getEffectiveTimeout(): number {
        if (!this.config.adaptiveTimeout || this.avgInferenceInterval === 0) {
            return this.config.silenceTimeoutMs;
        }

        // Effective timeout = max(configured timeout, avg inference interval + 800ms buffer)
        // This ensures we always wait at least one full inference cycle + buffer
        const adaptiveTimeout = this.avgInferenceInterval + 800;
        const effective = Math.max(this.config.silenceTimeoutMs, adaptiveTimeout);
        return effective;
    }

    /**
     * Reset and restart the silence countdown timer.
     */
    private resetSilenceTimer(): void {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
        }

        const timeout = this.getEffectiveTimeout();
        this.silenceTimer = setTimeout(() => {
            this.checkSilence();
        }, timeout);
    }

    /**
     * Check if we should trigger auto-stop.
     */
    private checkSilence(): void {
        if (this.hasStopped) return;

        const now = Date.now();
        const elapsed = now - this.startTime;

        // Guard: still in cooldown period
        if (elapsed < this.config.cooldownMs) {
            console.log(`[VAD] Still in cooldown (${elapsed}ms / ${this.config.cooldownMs}ms)`);
            this.resetSilenceTimer();
            return;
        }

        // Guard: no speech was ever detected
        if (this.firstSpeechTime === 0) {
            console.log('[VAD] No speech detected yet, waiting...');
            this.resetSilenceTimer();
            return;
        }

        // Guard: minimum speech duration not met
        const speechDuration = now - this.firstSpeechTime;
        if (speechDuration < this.config.minSpeechDurationMs) {
            console.log(`[VAD] Min speech duration not met (${speechDuration}ms / ${this.config.minSpeechDurationMs}ms)`);
            this.resetSilenceTimer();
            return;
        }

        // All guards passed — trigger auto-stop
        const silenceDuration = now - this.lastSpeechTime;
        const effectiveTimeout = this.getEffectiveTimeout();
        console.log(`[VAD] Silence detected (${silenceDuration}ms, threshold: ${effectiveTimeout}ms) — triggering auto-stop`);
        this.setState('silence');

        // Brief delay to show "silence" state before stopping
        setTimeout(() => {
            if (!this.hasStopped) {
                this.hasStopped = true;
                this.setState('stopped');
                console.log('[VAD] Auto-stop triggered');
                this.callbacks.onSilenceDetected();
            }
        }, 200);
    }

    /**
     * Update VAD state and notify listener.
     */
    private setState(newState: VADState): void {
        if (this.state === newState) return;
        this.state = newState;
        this.callbacks.onStateChange?.(newState);
    }

    /**
     * Get current VAD state.
     */
    getState(): VADState {
        return this.state;
    }

    /**
     * Clean up all timers and reset state. Call on stop/unmount.
     */
    destroy(): void {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        this.hasStopped = true;
        this.state = 'stopped';
        console.log('[VAD] Destroyed');
    }
}

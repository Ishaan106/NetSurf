import { Mic } from 'lucide-react';
import { useSettingsStore } from '@/store';
import clsx from 'clsx';

export function VoiceTab() {
    const voice = useSettingsStore((s) => s.voice);
    const setVoiceEnabled = useSettingsStore((s) => s.setVoiceEnabled);
    const setVoiceMaxDuration = useSettingsStore((s) => s.setVoiceMaxDuration);
    const setVoiceCpuThreads = useSettingsStore((s) => s.setVoiceCpuThreads);
    const setVoiceAutoSend = useSettingsStore((s) => s.setVoiceAutoSend);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-chrome-text flex items-center gap-2">
                    <Mic className="w-5 h-5 text-chrome-accent" />
                    Voice & Audio Settings
                </h2>
                <p className="text-xs text-chrome-text-secondary">Control settings for the Whisper transcription engine used in voice dictation.</p>
            </div>

            <div className="space-y-4 p-4 bg-chrome-surface border border-chrome-border rounded-xl">
                {/* Voice enabled */}
                <div className="flex items-center justify-between">
                    <div>
                        <label className="text-xs font-semibold text-chrome-text">Voice Input Enabled</label>
                        <p className="text-[10px] text-chrome-text-secondary">Allow microphone access for dictating prompts</p>
                    </div>
                    <button 
                        className={clsx(
                            "relative w-9 h-5 rounded-full transition-colors",
                            voice.enabled ? "bg-chrome-accent" : "bg-chrome-border"
                        )}
                        onClick={() => setVoiceEnabled(!voice.enabled)}
                    >
                        <span className={clsx("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform", voice.enabled ? "translate-x-4.5" : "translate-x-0.5")} />
                    </button>
                </div>

                {/* Auto Send to Agent */}
                <div className="flex items-center justify-between border-t border-chrome-border pt-3">
                    <div>
                        <label className="text-xs font-semibold text-chrome-text">Auto-submit Prompts</label>
                        <p className="text-[10px] text-chrome-text-secondary">Automatically run agent action after voice dictation ends</p>
                    </div>
                    <button 
                        className={clsx(
                            "relative w-9 h-5 rounded-full transition-colors",
                            voice.autoSendToAgent ? "bg-chrome-accent" : "bg-chrome-border"
                        )}
                        onClick={() => setVoiceAutoSend(!voice.autoSendToAgent)}
                    >
                        <span className={clsx("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform", voice.autoSendToAgent ? "translate-x-4.5" : "translate-x-0.5")} />
                    </button>
                </div>

                {/* Max duration slider */}
                <div className="border-t border-chrome-border pt-3 space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-chrome-text">Max Dictation Duration</label>
                        <span className="text-xs font-mono">{voice.maxDurationSec} seconds</span>
                    </div>
                    <input
                        type="range"
                        min="5"
                        max="60"
                        value={voice.maxDurationSec}
                        onChange={(e) => setVoiceMaxDuration(Number(e.target.value))}
                        className="w-full h-1 bg-chrome-border rounded-lg appearance-none cursor-pointer accent-chrome-accent"
                    />
                </div>

                {/* CPU threads */}
                <div className="border-t border-chrome-border pt-3 space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-chrome-text">Whisper CPU Threads</label>
                        <span className="text-xs font-mono">{voice.cpuThreads} threads</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="16"
                        value={voice.cpuThreads}
                        onChange={(e) => setVoiceCpuThreads(Number(e.target.value))}
                        className="w-full h-1 bg-chrome-border rounded-lg appearance-none cursor-pointer accent-chrome-accent"
                    />
                    <p className="text-[10px] text-chrome-text-muted">Higher threads can speed up transcription but consumes more CPU</p>
                </div>
            </div>
        </div>
    );
}

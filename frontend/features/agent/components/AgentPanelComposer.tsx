import { useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import VoiceButton from '../VoiceButton';

interface AgentPanelComposerProps {
    prompt: string;
    setPrompt: (value: string | ((curr: string) => string)) => void;
    handleKey: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    agentMode: 'chat' | 'research';
    isExec: boolean;
    handleSubmit: () => void;
    canSend: boolean;
}

export function AgentPanelComposer({
    prompt,
    setPrompt,
    handleKey,
    agentMode,
    isExec,
    handleSubmit,
    canSend
}: AgentPanelComposerProps) {
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const textarea = inputRef.current;
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }, [prompt]);

    return (
        <div className="ap-composer">
            <div className="ap-input-wrap">
                <textarea
                    ref={inputRef}
                    value={prompt}
                    onChange={event => setPrompt(event.target.value)}
                    onKeyDown={handleKey}
                    placeholder={agentMode === 'chat' ? 'Ask anything...' : 'Describe a browser task...'}
                    disabled={isExec}
                    rows={1}
                    style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
                />
                <div className="ap-input-actions">
                    <VoiceButton
                        onTranscript={(text: string) => setPrompt(current => `${current} ${text}`.trim())}
                        onAutoSubmit={(text: string) => {
                            setPrompt(text);
                            // Wait for state updates to settle, or submit immediately with text
                            setTimeout(() => handleSubmit(), 0);
                        }}
                    />
                    <button className="ap-send" onClick={handleSubmit} disabled={!canSend}>
                        <Send className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
export default AgentPanelComposer;

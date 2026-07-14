import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, FlaskConical, Square, Loader2, ArrowUp } from 'lucide-react';
import { useSettingsStore, useUIStore, useTabStore } from '@/store';

// Modular Sub-Components
import { AgentPanelHeader } from './components/AgentPanelHeader';
import { AgentPanelContext } from './components/AgentPanelContext';
import { AgentPanelEmptyState } from './components/AgentPanelEmptyState';
import { AgentPanelComposer } from './components/AgentPanelComposer';
import { EventCard } from './components/EventCard';

// Hooks
import { useAgentExecution } from './hooks/useAgentExecution';

// Styles
import './styles/agentPanel.css';

export function AgentPanel() {
    const closePanel = useUIStore(s => s.closePanel);

    // Workspaces state
    const workspaces = useSettingsStore(s => s.workspaces);
    const activeWorkspaceId = useSettingsStore(s => s.activeWorkspaceId);
    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
    const workspaceColor = activeWorkspace?.color || 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)';
    const chromeLayoutStyle = useSettingsStore(s => s.chromeLayoutStyle) || 'arc-floating';

    const tabs = useTabStore(s => s.tabs);
    const activeWorkspaceTabCount = tabs.filter(tab => (tab.workspaceId || 'work') === activeWorkspaceId).length;

    // Agent execution hook
    const {
        prompt,
        setPrompt,
        isExec,
        events,
        isPlanReady,
        showPicker,
        setShowPicker,
        pickerMode,
        setPickerMode,
        haltPrompt,
        setHaltPrompt,
        showHalt,
        modelLabel,
        suggestions,
        selectableGroups,
        providerGroups,
        enabledModels,
        llmProvider,
        llmModel,
        setLLMProvider,
        setLLMModel,
        currentProviderName,
        handleHaltReply,
        handleSuggestionClick,
        approvePlan,
        rejectPlan,
        handleSubmit,
        handleKey,
        stopCurrentTask,
        setModelEnabled,
        agentMode,
        setAgentMode,
        activeTab,
        screenshotEnabled,
        streamingText,
        status,
        canSend,
    } = useAgentExecution();

    const endRef = useRef<HTMLDivElement>(null);

    // Auto scroll to bottom
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [events, streamingText, showHalt]);

    const rootStyle = {
        '--ap-bg': 'var(--agent-panel-bg)',
        '--ap-surface': 'var(--agent-panel-surface)',
        '--ap-surface-strong': 'var(--agent-panel-surface-strong)',
        '--ap-surface-glass': 'var(--glass-bg)',
        '--ap-border': 'var(--agent-panel-border)',
        '--ap-text': 'var(--agent-panel-text)',
        '--ap-muted': 'var(--agent-panel-text-secondary)',
        '--ap-faint': 'var(--chrome-text-muted)',
        '--ap-menu-bg': 'color-mix(in srgb, var(--chrome-surface-strong) 92%, transparent)',
        '--ap-glow': 'var(--shadow-glow)',
        '--ap-accent': 'var(--chrome-accent, #7c73ff)',
        '--ap-accent-rgb': '124,115,255',
        '--ap-accent-gradient': workspaceColor,
        '--ap-cyan-rgb': '56,211,255',
        '--ap-ok': '#2fd475',
        '--ap-warn': '#ffb454',
        '--ap-error': '#ff5a69',
    } as React.CSSProperties;

    return (
        <motion.div
            className={`ap-shell border-l border-chrome-border ${
                chromeLayoutStyle === 'dia-minimal'
                    ? ''
                    : 'rounded-br-[16px]'
            }`}
            style={rootStyle}
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
            <AgentPanelHeader
                currentProviderName={currentProviderName}
                modelLabel={modelLabel}
                showPicker={showPicker}
                setShowPicker={setShowPicker}
                pickerMode={pickerMode}
                setPickerMode={setPickerMode}
                selectableGroups={selectableGroups}
                providerGroups={providerGroups}
                enabledModels={enabledModels}
                llmProvider={llmProvider}
                llmModel={llmModel}
                setLLMProvider={setLLMProvider}
                setLLMModel={setLLMModel}
                setModelEnabled={setModelEnabled}
                closePanel={closePanel}
            />

            <AgentPanelContext
                activeTab={activeTab}
                activeWorkspaceName={activeWorkspace?.name}
                activeWorkspaceTabCount={activeWorkspaceTabCount}
                screenshotEnabled={screenshotEnabled}
            />

            <div className="ap-mode">
                {(['chat', 'research'] as const).map(mode => (
                    <button key={mode} className={agentMode === mode ? 'on' : ''} onClick={() => setAgentMode(mode)}>
                        {mode === 'chat' ? <MessageCircle className="w-3.5 h-3.5" /> : <FlaskConical className="w-3.5 h-3.5" />}
                        {mode === 'chat' ? 'Chat' : 'Plan'}
                    </button>
                ))}
            </div>

            <div className="ap-scroll">
                {events.length === 0 && !isExec && (
                    <AgentPanelEmptyState
                        activeTab={activeTab}
                        suggestions={suggestions}
                        handleSuggestionClick={handleSuggestionClick}
                    />
                )}

                {events.map(event => (
                    <EventCard
                        key={event.id}
                        event={event}
                        isExec={isExec}
                        approvePlan={approvePlan}
                        rejectPlan={rejectPlan}
                    />
                ))}

                <AnimatePresence>
                    {showHalt && (
                        <motion.div className="ap-halt-reply" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <input
                                value={haltPrompt}
                                onChange={event => setHaltPrompt(event.target.value)}
                                onKeyDown={event => { if (event.key === 'Enter') handleHaltReply(); }}
                                placeholder="Reply to continue..."
                            />
                            <button onClick={handleHaltReply} disabled={!haltPrompt.trim()}>
                                <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {isExec && !isPlanReady && (
                    <div className="ap-working">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{streamingText || 'Working through the task...'}</span>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {(isExec || status === 'running' || status === 'paused') && (
                <div className="ap-stop">
                    <button onClick={stopCurrentTask}>
                        <Square className="w-3.5 h-3.5" />
                        Stop
                    </button>
                </div>
            )}

            {/* Quick Action suggestions row right above Composer */}
            {events.length > 0 && !isExec && (
                <div className="ap-followups scrollbar-none">
                    {suggestions.map((sug) => (
                        <button
                            key={sug.label}
                            onClick={() => handleSuggestionClick(sug.text)}
                        >
                            {sug.label}
                        </button>
                    ))}
                </div>
            )}

            <AgentPanelComposer
                prompt={prompt}
                setPrompt={setPrompt}
                handleKey={handleKey}
                agentMode={agentMode}
                isExec={isExec}
                handleSubmit={handleSubmit}
                canSend={canSend}
            />
        </motion.div>
    );
}

export default AgentPanel;

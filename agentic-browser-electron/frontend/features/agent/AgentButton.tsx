import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Sparkles } from 'lucide-react';
import { useAgentStore, useUIStore } from '@/store';
import clsx from 'clsx';

export function AgentButton() {
    const status = useAgentStore((s) => s.status);
    const togglePanel = useUIStore((s) => s.togglePanel);
    const isPanelOpen = useUIStore((s) => s.isPanelOpen);
    const activePanel = useUIStore((s) => s.activePanel);

    const isActive = status === 'running' || status === 'paused';
    const isAgentPanelOpen = isPanelOpen && activePanel === 'agent';
    const isSettingsPanelOpen = isPanelOpen && activePanel === 'settings';

    // Hide button when agent or settings panel is open to avoid overlap
    const isHidden = isAgentPanelOpen || isSettingsPanelOpen;

    const handleClick = () => {
        togglePanel('agent');
    };

    return (
        <AnimatePresence>
            {!isHidden && (
                <motion.button
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className={clsx(
                        'fixed bottom-6 right-6 z-30',
                        'flex items-center justify-center w-14 h-14 rounded-full',
                        'shadow-chrome-xl backdrop-blur-chrome',
                        'transition-colors duration-200',
                        isActive
                            ? 'bg-agent-primary text-white'
                            : 'bg-chrome-surface hover:bg-chrome-surface-hover text-chrome-text border border-chrome-border'
                    )}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleClick}
                    aria-label="Open agent panel"
                >
                    {/* Main icon */}
                    <motion.div
                        animate={isActive ? { rotate: [0, 10, -10, 0] } : {}}
                        transition={{ duration: 0.5, repeat: isActive ? Infinity : 0, repeatDelay: 1 }}
                    >
                        <Bot className="w-6 h-6" />
                    </motion.div>

                    {/* Pulse ring when running */}
                    <AnimatePresence>
                        {status === 'running' && (
                            <motion.div
                                className="absolute inset-0 rounded-full border-2 border-agent-primary"
                                initial={{ scale: 1, opacity: 1 }}
                                animate={{ scale: 1.5, opacity: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            />
                        )}
                    </AnimatePresence>

                    {/* Sparkle indicator for idle */}
                    <AnimatePresence>
                        {status === 'idle' && (
                            <motion.div
                                className="absolute -top-1 -right-1"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                            >
                                <Sparkles className="w-4 h-4 text-agent-primary" />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Status dot */}
                    <AnimatePresence>
                        {status !== 'idle' && (
                            <motion.div
                                className={clsx(
                                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-chrome-bg',
                                    status === 'running' && 'bg-agent-success',
                                    status === 'paused' && 'bg-agent-warning',
                                    status === 'error' && 'bg-agent-error',
                                    status === 'completed' && 'bg-agent-primary'
                                )}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                            />
                        )}
                    </AnimatePresence>
                </motion.button>
            )}
        </AnimatePresence>
    );
}

export default AgentButton;

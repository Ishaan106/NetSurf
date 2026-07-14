import React from 'react';
import { motion } from 'framer-motion';
import {
    Lightbulb,
    MousePointer,
    Eye,
    AlertCircle,
    Wrench
} from 'lucide-react';
import { type AgentLog } from '@/store';
import clsx from 'clsx';

export const LOG_CONFIG = {
    thought: {
        icon: Lightbulb,
        color: 'text-purple-400',
        label: 'Thought',
        emoji: '🧠'
    },
    action: {
        icon: MousePointer,
        color: 'text-green-400',
        label: 'Action',
        emoji: '⚡'
    },
    observation: {
        icon: Eye,
        color: 'text-blue-400',
        label: 'Result',
        emoji: '👁️'
    },
    error: {
        icon: AlertCircle,
        color: 'text-red-400',
        label: 'Error',
        emoji: '❌'
    },
    tool: {
        icon: Wrench,
        color: 'text-amber-400',
        label: 'Tool',
        emoji: '🔧'
    },
};

const getFriendlyMessage = (log: AgentLog): string => {
    const content = log.content;

    // Thought conversions
    if (log.type === 'thought') {
        if (content.includes('Understanding')) return '🧠 Understanding your request...';
        if (content.includes('task')) return '🧠 Analyzing the task...';
        if (content.includes('page')) return '🧠 Reading the page...';
        return `🧠 ${content.slice(0, 60)}${content.length > 60 ? '...' : ''}`;
    }

    // Action conversions
    if (log.type === 'action') {
        if (content.includes('Navigating')) {
            const url = content.match(/Navigating to:?\s*(.+)/i)?.[1] || '';
            try {
                const hostname = new URL(url).hostname.replace('www.', '');
                return `🌐 Opening ${hostname}...`;
            } catch {
                return '🌐 Opening page...';
            }
        }
        if (content.includes('Clicked') || content.includes('Click')) return '👆 Clicking element...';
        if (content.includes('Input') || content.includes('Type') || content.includes('Typing')) return '⌨️ Typing text...';
        if (content.includes('Scroll')) return '📜 Scrolling page...';
        if (content.includes('Wait')) return '⏳ Waiting...';
        return `⚡ ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`;
    }

    // Observation conversions
    if (log.type === 'observation') {
        if (content.includes('completed')) return '✅ Task completed!';
        if (content.includes('found')) return '👁️ Found what we need!';
        if (content.includes('Ready')) return '✅ Agent ready!';
        if (content.includes('initialized')) return '✅ Agent initialized!';
        return `👁️ ${content.slice(0, 60)}${content.length > 60 ? '...' : ''}`;
    }

    // Error conversions
    if (log.type === 'error') {
        return `❌ Error: ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`;
    }

    return content;
};

// CLEAN MODE: Simplified, emoji-based, friendly
export const CleanLogItem = React.memo(function CleanLogItem({ log, index }: { log: AgentLog; index: number }) {
    // Skip tool logs in clean mode
    if (log.type === 'tool') return null;

    const friendlyMessage = getFriendlyMessage(log);

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
                duration: 0.3,
                delay: index * 0.08,
                ease: [0.4, 0, 0.2, 1]
            }}
            className={clsx(
                'py-3 px-4 mb-2 rounded-lg',
                'bg-chrome-surface-hover border-l-2',
                log.type === 'thought' && 'border-purple-400',
                log.type === 'action' && 'border-green-400',
                log.type === 'observation' && 'border-blue-400',
                log.type === 'error' && 'border-red-400'
            )}
        >
            <p className="text-sm text-chrome-text leading-relaxed">
                {friendlyMessage}
            </p>
            {log.reason && (
                <p className="text-xs text-chrome-text-secondary mt-1 italic">
                    {log.reason}
                </p>
            )}
        </motion.div>
    );
});

// DEV MODE: Full technical details
export const DevLogItem = React.memo(function DevLogItem({ log, index }: { log: AgentLog; index: number }) {
    const config = LOG_CONFIG[log.type];
    const Icon = config.icon;
    const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                duration: 0.4,
                delay: index * 0.05,
                ease: [0.4, 0, 0.2, 1]
            }}
            className="mb-4"
        >
            {/* Header with type and time */}
            <div className="flex items-center gap-2 mb-1">
                <Icon className={clsx('w-4 h-4', config.color)} />
                <span className={clsx('text-sm font-medium', config.color)}>
                    {config.label}
                </span>
                <span className="text-xs text-chrome-text-secondary ml-auto">
                    {time}
                </span>
            </div>

            {/* Content */}
            <p className="text-sm text-chrome-text pl-6 leading-relaxed font-mono">
                {log.content}
            </p>

            {/* Tool details */}
            {log.toolName && (
                <div className="mt-2 ml-6 p-2 rounded bg-chrome-bg/50 font-mono text-xs overflow-x-auto">
                    <span className="text-amber-400">{log.toolName}</span>
                    {log.toolParams && (
                        <pre className="mt-1 text-chrome-text-secondary">
                            {JSON.stringify(log.toolParams, null, 2)}
                        </pre>
                    )}
                </div>
            )}
        </motion.div>
    );
});

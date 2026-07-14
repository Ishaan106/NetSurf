import { motion } from 'framer-motion';
import { Cloud, ShoppingCart, Newspaper } from 'lucide-react';
import clsx from 'clsx';

// Demo tasks
export const DEMO_TASKS = [
    {
        id: 'weather',
        icon: Cloud,
        label: 'Weather Search',
        prompt: 'Go to Google and search for "weather in New York today", then tell me the current temperature.',
        color: 'text-blue-400'
    },
    {
        id: 'shopping',
        icon: ShoppingCart,
        label: 'Shopping Task',
        prompt: 'Go to Amazon.com and search for "wireless headphones under $50", then list the top 3 results with prices.',
        color: 'text-orange-400'
    },
    {
        id: 'news',
        icon: Newspaper,
        label: 'News Task',
        prompt: 'Go to news.google.com and tell me the top 3 headlines right now.',
        color: 'text-emerald-400'
    },
];

interface DemoModeButtonsProps {
    onRunDemo: (prompt: string) => void;
    disabled: boolean;
}

export function DemoModeButtons({ onRunDemo, disabled }: DemoModeButtonsProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-3 border-t border-chrome-border"
        >
            <h4 className="text-xs font-medium text-chrome-text-secondary uppercase tracking-wider mb-2">
                Quick Demo Tasks
            </h4>
            <div className="flex flex-wrap gap-2">
                {DEMO_TASKS.map((demo, index) => {
                    const Icon = demo.icon;
                    return (
                        <motion.button
                            key={demo.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.1 }}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            disabled={disabled}
                            onClick={() => onRunDemo(demo.prompt)}
                            className={clsx(
                                'flex items-center gap-2 px-3 py-2 rounded-lg',
                                'bg-chrome-surface-hover border border-chrome-border',
                                'text-sm font-medium transition-all',
                                disabled
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'hover:border-chrome-border hover:bg-chrome-surface-hover'
                            )}
                        >
                            <Icon className={clsx('w-4 h-4', demo.color)} />
                            <span className="text-chrome-text">{demo.label}</span>
                        </motion.button>
                    );
                })}
            </div>
        </motion.div>
    );
}

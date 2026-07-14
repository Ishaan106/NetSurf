import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { type TimelineStep } from '@/store';

interface TaskTimelineProps {
    timeline: TimelineStep[];
}

export function TaskTimeline({ timeline }: TaskTimelineProps) {
    if (timeline.length === 0) return null;

    const getStatusIcon = (status: TimelineStep['status']) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
            case 'running': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
            case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
            default: return <div className="w-4 h-4 rounded-full border-2 border-chrome-border" />;
        }
    };

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="border-t border-chrome-border pt-3 mt-3 mx-4"
        >
            <h4 className="text-xs font-medium text-chrome-text-secondary uppercase tracking-wider mb-2">
                Steps Completed
            </h4>
            <div className="space-y-1">
                {timeline.map((step, index) => (
                    <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center gap-2 py-1"
                    >
                        {getStatusIcon(step.status)}
                        <span className="text-sm text-chrome-text">{step.action}</span>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

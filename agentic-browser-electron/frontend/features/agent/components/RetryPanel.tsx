import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface RetryPanelProps {
    error: string;
    onRetry: () => void;
}

export function RetryPanel({ error, onRetry }: RetryPanelProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="mx-4 my-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30"
        >
            <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                    <h4 className="text-sm font-medium text-red-400 mb-1">Task Failed</h4>
                    <p className="text-xs text-chrome-text-secondary mb-3">{error}</p>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onRetry}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Retry
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
}

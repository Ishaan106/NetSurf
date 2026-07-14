import React, { Component, ErrorInfo, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';
import clsx from 'clsx';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    name?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.setState({ errorInfo });

        // Log to telemetry if enabled
        console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, errorInfo);

        // Call custom error handler
        this.props.onError?.(error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <ErrorFallback
                    error={this.state.error}
                    errorInfo={this.state.errorInfo}
                    onRetry={this.handleRetry}
                    componentName={this.props.name}
                />
            );
        }

        return this.props.children;
    }
}

interface ErrorFallbackProps {
    error: Error | null;
    errorInfo: ErrorInfo | null;
    onRetry: () => void;
    componentName?: string;
}

function ErrorFallback({ error, errorInfo, onRetry, componentName }: ErrorFallbackProps) {
    const [showDetails, setShowDetails] = React.useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
                'flex flex-col items-center justify-center p-8',
                'bg-chrome-surface-hover rounded-lg border border-chrome-border',
                'min-h-[200px]'
            )}
        >
            <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-agent-error/20">
                <AlertTriangle className="w-8 h-8 text-agent-error" />
            </div>

            <h3 className="text-lg font-semibold text-chrome-text mb-2">
                Something went wrong
            </h3>

            <p className="text-sm text-chrome-text-secondary text-center mb-4 max-w-md">
                {componentName
                    ? `The ${componentName} component encountered an error.`
                    : 'An unexpected error occurred.'}
            </p>

            <div className="flex items-center gap-3 mb-4">
                <motion.button
                    className={clsx(
                        'flex items-center gap-2 px-4 py-2 rounded-lg',
                        'bg-chrome-accent text-white font-medium text-sm',
                        'hover:bg-chrome-accent-hover transition-colors'
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onRetry}
                >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                </motion.button>

                <motion.button
                    className={clsx(
                        'flex items-center gap-2 px-4 py-2 rounded-lg',
                        'bg-chrome-surface-active text-chrome-text font-medium text-sm',
                        'hover:bg-chrome-surface-hover transition-colors'
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowDetails(!showDetails)}
                >
                    <Bug className="w-4 h-4" />
                    {showDetails ? 'Hide Details' : 'Show Details'}
                </motion.button>
            </div>

            {showDetails && error && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="w-full mt-4 p-4 bg-chrome-bg rounded-lg overflow-hidden"
                >
                    <p className="text-sm font-mono text-agent-error mb-2">
                        {error.name}: {error.message}
                    </p>
                    {errorInfo?.componentStack && (
                        <pre className="text-xs font-mono text-chrome-text-secondary overflow-x-auto whitespace-pre-wrap">
                            {errorInfo.componentStack}
                        </pre>
                    )}
                </motion.div>
            )}
        </motion.div>
    );
}

export default ErrorBoundary;

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import clsx from 'clsx';

export function WindowControls() {
    const [isMaximized, setIsMaximized] = useState(false);
    const [platform, setPlatform] = useState<NodeJS.Platform>('win32');

    useEffect(() => {
        // Get platform
        if (window.electronAPI?.platform) {
            window.electronAPI.platform.get().then(setPlatform);
        }

        // Listen for maximize changes
        if (window.electronAPI?.window) {
            window.electronAPI.window.onMaximizedChange(setIsMaximized);
            window.electronAPI.window.isMaximized().then(setIsMaximized);
        }
    }, []);

    const handleMinimize = () => {
        window.electronAPI?.window?.minimize();
    };

    const handleMaximize = () => {
        window.electronAPI?.window?.maximize();
    };

    const handleClose = () => {
        window.electronAPI?.window?.close();
    };

    // macOS uses native traffic lights, so hide these controls
    if (platform === 'darwin') {
        return <div className="w-[68px]" />; // Spacer for traffic lights
    }

    return (
        <div className="flex h-10 items-center gap-1 pl-1">
            {/* Minimize */}
            <motion.button
                className={clsx(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    'text-chrome-text-secondary transition-colors duration-150 hover:bg-chrome-surface-hover hover:text-chrome-text'
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleMinimize}
                aria-label="Minimize"
            >
                <Minus className="w-3.5 h-3.5" />
            </motion.button>

            {/* Maximize/Restore */}
            <motion.button
                className={clsx(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    'text-chrome-text-secondary transition-colors duration-150 hover:bg-chrome-surface-hover hover:text-chrome-text'
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleMaximize}
                aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
                {isMaximized ? (
                    <Square className="w-3 h-3" />
                ) : (
                    <Maximize2 className="w-3 h-3" />
                )}
            </motion.button>

            {/* Close */}
            <motion.button
                className={clsx(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    'text-chrome-text-secondary transition-colors duration-150 hover:bg-red-500 hover:text-white'
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleClose}
                aria-label="Close"
            >
                <X className="w-3.5 h-3.5" />
            </motion.button>
        </div>
    );
}

export default WindowControls;

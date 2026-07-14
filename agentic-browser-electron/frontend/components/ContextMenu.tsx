import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface ContextMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'danger';
    separator?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const menuRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Adjust position if menu goes off screen
    const style: React.CSSProperties = {
        left: x,
        top: y,
    };

    // Simple bounds checking (approximate width 200px, height based on items)
    if (x + 200 > window.innerWidth) {
        style.left = x - 200;
    }
    if (y + (items.length * 40) > window.innerHeight) {
        style.top = y - (items.length * 40);
    }

    return (
        <>
            {/* Transparent backdrop to catch clicks outside (including over webviews) */}
            <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    onClose();
                }}
            />

            <motion.div
                ref={menuRef}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1, ease: 'easeOut' }}
                className="fixed z-50 min-w-[180px] bg-chrome-surface rounded-lg shadow-2xl border border-chrome-border overflow-hidden"
                style={style}
            >
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        {item.separator && (
                            <div className="h-px bg-chrome-border my-1" />
                        )}
                        <button
                            className={clsx(
                                'w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                                'hover:bg-chrome-surface-hover active:bg-chrome-surface-active',
                                item.variant === 'danger'
                                    ? 'text-agent-error hover:text-white hover:bg-agent-error'
                                    : 'text-chrome-text'
                            )}
                            onClick={() => {
                                item.onClick();
                                onClose();
                            }}
                        >
                            {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                            <span className="flex-1 text-left">{item.label}</span>
                        </button>
                    </React.Fragment>
                ))}
            </motion.div>
        </>
    );
}

export default ContextMenu;

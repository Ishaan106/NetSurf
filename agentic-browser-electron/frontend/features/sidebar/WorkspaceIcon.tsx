/**
 * WorkspaceIcon — Renders a workspace gradient badge with its icon.
 * The icon always uses white on the workspace gradient background.
 */

import * as Icons from 'lucide-react';
import { Home } from 'lucide-react';
import clsx from 'clsx';
import type { Workspace } from '@/store/settingsStore';

interface Props {
    workspace: Workspace;
    size?: 'sm' | 'md';
    active?: boolean;
}

export function WorkspaceIcon({ workspace, size = 'sm', active }: Props) {
    const Icon = workspace.icon
        ? ((Icons as Record<string, any>)[workspace.icon] ?? Home)
        : Home;

    const dim = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
    const iconDim = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

    return (
        <span
            className={clsx(
                'flex shrink-0 items-center justify-center rounded-xl shadow-sm transition-all duration-300',
                dim,
                active 
                    ? 'text-white scale-105 shadow-md shadow-black/10' 
                    : 'text-chrome-text-muted/60 bg-black/5 dark:bg-white/5 hover:bg-black/10 hover:dark:bg-white/10 hover:text-chrome-text hover:scale-102',
            )}
            style={active ? { background: workspace.color } : undefined}
        >
            <Icon className={iconDim} />
        </span>
    );
}

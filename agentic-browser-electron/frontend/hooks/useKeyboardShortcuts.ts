import { useEffect, useCallback, useRef } from 'react';
import { useSettingsStore } from '@/store';

type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta';
type KeyCombo = {
    key: string;
    modifiers: ModifierKey[];
};



// Parse shortcut keys from settings format
const parseShortcut = (keys: string[]): KeyCombo => {
    const modifiers: ModifierKey[] = [];
    let key = '';

    keys.forEach((k) => {
        const lower = k.toLowerCase();
        if (lower === 'ctrl' || lower === 'control') modifiers.push('ctrl');
        else if (lower === 'alt') modifiers.push('alt');
        else if (lower === 'shift') modifiers.push('shift');
        else if (lower === 'meta' || lower === 'cmd' || lower === 'command') modifiers.push('meta');
        else key = lower;
    });

    return { key, modifiers };
};

// Check if key event matches combo
const matchesCombo = (event: KeyboardEvent, combo: KeyCombo): boolean => {
    const eventKey = event.key.toLowerCase();

    // Handle special keys
    let keyMatches = eventKey === combo.key;
    if (combo.key === ',' && eventKey === ',') keyMatches = true;

    const hasCtrl = combo.modifiers.includes('ctrl');
    const hasAlt = combo.modifiers.includes('alt');
    const hasShift = combo.modifiers.includes('shift');
    const hasMeta = combo.modifiers.includes('meta');

    return (
        keyMatches &&
        event.ctrlKey === hasCtrl &&
        event.altKey === hasAlt &&
        event.shiftKey === hasShift &&
        event.metaKey === hasMeta
    );
};

// Global keyboard shortcut hook
export function useKeyboardShortcuts() {
    const shortcuts = useSettingsStore((s) => s.shortcuts);
    const handlersRef = useRef<Map<string, () => void>>(new Map());

    // Register a handler for a shortcut
    const registerHandler = useCallback((id: string, handler: () => void) => {
        handlersRef.current.set(id, handler);
    }, []);

    // Unregister a handler
    const unregisterHandler = useCallback((id: string) => {
        handlersRef.current.delete(id);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in input fields
            const target = event.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;

            for (const shortcut of shortcuts) {
                if (!shortcut.enabled) continue;

                const combo = parseShortcut(shortcut.keys);

                if (matchesCombo(event, combo)) {
                    // Allow these shortcuts even in input fields (global shortcuts)
                    const allowInInput = ['newTab', 'closeTab', 'addressBar', 'agentPanel', 'nextTab', 'prevTab', 'reopenTab', 'newWindow', 'history', 'toggleBookmarks'];
                    if (isInput && !allowInInput.includes(shortcut.id)) {
                        continue;
                    }

                    event.preventDefault();
                    event.stopPropagation();

                    const handler = handlersRef.current.get(shortcut.id);
                    if (handler) {
                        handler();
                    }
                    return;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [shortcuts]);

    return { registerHandler, unregisterHandler };
}

// Hook for registering a single shortcut handler
export function useShortcut(id: string, handler: () => void) {
    const { registerHandler, unregisterHandler } = useKeyboardShortcuts();

    useEffect(() => {
        registerHandler(id, handler);
        return () => unregisterHandler(id);
    }, [id, handler, registerHandler, unregisterHandler]);
}

// Hook for common shortcuts with predefined actions
export function useCommonShortcuts(actions: {
    onNewTab?: () => void;
    onCloseTab?: () => void;
    onReopenTab?: () => void;
    onNextTab?: () => void;
    onPrevTab?: () => void;
    onNewWindow?: () => void;
    onFocusAddressBar?: () => void;
    onOpenSettings?: () => void;
    onToggleAgentPanel?: () => void;
    onOpenDownloads?: () => void;
    onOpenHistory?: () => void;
    onReload?: () => void;
    onHardReload?: () => void;
    onToggleVerticalMode?: () => void;
    onToggleBookmarks?: () => void;
}) {
    const { registerHandler, unregisterHandler } = useKeyboardShortcuts();

    useEffect(() => {
        if (actions.onNewTab) registerHandler('newTab', actions.onNewTab);
        if (actions.onCloseTab) registerHandler('closeTab', actions.onCloseTab);
        if (actions.onReopenTab) registerHandler('reopenTab', actions.onReopenTab);
        if (actions.onNextTab) registerHandler('nextTab', actions.onNextTab);
        if (actions.onPrevTab) registerHandler('prevTab', actions.onPrevTab);
        if (actions.onNewWindow) registerHandler('newWindow', actions.onNewWindow);
        if (actions.onFocusAddressBar) registerHandler('addressBar', actions.onFocusAddressBar);
        if (actions.onOpenSettings) registerHandler('settings', actions.onOpenSettings);
        if (actions.onToggleAgentPanel) registerHandler('agentPanel', actions.onToggleAgentPanel);
        if (actions.onOpenDownloads) registerHandler('downloads', actions.onOpenDownloads);
        if (actions.onOpenHistory) registerHandler('history', actions.onOpenHistory);
        if (actions.onReload) registerHandler('reload', actions.onReload);
        if (actions.onHardReload) registerHandler('hardReload', actions.onHardReload);
        if (actions.onToggleVerticalMode) registerHandler('toggleVerticalMode', actions.onToggleVerticalMode);
        if (actions.onToggleBookmarks) registerHandler('toggleBookmarks', actions.onToggleBookmarks);

        return () => {
            Object.keys(actions).forEach((key) => {
                const id = key.replace('on', '').replace(/([A-Z])/g, (m) => m.toLowerCase());
                unregisterHandler(id);
            });
        };
    }, [actions, registerHandler, unregisterHandler]);
}

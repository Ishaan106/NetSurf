/**
 * useAgentCommands Hook
 * 
 * In the new architecture (@jarvis-agent/electron), browser actions are handled
 * directly by the Eko service's built-in BrowserAgent. This hook now only
 * maintains the webview registry for legacy compatibility and potential future use.
 */

import { useEffect } from 'react';
import { useTabStore } from '@/store';

// Global registry to track webviews by tab ID
const webviewRegistry = new Map<string, HTMLElement>();

/**
 * Register a webview element for agent control
 */
export function registerWebview(tabId: string, webview: HTMLElement) {
    webviewRegistry.set(tabId, webview);
}

/**
 * Unregister a webview element
 */
export function unregisterWebview(tabId: string) {
    webviewRegistry.delete(tabId);
}

/**
 * Get the webview for a specific tab
 */
export function getWebview(tabId: string): HTMLElement | null {
    return webviewRegistry.get(tabId) || null;
}

/**
 * Hook to handle agent commands from main process
 * 
 * NOTE: In the @jarvis-agent architecture, the EkoService handles all browser
 * interactions directly through the Electron main process (webContents API).
 * This hook is kept as a no-op for backward compatibility with App.tsx imports.
 */
export function useAgentCommands() {
    const activeTabId = useTabStore((s) => s.activeTabId);

    useEffect(() => {
        // No-op — agent commands are now handled by EkoService in the main process
        // via @jarvis-agent/electron's built-in BrowserAgent
    }, [activeTabId]);
}

export default useAgentCommands;

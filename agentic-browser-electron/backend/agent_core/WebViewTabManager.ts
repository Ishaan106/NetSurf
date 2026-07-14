/**
 * WebViewTabManager — ITabManager adapter for renderer-side <webview> tags
 *
 * Supports TWO webview registries:
 *   1. User tabs — synced from frontend tabStore (traditional browser tabs)
 *   2. Agent workspace — synced from AgentWorkspace component (shadow workspace webviews)
 *
 * When the agent workspace is active, getActiveView() prioritises workspace webviews.
 * This guarantees the agent always has a real webview to work with.
 */

import { webContents, WebContentsView, BrowserWindow } from 'electron';
import type { ITabManager } from '@jarvis-agent/electron';

interface SyncedTab {
    tabId: number;
    webContentsId: number;
    url: string;
    title: string;
}

interface SyncedAgentWebview {
    id: string;
    webContentsId: number;
    url: string;
    title: string;
}

export class WebViewTabManager implements ITabManager {
    private tabs = new Map<number, SyncedTab>();
    private activeTabId: number = -1;
    private mainWindow: BrowserWindow;

    // Agent workspace webviews (Shadow Workspace)
    private agentWebviews: SyncedAgentWebview[] = [];
    private agentFocusedId: string | null = null;
    private workspaceActive = false;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    // ─── User tab sync ───────────────────────────────────────────────────

    syncTabs(tabInfos: SyncedTab[], activeId: number): void {
        this.tabs.clear();
        for (const tab of tabInfos) {
            this.tabs.set(tab.tabId, tab);
        }
        this.activeTabId = activeId;
    }

    // ─── Agent workspace sync ────────────────────────────────────────────

    syncAgentWebviews(webviews: SyncedAgentWebview[], focusedId: string | null): void {
        this.agentWebviews = webviews;
        this.agentFocusedId = focusedId;
        this.workspaceActive = webviews.length > 0;
    }

    isWorkspaceActive(): boolean {
        return this.workspaceActive;
    }

    /**
     * Request frontend to open workspace and create a webview.
     * Returns immediately — caller should wait and retry getActiveView().
     */
    requestWorkspaceOpen(): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('agent:open-workspace');
        }
    }

    // ─── ITabManager interface ───────────────────────────────────────────

    getAllTabs(): Array<{ tabId: number; url: string; title: string }> {
        // Include both user tabs and agent workspace webviews
        const userTabs = Array.from(this.tabs.values()).map(t => ({
            tabId: t.tabId,
            url: t.url,
            title: t.title,
        }));

        const agentTabs = this.agentWebviews.map((w, i) => ({
            tabId: 90000 + i, // Use high IDs to avoid collision with user tabs
            url: w.url,
            title: `[Agent] ${w.title}`,
        }));

        return [...userTabs, ...agentTabs];
    }

    getActiveView(): WebContentsView | null {
        // Priority 1: Agent workspace (when active, always use workspace webviews)
        if (this.workspaceActive && this.agentWebviews.length > 0) {
            // Try focused webview first
            const focused = this.agentWebviews.find(w => w.id === this.agentFocusedId);
            if (focused && focused.webContentsId > 0) {
                const view = this.wrapWebContents(focused.webContentsId);
                if (view) return view;
            }
            // Fall back to any agent webview with valid webContentsId
            for (const w of this.agentWebviews) {
                if (w.webContentsId > 0) {
                    const view = this.wrapWebContents(w.webContentsId);
                    if (view) return view;
                }
            }
        }

        // Priority 2: Active user tab
        const tab = this.tabs.get(this.activeTabId);
        if (tab) {
            const view = this.wrapWebContents(tab.webContentsId);
            if (view) return view;
        }

        // Priority 3: Any user tab with valid webContentsId
        let fallbackView: WebContentsView | null = null;
        this.tabs.forEach((t) => {
            if (fallbackView) return;
            if (t.webContentsId > 0) {
                const view = this.wrapWebContents(t.webContentsId);
                if (view) {
                    this.activeTabId = t.tabId;
                    fallbackView = view;
                }
            }
        });
        if (fallbackView) return fallbackView;

        // No views at all — request workspace open
        this.requestWorkspaceOpen();
        return null;
    }

    getActiveTabId(): number {
        return this.activeTabId;
    }

    switchTab(tabId: number): boolean {
        // Check agent workspace tabs (90000+)
        if (tabId >= 90000) {
            const idx = tabId - 90000;
            const agentWv = this.agentWebviews[idx];
            if (agentWv) {
                this.agentFocusedId = agentWv.id;
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('agent:focus-webview', agentWv.id);
                }
                return true;
            }
            return false;
        }

        if (!this.tabs.has(tabId)) return false;
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('agent:switch-tab', tabId);
        }
        this.activeTabId = tabId;
        return true;
    }

    // ─── Internal helpers ────────────────────────────────────────────────

    private wrapWebContents(webContentsId: number): WebContentsView | null {
        const wc = webContents.fromId(webContentsId);
        if (!wc || wc.isDestroyed()) return null;

        const wrapper = {
            webContents: wc,
            getBounds: () => {
                const [width, height] = this.mainWindow.getContentSize();
                return { x: 0, y: 0, width, height };
            },
            setBounds: () => {},
            setVisible: () => {},
        } as unknown as WebContentsView;

        return wrapper;
    }

    getViewByTabId(tabId: number): WebContentsView | null {
        const tab = this.tabs.get(tabId);
        if (!tab) return null;
        return this.wrapWebContents(tab.webContentsId);
    }
}

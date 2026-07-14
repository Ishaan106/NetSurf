/**
 * AppBrowserService — Implements BrowserService from @jarvis-agent/core
 *
 * Provides tab listing and page content extraction for ChatAgent's
 * tab-aware context. Uses WebViewTabManager to access webview webContents.
 */

import type { BrowserService } from '@jarvis-agent/core';
import type { WebViewTabManager } from './WebViewTabManager';

/** Simple types matching @jarvis-agent/core's PageTab and PageContent */
interface PageTab {
    tabId: string;
    title: string;
    url: string;
    active: boolean;
    status: 'complete' | 'loading';
}

interface PageContent {
    tabId: string;
    url: string;
    title: string;
    content: string;
}

/** Script to extract visible text content from a page */
const EXTRACT_CONTENT_SCRIPT = `
  (() => {
    const sel = 'script, style, noscript, iframe, svg, img, video, audio, canvas';
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll(sel).forEach(el => el.remove());
    return clone.innerText.replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 50000);
  })()
`;

export class AppBrowserService implements BrowserService {
    private tabManager: WebViewTabManager;

    constructor(tabManager: WebViewTabManager) {
        this.tabManager = tabManager;
    }

    /** Load browser tabs as PageTab[] */
    async loadTabs(_chatId: string, tabIds?: string[]): Promise<PageTab[]> {
        const allTabs = this.tabManager.getAllTabs();
        const activeTabId = this.tabManager.getActiveTabId();

        const tabs: PageTab[] = allTabs.map((tab) => ({
            tabId: String(tab.tabId),
            title: tab.title,
            url: tab.url,
            active: tab.tabId === activeTabId,
            status: 'complete' as const,
        }));

        if (!tabIds?.length) return tabs;
        return tabs.filter((t) => tabIds.includes(t.tabId));
    }

    /** Extract page content from specified tabs */
    async extractPageContents(_chatId: string, tabIds: string[]): Promise<PageContent[]> {
        const results: PageContent[] = [];

        for (const tabId of tabIds) {
            try {
                const view = this.tabManager.getViewByTabId(Number(tabId));
                if (!view) continue;

                const content = await view.webContents.executeJavaScript(EXTRACT_CONTENT_SCRIPT);
                results.push({
                    tabId,
                    url: view.webContents.getURL(),
                    title: view.webContents.getTitle(),
                    content: content ?? '',
                });
            } catch (error) {
                console.error(`[AppBrowserService] Failed to extract tab ${tabId}:`, error);
            }
        }

        return results;
    }
}

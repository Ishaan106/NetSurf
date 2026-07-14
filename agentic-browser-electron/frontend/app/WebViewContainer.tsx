import React, { useEffect, useRef } from 'react';
import { useTabStore } from '@/store';
import { useHistoryStore } from '@/store/historyStore';
import { useSettingsStore } from '@/store/settingsStore';
import { registerWebview, unregisterWebview } from '@/hooks';
import clsx from 'clsx';
import ErrorPage from './ErrorPage';
import { NewTabPage } from './NewTabPage';
import { AgentWorkspace } from '@/features/agent/AgentWorkspace';

// ── Tab sync for BrowserAgent ──────────────────────────────────────────────
// Maps tab IDs to their webview webContentsId (set on dom-ready)
const tabWebContentsIdMap = new Map<string, number>();

/**
 * Sync current tab state to main process WebViewTabManager.
 * Called on dom-ready (when webContentsId becomes available) and on tab changes.
 */
function syncTabsToMainProcess(newWebContentsId?: number, tabId?: string) {
    // Update registry if we have a new mapping
    if (newWebContentsId && tabId) {
        tabWebContentsIdMap.set(tabId, newWebContentsId);
    }

    const api = (window as any).electronAPI;
    if (!api?.tabs?.sync) return;

    const state = useTabStore.getState();
    const tabInfos = state.tabs
        .filter(t => t.url !== 'about:blank' && !t.url.startsWith('workspace:')) // Only sync real tabs
        .map(t => ({
            tabId: parseInt(t.id.replace(/\D/g, ''), 10) || 0,
            webContentsId: tabWebContentsIdMap.get(t.id) || 0,
            url: t.url,
            title: t.title,
        }))
        .filter(t => t.webContentsId > 0); // Only include tabs with known webContentsId

    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    const activeTabNumericId = activeTab ? (parseInt(activeTab.id.replace(/\D/g, ''), 10) || 0) : -1;

    api.tabs.sync(tabInfos, activeTabNumericId).catch(() => {});
}

/**
 * WebViewContainer - Renders persistent browser content for all tabs
 * Keeps background tabs alive but hidden
 */
export function WebViewContainer() {
    const activeTabId = useTabStore((s) => s.activeTabId);
    const tabs = useTabStore((s) => s.tabs);

    // Use a stable sort order for rendering WebViews to prevent reloading on reorder
    // We sort by ID to ensure the DOM elements never change order when tabs are visually reordered
    const stableTabs = React.useMemo(() => {
        return [...tabs].sort((a, b) => a.id.localeCompare(b.id));
    }, [tabs]);

    const updateTab = useTabStore((s) => s.updateTab);
    const reload = useTabStore((s) => s.reload);
    const goBack = useTabStore((s) => s.goBack);
    const setActiveTab = useTabStore((s) => s.setActiveTab);

    // Sync tab state to main process whenever tabs or activeTabId change
    useEffect(() => {
        syncTabsToMainProcess();
    }, [tabs, activeTabId]);

    // Listen for agent-initiated tab switches from main process
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.tabs?.onSwitchTab) return;

        const unsub = api.tabs.onSwitchTab((numericTabId: number) => {
            // Find the tab whose numeric part matches
            const state = useTabStore.getState();
            const targetTab = state.tabs.find(t => {
                const parsed = parseInt(t.id.replace(/\D/g, ''), 10) || 0;
                return parsed === numericTabId;
            });
            if (targetTab) {
                setActiveTab(targetTab.id);
            }
        });

        return () => unsub?.();
    }, [setActiveTab]);


    const activeTab = tabs.find(t => t.id === activeTabId);
    const isActiveTabNewTab = activeTab?.url === 'about:blank';

    return (
        <div className={clsx("flex-1 relative h-full w-full overflow-hidden", isActiveTabNewTab ? "bg-transparent" : "bg-chrome-surface-solid")}>
            {stableTabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const isNewTab = tab.url === 'about:blank';
                const isWorkspaceTab = tab.url.startsWith('workspace:');

                return (
                    <div
                        key={tab.id}
                        className={clsx(
                            'absolute inset-0 w-full h-full flex flex-col',
                            isActive ? 'visible z-10' : 'invisible z-0'
                        )}
                    >
                        {isWorkspaceTab ? (
                            <AgentWorkspace />
                        ) : isNewTab ? (
                            <NewTabPage />
                        ) : (
                            <div className="flex-1 min-h-0 relative w-full h-full overflow-hidden border-t border-chrome-border bg-chrome-surface-solid">
                                <WebView
                                    id={tab.id}
                                    url={tab.url}
                                    isActive={isActive}
                                    workspaceId={tab.workspaceId || 'work'}
                                />
                                {tab.errorInfo && isActive && (
                                    <ErrorPage
                                        errorCode={tab.errorInfo.errorCode}
                                        errorDescription={tab.errorInfo.errorDescription}
                                        validatedURL={tab.errorInfo.validatedURL}
                                        onRetry={() => {
                                            updateTab(tab.id, { errorInfo: undefined });
                                            reload(tab.id);
                                        }}
                                        onGoBack={tab.canGoBack ? () => {
                                            updateTab(tab.id, { errorInfo: undefined });
                                            goBack(tab.id);
                                        } : undefined}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

interface WebViewProps {
    id: string;
    url: string;
    isActive: boolean;
    workspaceId: string;
}

const WebView = React.memo(({ id, url, workspaceId }: WebViewProps) => {
    const webviewRef = useRef<any>(null);
    const updateTab = useTabStore((s) => s.updateTab);
    const addTab = useTabStore((s) => s.addTab); // For Ctrl+Click new tab
    // Capture initial URL - this prevents React from reloading the webview on URL changes
    const [initialUrl] = React.useState(url);
    // Track the last URL we loaded to prevent duplicate loads
    const lastLoadedUrlRef = useRef(url);

    // Handle explicit URL changes (from address bar navigation)
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        // Skip if this is the initial render or if URL hasn't meaningfully changed
        if (url === initialUrl || url === lastLoadedUrlRef.current) return;

        // Check if webview is already at this URL (from internal navigation)
        try {
            const currentWebviewUrl = webview.getURL();
            if (currentWebviewUrl === url) return;

            // Only load if the URL is genuinely different (user typed in address bar)
            webview.loadURL(url);
            lastLoadedUrlRef.current = url;
        } catch (e) {
            // Webview may not be ready yet
        }
    }, [url, initialUrl]);

    useEffect(() => {
        const webview = webviewRef.current;
        if (webview) {
            // Navigation event listeners
            const handleGoBack = (e: Event) => {
                const customEvent = e as CustomEvent;
                if (customEvent.detail.tabId === id && webview.canGoBack()) {
                    webview.goBack();
                }
            };

            const handleGoForward = (e: Event) => {
                const customEvent = e as CustomEvent;
                if (customEvent.detail.tabId === id && webview.canGoForward()) {
                    webview.goForward();
                }
            };

            const handleReload = (e: Event) => {
                const customEvent = e as CustomEvent;
                if (customEvent.detail.tabId === id) {
                    webview.reload();
                }
            };

            const handleStop = (e: Event) => {
                const customEvent = e as CustomEvent;
                if (customEvent.detail.tabId === id) {
                    webview.stop();
                }
            };

            // Handle Ctrl+Click and middle-click to open in new tab instead of new window
            // Also blocks suspicious popup ads
            const handleNewWindow = (e: any) => {
                // e.url contains the URL to open
                // e.disposition tells us how it was triggered: 'foreground-tab', 'background-tab', 'new-window', etc.
                if (!e.url || e.url === 'about:blank') {
                    e.preventDefault();
                    return;
                }

                // ALWAYS prevent default first - we control what opens
                e.preventDefault();

                // List of known ad/popup/betting domains to block
                const blockedDomains = [
                    // Ad networks
                    'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
                    'adservice.google.com', 'facebook.com/tr', 'popads.net', 'popcash.net',
                    'propellerads.com', 'adsterra.com', 'trafficjunky.com', 'exoclick.com',
                    'juicyads.com', 'hilltopads.com', 'clickadu.com', 'mgid.com',
                    'revcontent.com', 'taboola.com', 'outbrain.com', 'imbx.io',
                    // Betting sites - comprehensive list
                    '1xbet', '1x-bet', '1xbit', 'melbet', 'betwinner', 'parimatch',
                    '22bet', 'betway', 'bet365', 'linebet', 'mostbet', 'pinup',
                    'betandyou', 'megapari', '1win', 'stake.com', 'bc.game',
                    '1x-probet', 'probet', 'pinnacle', 'betfair', 'unibet',
                    // Crypto/scam patterns
                    'crypto', 'airdrop', 'lottery', 'forex', 'binary',
                    // Casino patterns
                    'casino', 'slots', 'poker', 'roulette', 'blackjack', 'gambling',
                    // Generic ad patterns
                    'click.', 'track.', 'redirect.', 'popup.', 'popunder.'
                ];

                try {
                    const urlLower = e.url.toLowerCase();
                    const hostname = new URL(e.url).hostname.toLowerCase();

                    // Check if URL matches blocked domains or patterns
                    const isBlocked = blockedDomains.some(domain =>
                        hostname.includes(domain) || urlLower.includes(domain)
                    );

                    // Block if it's an ad/betting domain
                    if (isBlocked) {
                        // log('[PopupBlocker] Blocked:', hostname);
                        return; // Don't open anything
                    }

                    // For 'new-window' disposition, block cross-domain popups aggressively
                    if (e.disposition === 'new-window') {
                        const currentUrl = webview.getURL();
                        try {
                            const currentHostname = new URL(currentUrl).hostname.replace('www.', '');
                            const newHostname = hostname.replace('www.', '');

                            // If completely different domain, block it
                            if (!newHostname.endsWith(currentHostname) && !currentHostname.endsWith(newHostname)) {
                                // log('[PopupBlocker] Blocked cross-domain popup:', hostname);
                                return; // Don't open anything
                            }
                        } catch {
                            // If we can't parse current URL, block the popup
                            // log('[PopupBlocker] Blocked (parse error):', hostname);
                            return;
                        }
                    }

                    // If not blocked, open as new tab (e.disposition === 'foreground-tab' or user clicked with Ctrl)
                    // log('[Tab] Opening in new tab:', e.url.substring(0, 50));
                    addTab(e.url);
                } catch (err) {
                    // If URL parsing fails, block it as suspicious
                    // log('[PopupBlocker] Blocked (invalid URL)');
                }
            };

            window.addEventListener('webview-go-back', handleGoBack);
            window.addEventListener('webview-go-forward', handleGoForward);
            window.addEventListener('webview-reload', handleReload);
            window.addEventListener('webview-stop', handleStop);
            webview.addEventListener('new-window', handleNewWindow);

            const onDidStartLoading = () => {
                updateTab(id, { isLoading: true, errorInfo: undefined });
            };
            const onDidStopLoading = () => {
                updateTab(id, {
                    isLoading: false,
                    canGoBack: webview.canGoBack(),
                    canGoForward: webview.canGoForward()
                });
            };
            const onDidFailLoad = (e: any) => {
                // Ignore ERR_ABORTED (-3) as it's expected during navigation
                // Also ignore ERR_BLOCKED_BY_CLIENT (-20) from ad blockers etc.
                if (e.errorCode === -3 || e.errorCode === -20) return;
                // Ignore sub-frame errors (only care about main frame)
                if (!e.isMainFrame) return;
                console.error(`[Tab ${id}] Failed to load`, e);
                updateTab(id, {
                    isLoading: false,
                    errorInfo: {
                        errorCode: e.errorCode,
                        errorDescription: e.errorDescription || `ERR_CODE_${Math.abs(e.errorCode)}`,
                        validatedURL: e.validatedURL || '',
                    },
                });
            };
            const onDomReady = () => {
                // Sync this webview's webContentsId to main process for BrowserAgent
                try {
                    const webContentsId = webview.getWebContentsId();
                    if (webContentsId) {
                        syncTabsToMainProcess(webContentsId, id);
                    }
                } catch (e) {
                    console.error('[WebView] Failed to sync webContentsId:', e);
                }

                // Try to get title and update history with correct title
                try {
                    const title = webview.getTitle();
                    if (title) {
                        updateTab(id, { title });
                        // Update last history entry title if URL matches
                        const entries = useHistoryStore.getState().entries;
                        const lastEntry = entries.find(e => e.url === url && !e.title);
                        if (lastEntry) {
                            useHistoryStore.getState().addEntry({
                                url,
                                title,
                                workspaceId,
                                timestamp: Date.now(),
                            });
                        }
                    }
                } catch (e) { }

                // Sync workspace-level ad blocker setting
                try {
                    const wsAdblock = useSettingsStore.getState().workspaceAdblock;
                    const wsEnabled = wsAdblock[workspaceId] ?? true;
                    window.electronAPI?.adblock?.setEnabled(wsEnabled);
                } catch (e) { }

                // Extract favicon via JS (backup method)
                webview.executeJavaScript(`
                    (function() {
                        var links = document.querySelectorAll('link[rel*="icon"]');
                        if (links.length > 0) {
                            for (var i = 0; i < links.length; i++) {
                                if (links[i].href) return links[i].href;
                            }
                        }
                        return window.location.origin + "/favicon.ico";
                    })()
                `).then((favicon: string) => {
                    if (favicon) {
                        updateTab(id, { favicon });
                    }
                }).catch(() => { });

                // Inject F12/Ctrl+Shift+I handler to open webview DevTools
                webview.executeJavaScript(`
                    (function() {
                        if (window.__devToolsHandlerInjected) return;
                        window.__devToolsHandlerInjected = true;
                        
                        document.addEventListener('keydown', function(e) {
                            // F12 or Ctrl+Shift+I to open DevTools
                            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                                // log('[DevTools] Opening webview DevTools...');
                                // Signal to parent to open DevTools (handled via IPC)
                                window.postMessage({ type: 'OPEN_DEVTOOLS' }, '*');
                            }
                        });
                        // log('[DevTools] F12/Ctrl+Shift+I handler installed');
                    })();
                `).catch(() => { });

                // Listen for DevTools open request
                const handleDevToolsRequest = (event: MessageEvent) => {
                    if (event.data?.type === 'OPEN_DEVTOOLS') {
                        try {
                            webview.openDevTools();
                            // log('[WebView] DevTools opened');
                        } catch (e) {
                            console.error('[WebView] Failed to open DevTools:', e);
                        }
                    }
                };
                window.addEventListener('message', handleDevToolsRequest);

                // Inject popup blocker content script
                webview.executeJavaScript(`
                    (function() {
                        if (window.__popupBlockerInjected) return;
                        window.__popupBlockerInjected = true;
                        
                        // === STEP 1: Remove existing onclick handlers that may trigger popups ===
                        // These are often set inline or via direct assignment before our script runs
                        const removePopupHandlers = () => {
                            // Check and remove document.onclick if it looks suspicious
                            if (document.onclick) {
                                const str = document.onclick.toString ? document.onclick.toString() : '';
                                if (str.includes('open') || str.includes('href') || str.includes('location')) {
                                    // log('[PopupBlocker] Removed document.onclick popup handler');
                                    document.onclick = null;
                                }
                            }
                            
                            // Check and remove body.onclick
                            if (document.body && document.body.onclick) {
                                const str = document.body.onclick.toString ? document.body.onclick.toString() : '';
                                if (str.includes('open') || str.includes('href') || str.includes('location')) {
                                    // log('[PopupBlocker] Removed body.onclick popup handler');
                                    document.body.onclick = null;
                                }
                            }
                        };
                        
                        // Run immediately and after a delay (for dynamically added handlers)
                        removePopupHandlers();
                        setTimeout(removePopupHandlers, 500);
                        setTimeout(removePopupHandlers, 1500);
                        setTimeout(removePopupHandlers, 3000);
                        
                        // === STEP 2: Override window.open ===
                        const originalOpen = window.open;
                        let openAttempts = 0;
                        
                        window.open = function(url, name, features) {
                            openAttempts++;
                            if (openAttempts > 3) {
                                // log('[PopupBlocker] Blocked excessive window.open');
                                return null;
                            }
                            setTimeout(() => { openAttempts = Math.max(0, openAttempts - 1); }, 5000);
                            
                            if (url) {
                                const urlLower = url.toLowerCase();
                                const blocked = ['popup', 'popunder', 'track', 'redirect', 'casino', 'betting', 'crypto', 'airdrop', 'lottery', 'imbx', 'forex', 'binary', '1xbet', 'melbet', 'betwinner'];
                                for (const p of blocked) {
                                    if (urlLower.includes(p)) {
                                        // log('[PopupBlocker] Blocked:', url.substring(0, 40));
                                        return null;
                                    }
                                }
                            }
                            return originalOpen.call(window, url, name, features);
                        };
                        
                        // === STEP 3: Block new suspicious click handlers ===
                        const originalAddEventListener = EventTarget.prototype.addEventListener;
                        EventTarget.prototype.addEventListener = function(type, listener, options) {
                            if (type === 'click' && (this === document || this === document.body || this === window)) {
                                const str = listener.toString ? listener.toString() : '';
                                if (str.includes('window.open') || str.includes('.open(') || str.includes('location.href') || str.includes('location=')) {
                                    // log('[PopupBlocker] Blocked click handler registration');
                                    return; // Don't register this listener
                                }
                            }
                            return originalAddEventListener.call(this, type, listener, options);
                        };
                        
                        // === STEP 4: Intercept onclick property assignment ===
                        const nullifyOnclick = (obj, name) => {
                            try {
                                let currentHandler = null;
                                Object.defineProperty(obj, 'onclick', {
                                    get: () => currentHandler,
                                    set: (handler) => {
                                        if (handler) {
                                            const str = handler.toString ? handler.toString() : '';
                                            if (str.includes('open') || str.includes('location')) {
                                                // log('[PopupBlocker] Blocked ' + name + '.onclick assignment');
                                                return;
                                            }
                                        }
                                        currentHandler = handler;
                                    },
                                    configurable: true
                                });
                            } catch(e) {}
                        };
                        
                        nullifyOnclick(document, 'document');
                        if (document.body) nullifyOnclick(document.body, 'body');
                        
                        // log('[PopupBlocker] Enhanced content script active');
                    })()
                `).catch(() => { });

                // Update navigation state
                updateTab(id, {
                    canGoBack: webview.canGoBack(),
                    canGoForward: webview.canGoForward()
                });
            };
            const onPageTitleUpdated = (e: any) => {
                updateTab(id, { title: e.title });
            };
            const onDidNavigate = (e: any) => {
                // Update URL in store but don't trigger reload
                // Clear any previous error on successful navigation
                lastLoadedUrlRef.current = e.url;
                updateTab(id, {
                    url: e.url,
                    isSecure: e.url.startsWith('https'),
                    canGoBack: webview.canGoBack(),
                    canGoForward: webview.canGoForward(),
                    errorInfo: undefined,
                });
                // Record history entry (skip internal URLs)
                if (e.url && !e.url.startsWith('about:') && !e.url.startsWith('chrome:') && !e.url.startsWith('workspace:')) {
                    const title = webview.getTitle?.() || e.url;
                    const tab = useTabStore.getState().tabs.find(t => t.id === id);
                    if (tab) {
                        useHistoryStore.getState().addEntry({
                            url: e.url,
                            title,
                            favicon: tab.favicon,
                            timestamp: Date.now(),
                            workspaceId: tab.workspaceId || workspaceId,
                        });
                    }
                }
            };
            const onDidNavigateInPage = (e: any) => {
                // SPA navigation - update URL but never reload
                lastLoadedUrlRef.current = e.url;
                updateTab(id, {
                    url: e.url,
                    isSecure: e.url.startsWith('https'),
                    canGoBack: webview.canGoBack(),
                    canGoForward: webview.canGoForward()
                });
            };
            const onPageFaviconUpdated = (e: any) => {
                const favicons = e.favicons;
                if (favicons && favicons.length > 0) {
                    updateTab(id, { favicon: favicons[0] });
                }
            };

            const handleContextMenu = (e: any) => {
                e.preventDefault();
                if ((window as any).electronAPI?.webview?.showContextMenu) {
                    (window as any).electronAPI.webview.showContextMenu({
                        id,
                        x: Math.round(e.params.x),
                        y: Math.round(e.params.y),
                        linkURL: e.params.linkURL,
                        srcURL: e.params.srcURL,
                        mediaType: e.params.mediaType,
                        selectionText: e.params.selectionText,
                        isEditable: e.params.isEditable
                    });
                }
            };

            webview.addEventListener('did-start-loading', onDidStartLoading);
            webview.addEventListener('did-stop-loading', onDidStopLoading);
            webview.addEventListener('did-fail-load', onDidFailLoad);
            webview.addEventListener('dom-ready', onDomReady);
            webview.addEventListener('page-title-updated', onPageTitleUpdated);
            webview.addEventListener('did-navigate', onDidNavigate);
            webview.addEventListener('did-navigate-in-page', onDidNavigateInPage);
            webview.addEventListener('page-favicon-updated', onPageFaviconUpdated);
            webview.addEventListener('context-menu', handleContextMenu);

            // CDP Log Capture: Push console messages to native log buffer
            const onConsoleMessage = async (e: any) => {
                // e.level: 0=verbose, 1=info, 2=warning, 3=error
                // Map to our log types: CONSOLE=0, NETWORK=1, ERROR=2, WARNING=3, INFO=4
                let logType = 0; // CONSOLE
                if (e.level === 3) logType = 2; // ERROR
                else if (e.level === 2) logType = 3; // WARNING
                else if (e.level === 1) logType = 4; // INFO

                try {
                    const payload = `[${id}] ${e.message}`;
                    await (window as any).electronAPI?.logBuffer?.push(Date.now(), logType, payload);
                } catch {
                    // Silently ignore if logBuffer not available
                }
            };
            webview.addEventListener('console-message', onConsoleMessage);

            // Register context menu IPC handlers
            const unsubOpenLink = (window as any).electronAPI?.webview?.onOpenLinkNewTab?.((url: string) => {
                addTab(url);
            });
            const unsubBack = (window as any).electronAPI?.webview?.onActionBack?.((targetTabId: string) => {
                if (targetTabId === id && webview.canGoBack()) {
                    webview.goBack();
                }
            });
            const unsubForward = (window as any).electronAPI?.webview?.onActionForward?.((targetTabId: string) => {
                if (targetTabId === id && webview.canGoForward()) {
                    webview.goForward();
                }
            });
            const unsubReload = (window as any).electronAPI?.webview?.onActionReload?.((targetTabId: string) => {
                if (targetTabId === id) {
                    webview.reload();
                }
            });
            const unsubInspect = (window as any).electronAPI?.webview?.onActionInspect?.((info: any) => {
                if (info.id === id) {
                    try {
                        webview.inspectElement(info.x, info.y);
                    } catch (err) {}
                }
            });

            // Register webview for agent control
            registerWebview(id, webview);

            return () => {
                // Stop any active media before destroying (video/audio GC)
                try {
                    webview.executeJavaScript(
                        `document.querySelectorAll('video,audio').forEach(m => { try { m.pause(); m.src = ''; } catch(e){} });`
                    ).catch(() => {});
                } catch (e) { }

                // Notify main process to destroy this webContents and free memory
                const wcId = tabWebContentsIdMap.get(id);
                if (wcId) {
                    try {
                        (window as any).electronAPI?.tabs?.destroyWebContents?.(wcId);
                    } catch (e) { }
                    tabWebContentsIdMap.delete(id);
                }

                // Unregister webview
                unregisterWebview(id);

                window.removeEventListener('webview-go-back', handleGoBack);
                window.removeEventListener('webview-go-forward', handleGoForward);
                window.removeEventListener('webview-reload', handleReload);
                window.removeEventListener('webview-stop', handleStop);

                webview.removeEventListener('new-window', handleNewWindow);
                webview.removeEventListener('did-start-loading', onDidStartLoading);
                webview.removeEventListener('did-stop-loading', onDidStopLoading);
                webview.removeEventListener('did-fail-load', onDidFailLoad);
                webview.removeEventListener('dom-ready', onDomReady);
                webview.removeEventListener('page-title-updated', onPageTitleUpdated);
                webview.removeEventListener('did-navigate', onDidNavigate);
                webview.removeEventListener('did-navigate-in-page', onDidNavigateInPage);
                webview.removeEventListener('page-favicon-updated', onPageFaviconUpdated);
                webview.removeEventListener('console-message', onConsoleMessage);
                webview.removeEventListener('context-menu', handleContextMenu);

                unsubOpenLink?.();
                unsubBack?.();
                unsubForward?.();
                unsubReload?.();
                unsubInspect?.();
            };
        }
    }, [id]);

    return (
        <webview
            ref={webviewRef}
            src={initialUrl}
            className="w-full h-full"
            style={{ display: 'inline-flex', width: '100%', height: '100%' }}
            webpreferences="nodeIntegration=no, contextIsolation=yes"
            partition="persist:default"
        />
    );
});

export default WebViewContainer;

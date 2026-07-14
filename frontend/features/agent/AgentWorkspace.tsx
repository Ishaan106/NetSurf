import React, { useEffect, useRef } from 'react';
import { Globe, Loader2, Plus, Layout } from 'lucide-react';
import { useAgentWorkspaceStore } from '@/store';
import type { AgentWebview } from '@/store';
import { useTheme } from '@/theme';

/**
 * Sync agent webviews to main process WebViewTabManager.
 * Reads DIRECTLY from the store to avoid stale closures.
 */
function syncAgentWebviewsToMain() {
    const api = (window as any).electronAPI;
    if (!api?.tabs?.syncAgentWebviews) return;

    const { webviews, focusedId } = useAgentWorkspaceStore.getState();

    const infos = webviews
        .filter(w => w.webContentsId > 0)
        .map(w => ({
            id: w.id,
            webContentsId: w.webContentsId,
            url: w.url,
            title: w.title,
        }));

    const focused = focusedId || (webviews[0]?.id ?? null);
    api.tabs.syncAgentWebviews(infos, focused).catch(() => {});
}

/**
 * AgentWorkspace — Fellou-style multi-webview grid
 * Rendered inside WebViewContainer as the content of the "workspace" tab.
 */
export function AgentWorkspace() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const webviews = useAgentWorkspaceStore(s => s.webviews);
    const focusedId = useAgentWorkspaceStore(s => s.focusedId);
    const addWebview = useAgentWorkspaceStore(s => s.addWebview);
    const removeWebview = useAgentWorkspaceStore(s => s.removeWebview);
    const setFocused = useAgentWorkspaceStore(s => s.setFocused);
    const updateWebview = useAgentWorkspaceStore(s => s.updateWebview);

    // Sync to main process whenever webviews or focus changes
    useEffect(() => {
        syncAgentWebviewsToMain();
    }, [webviews, focusedId]);

    // Listen for backend requesting new webview
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.tabs?.onAgentAddWebview) return;
        const unsub = api.tabs.onAgentAddWebview((label: string, url: string) => {
            const store = useAgentWorkspaceStore.getState();
            store.addWebview(label, url);
        });
        return () => unsub?.();
    }, []);

    // Listen for backend requesting focus change
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.tabs?.onAgentFocusWebview) return;
        const unsub = api.tabs.onAgentFocusWebview((webviewId: string) => {
            setFocused(webviewId);
        });
        return () => unsub?.();
    }, [setFocused]);

    // Listen for backend requesting workspace open
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.tabs?.onOpenWorkspace) return;
        const unsub = api.tabs.onOpenWorkspace(() => {
            const store = useAgentWorkspaceStore.getState();
            if (!store.isOpen) store.openWorkspace();
        });
        return () => unsub?.();
    }, []);

    const count = webviews.length;
    const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;

    const rootStyle = {
        '--aw-bg': isDark
            ? 'linear-gradient(150deg, rgba(9,12,20,0.92) 0%, rgba(16,20,34,0.98) 100%)'
            : 'linear-gradient(150deg, rgba(245,247,252,0.98) 0%, rgba(234,238,248,0.98) 100%)',
        '--aw-surface': isDark ? 'rgba(24,28,40,0.74)' : 'rgba(255,255,255,0.76)',
        '--aw-surface-strong': isDark ? 'rgba(32,36,50,0.92)' : 'rgba(255,255,255,0.95)',
        '--aw-border': isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,18,32,0.08)',
        '--aw-border-strong': isDark ? 'rgba(133,125,255,0.5)' : 'rgba(75,80,230,0.42)',
        '--aw-text': isDark ? '#edf1ff' : '#1a1b2e',
        '--aw-muted': isDark ? 'rgba(237,241,255,0.6)' : 'rgba(26,27,46,0.55)',
        '--aw-accent': 'var(--chrome-accent)',
        '--aw-url-bg': isDark ? 'rgba(255,255,255,0.06)' : 'rgba(16,18,28,0.04)',
        '--aw-url-border': isDark ? 'rgba(255,255,255,0.08)' : 'rgba(16,18,28,0.08)',
        '--aw-chip': isDark ? 'rgba(124,115,255,0.12)' : 'rgba(75,80,230,0.08)',
        '--aw-cols': String(cols),
    } as React.CSSProperties;

    return (
        <div className="agent-workspace" style={rootStyle}>
            {/* Workspace toolbar */}
            <div className="agent-workspace-toolbar">
                <Layout className="agent-workspace-icon" />
                <span className="agent-workspace-title">
                    Shadow Workspace
                </span>
                <span className="agent-workspace-count">
                    {count} {count === 1 ? 'view' : 'views'}
                </span>

                <div className="agent-workspace-actions">
                    <button
                        onClick={() => addWebview()}
                        title="Add view"
                        className="agent-workspace-add"
                    >
                        <Plus className="agent-workspace-add-icon" />
                        Add
                    </button>
                </div>
            </div>

            {/* Webview grid */}
            <div className="agent-workspace-grid">
                {webviews.map(wv => (
                    <AgentWebviewCell
                        key={wv.id}
                        webview={wv}
                        isFocused={wv.id === focusedId}
                        onFocus={() => setFocused(wv.id)}
                        onClose={() => removeWebview(wv.id)}
                        onUpdate={(updates) => updateWebview(wv.id, updates)}
                    />
                ))}
            </div>
        </div>
    );
}

interface AgentWebviewCellProps {
    webview: AgentWebview;
    isFocused: boolean;
    onFocus: () => void;
    onClose: () => void;
    onUpdate: (updates: Partial<AgentWebview>) => void;
}

const AgentWebviewCell = React.memo(({
    webview, isFocused, onFocus, onClose, onUpdate,
}: AgentWebviewCellProps) => {
    const webviewRef = useRef<any>(null);

    useEffect(() => {
        const wv = webviewRef.current;
        if (!wv) return;

        const syncNavState = () => {
            try {
                onUpdate({
                    canGoBack: Boolean(wv.canGoBack?.()),
                    canGoForward: Boolean(wv.canGoForward?.()),
                });
            } catch {}
        };

        const onDomReady = () => {
            try {
                const wcId = wv.getWebContentsId();
                if (wcId) {
                    useAgentWorkspaceStore.getState().updateWebview(webview.id, { webContentsId: wcId });
                    setTimeout(syncAgentWebviewsToMain, 20);
                }
            } catch {}
            try {
                const title = wv.getTitle();
                if (title) onUpdate({ title });
            } catch {}

            syncNavState();
        };

        const onDidStartLoading = () => onUpdate({ isLoading: true });
        const onDidStopLoading = () => {
            onUpdate({ isLoading: false });
            syncNavState();
        };
        const onDidNavigate = (e: any) => {
            onUpdate({ url: e.url });
            setTimeout(syncAgentWebviewsToMain, 20);
            syncNavState();
        };
        const onDidNavigateInPage = (e: any) => {
            if (e?.url) onUpdate({ url: e.url });
            setTimeout(syncAgentWebviewsToMain, 20);
            syncNavState();
        };
        const onPageTitleUpdated = (e: any) => onUpdate({ title: e.title });
        const onPageFaviconUpdated = (e: any) => {
            if (e.favicons?.[0]) onUpdate({ favicon: e.favicons[0] });
        };

        wv.addEventListener('dom-ready', onDomReady);
        wv.addEventListener('did-start-loading', onDidStartLoading);
        wv.addEventListener('did-stop-loading', onDidStopLoading);
        wv.addEventListener('did-navigate', onDidNavigate);
        wv.addEventListener('did-navigate-in-page', onDidNavigateInPage);
        wv.addEventListener('page-title-updated', onPageTitleUpdated);
        wv.addEventListener('page-favicon-updated', onPageFaviconUpdated);

        const onGoBack = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.webviewId !== webview.id) return;
            try {
                if (wv.canGoBack()) wv.goBack();
            } catch {}
        };
        const onGoForward = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.webviewId !== webview.id) return;
            try {
                if (wv.canGoForward()) wv.goForward();
            } catch {}
        };
        const onReload = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.webviewId !== webview.id) return;
            try {
                wv.reload();
            } catch {}
        };
        const onStop = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.webviewId !== webview.id) return;
            try {
                wv.stop();
            } catch {}
        };
        const onHome = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.webviewId !== webview.id) return;
            try {
                wv.loadURL('about:blank');
                onUpdate({ url: 'about:blank', title: 'New Tab' });
            } catch {}
        };

        window.addEventListener('agent-webview-go-back', onGoBack);
        window.addEventListener('agent-webview-go-forward', onGoForward);
        window.addEventListener('agent-webview-reload', onReload);
        window.addEventListener('agent-webview-stop', onStop);
        window.addEventListener('agent-webview-home', onHome);

        return () => {
            wv.removeEventListener('dom-ready', onDomReady);
            wv.removeEventListener('did-start-loading', onDidStartLoading);
            wv.removeEventListener('did-stop-loading', onDidStopLoading);
            wv.removeEventListener('did-navigate', onDidNavigate);
            wv.removeEventListener('did-navigate-in-page', onDidNavigateInPage);
            wv.removeEventListener('page-title-updated', onPageTitleUpdated);
            wv.removeEventListener('page-favicon-updated', onPageFaviconUpdated);

            window.removeEventListener('agent-webview-go-back', onGoBack);
            window.removeEventListener('agent-webview-go-forward', onGoForward);
            window.removeEventListener('agent-webview-reload', onReload);
            window.removeEventListener('agent-webview-stop', onStop);
            window.removeEventListener('agent-webview-home', onHome);
        };
    }, [webview.id]);

    return (
        <div
            onClick={onFocus}
            className={isFocused ? 'aw-cell is-focused' : 'aw-cell'}
        >
            {/* Browser-like title bar */}
            <div className="aw-cell-header">
                {/* Traffic light dots */}
                <div className="aw-traffic">
                    <button
                        type="button"
                        className="aw-traffic-dot close"
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        aria-label="Close view"
                    />
                    <span className="aw-traffic-dot warn" />
                    <span className="aw-traffic-dot ok" />
                </div>

                {/* URL bar */}
                <div className="aw-url">
                    {webview.favicon ? (
                        <img src={webview.favicon} className="aw-url-favicon"
                             onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                        <Globe className="aw-url-icon" />
                    )}
                    <span className="aw-url-text">
                        {webview.url === 'about:blank' ? webview.label : webview.url}
                    </span>
                </div>

                {/* Loading indicator */}
                {webview.isLoading && (
                    <Loader2 className="aw-loading" />
                )}
            </div>

            {/* Label bar */}
            <div className="aw-label-bar">
                <div className="aw-label-dot" />
                <span className="aw-label-title">
                    {webview.label}
                </span>
                {webview.title && webview.title !== webview.label && webview.title !== 'New Tab' && (
                    <span className="aw-label-meta">
                        {webview.title}
                    </span>
                )}
            </div>

            {/* Webview */}
            <div className="aw-webview">
                <webview
                    ref={webviewRef}
                    src="about:blank"
                    style={{ width: '100%', height: '100%', display: 'inline-flex' } as any}
                    webpreferences="nodeIntegration=no, contextIsolation=yes"
                    partition="persist:default"
                />
            </div>
        </div>
    );
});

export default AgentWorkspace;

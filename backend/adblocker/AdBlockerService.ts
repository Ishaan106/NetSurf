/**
 * Ad Blocker Service
 * Main ad blocking engine using @ghostery/adblocker-electron
 * Supports per-domain blocked count tracking
 */

import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import { session, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { AdBlockState, AdBlockStats } from './types';
import {
    loadAdBlockState,
    saveAdBlockState,
    incrementBlockedCount,
} from './AdBlockerStore';

// Debug logging - disabled for performance
const DEBUG = false;
const log = (...args: any[]) => { if (DEBUG) log(...args); };

// Cache file for filter lists
const CACHE_FILENAME = 'adblocker-engine.bin';

// Webview partition name - must match the partition used in WebViewContainer.tsx
const WEBVIEW_PARTITION = 'persist:default';

// Per-domain blocked counts for current session
const domainBlockedCounts: Record<string, number> = {};
let sessionBlockedCount = 0;

// Track sessions we've enabled blocking on (avoid duplicates)
const blockedSessions = new Set<string>();

// The blocker engine instance
let blocker: ElectronBlocker | null = null;
let isInitialized = false;
let listenerSetup = false;

/**
 * Get cache file path
 */
function getCachePath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, CACHE_FILENAME);
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    } catch {
        return 'unknown';
    }
}

/**
 * Track a blocked request for a specific domain
 */
function trackBlockedRequest(url: string): void {
    sessionBlockedCount++;
    const domain = extractDomain(url);
    domainBlockedCounts[domain] = (domainBlockedCounts[domain] || 0) + 1;

    // Also increment in persistent storage
    incrementBlockedCount(domain);
}

/**
 * Setup the blocked request event listener (call only once per blocker instance)
 */
function setupRequestBlockedListener(): void {
    if (!blocker || listenerSetup) return;

    blocker.on('request-blocked', (request) => {
        trackBlockedRequest(request.url);
        // Only log occasionally to reduce console spam
        if (sessionBlockedCount % 10 === 1) {
            log(`[AdBlocker] Blocked ${sessionBlockedCount} requests (latest: ${request.url.substring(0, 50)}...)`);
        }
    });

    listenerSetup = true;
    log('[AdBlocker] Request tracking listener setup complete');
}

/**
 * Initialize the ad blocker engine
 */
export async function initializeAdBlocker(): Promise<void> {
    if (isInitialized) {
        log('[AdBlocker] Already initialized');
        return;
    }

    log('[AdBlocker] Initializing...');
    const state = loadAdBlockState();

    if (!state.enabled) {
        log('[AdBlocker] Disabled, skipping initialization');
        isInitialized = true;
        return;
    }

    try {
        const cachePath = getCachePath();

        // Try to load from cache first
        if (fs.existsSync(cachePath)) {
            log('[AdBlocker] Loading from cache...');
            try {
                const cacheData = fs.readFileSync(cachePath);
                blocker = ElectronBlocker.deserialize(cacheData);
                log('[AdBlocker] Loaded from cache successfully');
            } catch (cacheError) {
                log('[AdBlocker] Cache invalid, fetching fresh filters...');
                fs.unlinkSync(cachePath);
                blocker = null;
            }
        }

        // If no blocker yet, fetch prebuilt filters (proven working)
        if (!blocker) {
            log('[AdBlocker] Fetching prebuilt filters...');
            blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);

            // Cache for next time
            log('[AdBlocker] Caching engine...');
            const serialized = blocker.serialize();
            fs.writeFileSync(cachePath, Buffer.from(serialized));
            log('[AdBlocker] Engine cached successfully');

            // Update last update timestamp
            saveAdBlockState({ ...state, lastUpdate: Date.now() });
        }

        // Setup event listener once
        setupRequestBlockedListener();

        // Enable blocking on webview session only
        // Note: Library can only enable on ONE session due to shared IPC handlers
        if (blocker) {
            enableBlockingOnSession(WEBVIEW_PARTITION);
            // Don't enable on defaultSession - causes IPC handler conflict
        }

        isInitialized = true;
        log('[AdBlocker] Initialization complete - blocking active on all sessions');
    } catch (error) {
        console.error('[AdBlocker] Failed to initialize:', error);
        isInitialized = true;
    }
}

/**
 * Enable blocking on a specific session partition
 * Uses the library's standard method which includes cosmetic filters
 */
export function enableBlockingOnSession(partition: string): void {
    if (!blocker) return;

    // Check if already enabled on this session
    if (blockedSessions.has(partition)) {
        return;
    }

    const targetSession = partition
        ? session.fromPartition(partition)
        : session.defaultSession;

    log(`[AdBlocker] Enabling blocking on session: ${partition || 'default'}`);

    // Use the library's standard method - it works correctly
    blocker.enableBlockingInSession(targetSession);
    blockedSessions.add(partition);

    log(`[AdBlocker] Blocking enabled on session: ${partition || 'default'}`);
}

/**
 * Disable blocking on a session
 */
export function disableBlockingOnSession(partition: string): void {
    if (!blocker) return;

    const targetSession = partition
        ? session.fromPartition(partition)
        : session.defaultSession;

    blocker.disableBlockingInSession(targetSession);
    blockedSessions.delete(partition);
    log(`[AdBlocker] Blocking disabled on session: ${partition || 'default'}`);
}

/**
 * Disable blocking on all sessions
 */
export function disableBlocking(): void {
    Array.from(blockedSessions).forEach(partition => {
        disableBlockingOnSession(partition);
    });
    log('[AdBlocker] All blocking disabled');
}

/**
 * Toggle ad blocking on/off
 */
export function setAdBlockerEnabled(enabled: boolean): void {
    const state = loadAdBlockState();
    saveAdBlockState({ ...state, enabled });

    if (enabled && blocker) {
        enableBlockingOnSession(WEBVIEW_PARTITION);
    } else if (!enabled) {
        disableBlocking();
    }
}

/**
 * Get current ad blocker state
 */
export function getAdBlockerState(): AdBlockState {
    return loadAdBlockState();
}

/**
 * Get stats for current session including per-domain counts
 */
export function getAdBlockerStats(): AdBlockStats {
    const state = loadAdBlockState();

    return {
        sessionBlocked: sessionBlockedCount,
        totalBlocked: state.totalBlockedCount + sessionBlockedCount,
        currentPageBlocked: sessionBlockedCount,
        currentDomain: '',
        blockedByDomain: { ...domainBlockedCounts },
    };
}

/**
 * Get per-domain blocked counts for current session
 */
export function getDomainBlockedCounts(): Record<string, number> {
    return { ...domainBlockedCounts };
}

/**
 * Get all-time per-domain blocked counts (from persistent storage)
 */
export function getAllTimeDomainCounts(): Record<string, number> {
    const state = loadAdBlockState();
    return { ...state.blockedByDomain };
}

/**
 * Refresh filter lists (force update)
 */
export async function refreshFilters(): Promise<void> {
    log('[AdBlocker] Refreshing filters...');

    try {
        // Delete cache to force re-download
        const cachePath = getCachePath();
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
        }

        // Disable current blocker
        disableBlocking();
        blocker = null;
        blockedSessions.clear();
        listenerSetup = false;

        // Reset session counts
        sessionBlockedCount = 0;
        Object.keys(domainBlockedCounts).forEach(key => delete domainBlockedCounts[key]);

        // Re-initialize
        isInitialized = false;
        await initializeAdBlocker();

        log('[AdBlocker] Filters refreshed successfully');
    } catch (error) {
        console.error('[AdBlocker] Failed to refresh filters:', error);
    }
}

/**
 * Reset blocked count for session
 */
export function resetTabBlockedCount(): void {
    sessionBlockedCount = 0;
    Object.keys(domainBlockedCounts).forEach(key => delete domainBlockedCounts[key]);
}

/**
 * Get blocker instance for external use
 */
export function getBlockerInstance(): ElectronBlocker | null {
    return blocker;
}

/**
 * Check if ad blocker is ready
 */
export function isAdBlockerReady(): boolean {
    return isInitialized && blocker !== null;
}

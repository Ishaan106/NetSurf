/**
 * Ad Blocker Types
 * Type definitions for the ad blocking system
 */

export interface AdBlockState {
    /** Whether ad blocking is globally enabled */
    enabled: boolean;
    /** Domains where ad blocking is disabled (whitelist) */
    whitelistedDomains: string[];
    /** Custom filter rules added by user */
    customRules: string[];
    /** Timestamp of last filter list update */
    lastUpdate: number;
    /** Total count of blocked requests since install */
    totalBlockedCount: number;
    /** Blocked count per domain (top sites) */
    blockedByDomain: Record<string, number>;
}

export interface AdBlockStats {
    /** Total blocked requests in current session */
    sessionBlocked: number;
    /** Total blocked requests all time */
    totalBlocked: number;
    /** Blocked count for current page/domain */
    currentPageBlocked: number;
    /** Current page domain */
    currentDomain: string;
    /** Per-domain blocked counts for current session */
    blockedByDomain?: Record<string, number>;
}

export interface FilterList {
    /** Unique identifier */
    id: string;
    /** Display name */
    name: string;
    /** URL to fetch filter list */
    url: string;
    /** Whether this list is enabled */
    enabled: boolean;
    /** Description of what this list blocks */
    description: string;
}

export interface BlockedRequest {
    /** URL that was blocked */
    url: string;
    /** Type of resource (script, image, etc.) */
    type: string;
    /** Domain of the page that made the request */
    pageDomain: string;
    /** Timestamp when blocked */
    timestamp: number;
}

export interface AdBlockConfig {
    /** Enable debug logging */
    debug: boolean;
    /** Enable cosmetic filtering (hide elements) */
    enableCosmeticFiltering: boolean;
    /** Enable network request blocking */
    enableNetworkFiltering: boolean;
    /** Interval for filter updates (ms) */
    updateInterval: number;
}

export const DEFAULT_ADBLOCK_STATE: AdBlockState = {
    enabled: true,
    whitelistedDomains: [],
    customRules: [],
    lastUpdate: 0,
    totalBlockedCount: 0,
    blockedByDomain: {},
};

export const DEFAULT_ADBLOCK_CONFIG: AdBlockConfig = {
    debug: false,
    enableCosmeticFiltering: true,
    enableNetworkFiltering: true,
    updateInterval: 24 * 60 * 60 * 1000, // 24 hours
};

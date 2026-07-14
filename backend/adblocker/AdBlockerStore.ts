/**
 * Ad Blocker Store
 * Persistent storage for ad blocker settings and stats
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AdBlockState, DEFAULT_ADBLOCK_STATE } from './types';

const STORE_FILENAME = 'adblocker-settings.json';

/**
 * Get the path to the settings file
 */
function getStorePath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, STORE_FILENAME);
}

/**
 * Load ad blocker state from disk
 */
export function loadAdBlockState(): AdBlockState {
    try {
        const storePath = getStorePath();
        if (fs.existsSync(storePath)) {
            const data = fs.readFileSync(storePath, 'utf-8');
            const parsed = JSON.parse(data);
            // Merge with defaults to ensure all fields exist
            return { ...DEFAULT_ADBLOCK_STATE, ...parsed };
        }
    } catch (error) {
        console.error('[AdBlockStore] Error loading state:', error);
    }
    return { ...DEFAULT_ADBLOCK_STATE };
}

/**
 * Save ad blocker state to disk
 */
export function saveAdBlockState(state: AdBlockState): void {
    try {
        const storePath = getStorePath();
        fs.writeFileSync(storePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
        console.error('[AdBlockStore] Error saving state:', error);
    }
}

/**
 * Update specific fields in state
 */
export function updateAdBlockState(updates: Partial<AdBlockState>): AdBlockState {
    const currentState = loadAdBlockState();
    const newState = { ...currentState, ...updates };
    saveAdBlockState(newState);
    return newState;
}

/**
 * Add domain to whitelist
 */
export function addToWhitelist(domain: string): AdBlockState {
    const state = loadAdBlockState();
    if (!state.whitelistedDomains.includes(domain)) {
        state.whitelistedDomains.push(domain);
        saveAdBlockState(state);
    }
    return state;
}

/**
 * Remove domain from whitelist
 */
export function removeFromWhitelist(domain: string): AdBlockState {
    const state = loadAdBlockState();
    state.whitelistedDomains = state.whitelistedDomains.filter(d => d !== domain);
    saveAdBlockState(state);
    return state;
}

/**
 * Check if domain is whitelisted
 */
export function isDomainWhitelisted(domain: string): boolean {
    const state = loadAdBlockState();
    return state.whitelistedDomains.some(whitelisted => {
        // Match exact domain or subdomains
        return domain === whitelisted || domain.endsWith('.' + whitelisted);
    });
}

/**
 * Increment blocked count for a domain
 */
export function incrementBlockedCount(domain: string): void {
    const state = loadAdBlockState();
    state.totalBlockedCount++;
    state.blockedByDomain[domain] = (state.blockedByDomain[domain] || 0) + 1;

    // Only save periodically to avoid too many writes (every 10 blocks)
    if (state.totalBlockedCount % 10 === 0) {
        saveAdBlockState(state);
    }
}

/**
 * Add custom filter rule
 */
export function addCustomRule(rule: string): AdBlockState {
    const state = loadAdBlockState();
    if (!state.customRules.includes(rule)) {
        state.customRules.push(rule);
        saveAdBlockState(state);
    }
    return state;
}

/**
 * Remove custom filter rule
 */
export function removeCustomRule(rule: string): AdBlockState {
    const state = loadAdBlockState();
    state.customRules = state.customRules.filter(r => r !== rule);
    saveAdBlockState(state);
    return state;
}

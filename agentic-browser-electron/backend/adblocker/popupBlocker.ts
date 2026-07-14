/**
 * Popup Blocker Module
 * Comprehensive popup and redirect protection
 */

// Extended list of known ad/popup domains
export const BLOCKED_DOMAINS = [
    // Major ad networks
    'doubleclick.net',
    'googleadservices.com',
    'googlesyndication.com',
    'adservice.google.com',
    'pagead2.googlesyndication.com',
    'facebook.com/tr',
    'connect.facebook.net',

    // Popup ad networks
    'popads.net',
    'popcash.net',
    'propellerads.com',
    'adsterra.com',
    'trafficjunky.com',
    'exoclick.com',
    'juicyads.com',
    'hilltopads.com',
    'clickadu.com',
    'a-ads.com',
    'ad-maven.com',
    'adcash.com',
    'admaven.com',
    'bidvertiser.com',
    'clickadilla.com',
    'evadav.com',
    'galaksion.com',
    'mondiad.com',
    'richads.com',
    'rollerads.com',
    'trafficforce.com',
    'trafficstars.com',
    'zeropark.com',

    // Native/content ad networks
    'mgid.com',
    'revcontent.com',
    'taboola.com',
    'outbrain.com',
    'content.ad',
    'contentabc.com',
    'nativeads.com',

    // Crypto/scam domains
    'imbx.io',
    'crypto-airdrop',
    'free-crypto',
    'airdrop',
    'claim-token',

    // Malware/phishing patterns
    'phishing.warning',
    'malware.download',

    // Aggressive ad domains
    'notify.click',
    'push.notify',
    'allow.notification',
    'subscribe.push',

    // Tracking
    'tracking.click',
    'track.click',
    'analytics.track',
];

// Suspicious URL patterns to block
export const BLOCKED_PATTERNS = [
    /\/popup\//i,
    /\/popunder\//i,
    /\/redirect[\/\?]/i,
    /\/track[\/\?]/i,
    /\/click[\/\?]/i,
    /\/ad[\/\?]/i,
    /\/adserver/i,
    /\/adserv/i,
    /\/openx/i,
    /\/affiliate[\/\?]/i,
    /\?aff_id=/i,
    /\?affiliate=/i,
    /\?ref=/i,
    /\?redirect=/i,
    /\?out=/i,
    /\?go=/i,
    /\?visit=/i,
];

// Suspicious keywords in URLs
export const BLOCKED_KEYWORDS = [
    'casino',
    'betting',
    'gambling',
    'lottery',
    'forex',
    'binary',
    'crypto-casino',
    'adult',
    'xxx',
    'porn',
    'nsfw',
    'drug',
    'pharma',
    'diet-pill',
    'weight-loss',
];

// Popup tracking state
interface PopupState {
    blockedCount: number;
    blockedToday: number;
    lastBlocked: { url: string; domain: string; timestamp: number } | null;
    blockedDomains: Record<string, number>;
    strictMode: boolean;
}

const state: PopupState = {
    blockedCount: 0,
    blockedToday: 0,
    lastBlocked: null,
    blockedDomains: {},
    strictMode: true, // Default to strict mode
};

/**
 * Check if URL should be blocked
 */
export function shouldBlockUrl(url: string): { blocked: boolean; reason: string } {
    try {
        const urlLower = url.toLowerCase();
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        const fullPath = parsed.pathname + parsed.search;

        // Check blocked domains
        for (const domain of BLOCKED_DOMAINS) {
            if (hostname.includes(domain) || urlLower.includes(domain)) {
                return { blocked: true, reason: `Blocked domain: ${domain}` };
            }
        }

        // Check blocked patterns
        for (const pattern of BLOCKED_PATTERNS) {
            if (pattern.test(fullPath)) {
                return { blocked: true, reason: `Blocked pattern: ${pattern.source}` };
            }
        }

        // Check blocked keywords
        for (const keyword of BLOCKED_KEYWORDS) {
            if (urlLower.includes(keyword)) {
                return { blocked: true, reason: `Blocked keyword: ${keyword}` };
            }
        }

        return { blocked: false, reason: '' };
    } catch {
        // If URL parsing fails, it's suspicious
        return { blocked: true, reason: 'Invalid/suspicious URL' };
    }
}

/**
 * Check if popup should be blocked based on source and target domains
 */
export function shouldBlockPopup(
    sourceUrl: string,
    targetUrl: string,
    disposition: string
): { blocked: boolean; reason: string } {
    // First check if target URL itself is blocked
    const urlCheck = shouldBlockUrl(targetUrl);
    if (urlCheck.blocked) {
        return urlCheck;
    }

    // In strict mode, block all cross-domain popups
    if (state.strictMode && disposition === 'new-window') {
        try {
            const sourceHostname = new URL(sourceUrl).hostname.replace('www.', '');
            const targetHostname = new URL(targetUrl).hostname.replace('www.', '');

            // Allow same domain or subdomain
            if (!targetHostname.includes(sourceHostname) && !sourceHostname.includes(targetHostname)) {
                return { blocked: true, reason: 'Cross-domain popup blocked (strict mode)' };
            }
        } catch {
            return { blocked: true, reason: 'Invalid URL in popup' };
        }
    }

    return { blocked: false, reason: '' };
}

/**
 * Track a blocked popup
 */
export function trackBlockedPopup(url: string): void {
    state.blockedCount++;
    state.blockedToday++;

    try {
        const hostname = new URL(url).hostname;
        state.blockedDomains[hostname] = (state.blockedDomains[hostname] || 0) + 1;
        state.lastBlocked = {
            url,
            domain: hostname,
            timestamp: Date.now(),
        };
    } catch {
        state.lastBlocked = {
            url: url.substring(0, 100),
            domain: 'unknown',
            timestamp: Date.now(),
        };
    }
}

/**
 * Get popup blocker stats
 */
export function getPopupStats() {
    return {
        blockedCount: state.blockedCount,
        blockedToday: state.blockedToday,
        lastBlocked: state.lastBlocked,
        blockedDomains: { ...state.blockedDomains },
        strictMode: state.strictMode,
    };
}

/**
 * Set strict mode
 */
export function setStrictMode(enabled: boolean): void {
    state.strictMode = enabled;
}

/**
 * Check if strict mode is enabled
 */
export function isStrictMode(): boolean {
    return state.strictMode;
}

/**
 * Reset daily counter (call at midnight)
 */
export function resetDailyCounter(): void {
    state.blockedToday = 0;
}

/**
 * Get content script to inject for window.open protection
 */
export function getPopupBlockerScript(): string {
    return `
        (function() {
            // Store original window.open
            const originalOpen = window.open;
            let openAttempts = 0;
            const maxAttempts = 3;
            const resetInterval = 5000; // 5 seconds
            
            // Override window.open
            window.open = function(url, name, features) {
                openAttempts++;
                
                // Block rapid fire window.open calls
                if (openAttempts > maxAttempts) {
                    // log('[PopupBlocker] Blocked excessive window.open attempts');
                    return null;
                }
                
                // Reset counter after interval
                setTimeout(() => { openAttempts--; }, resetInterval);
                
                // Block suspicious URLs
                if (url) {
                    const urlLower = url.toLowerCase();
                    const blockedPatterns = ['popup', 'ad', 'track', 'redirect', 'casino', 'betting', 'crypto'];
                    for (const pattern of blockedPatterns) {
                        if (urlLower.includes(pattern)) {
                            // log('[PopupBlocker] Blocked suspicious window.open:', url);
                            return null;
                        }
                    }
                }
                
                // Allow the popup (will be caught by new-window handler)
                return originalOpen.call(window, url, name, features);
            };
            
            // Neutralize aggressive click handlers
            const originalAddEventListener = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function(type, listener, options) {
                // Block if it's a click listener on document/body that might be for click hijacking
                if (type === 'click' && (this === document || this === document.body)) {
                    const listenerStr = listener.toString();
                    if (listenerStr.includes('window.open') || listenerStr.includes('location.href')) {
                        // log('[PopupBlocker] Blocked suspicious click handler');
                        return;
                    }
                }
                return originalAddEventListener.call(this, type, listener, options);
            };
            
            // log('[PopupBlocker] Content script injected');
        })();
    `;
}

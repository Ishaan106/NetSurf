import clsx, { ClassValue } from 'clsx';

/**
 * Utility for merging class names with clsx
 */
export function cn(...inputs: ClassValue[]) {
    return clsx(inputs);
}

/**
 * Generate a unique ID
 */
export function generateId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Format URL for display (remove protocol, trailing slash)
 */
export function formatUrlForDisplay(url: string): string {
    try {
        const urlObj = new URL(url);
        let display = urlObj.hostname + urlObj.pathname;
        if (display.endsWith('/')) {
            display = display.slice(0, -1);
        }
        return display;
    } catch {
        return url;
    }
}

/**
 * Check if a string is a valid URL
 */
export function isValidUrl(string: string): boolean {
    try {
        new URL(string);
        return true;
    } catch {
        return false;
    }
}

/**
 * Detect if running on macOS
 */
export function isMacOS(): boolean {
    if (typeof navigator !== 'undefined') {
        return navigator.platform.toLowerCase().includes('mac');
    }
    return false;
}

/**
 * Get modifier key text based on platform
 */
export function getModifierKey(): string {
    return isMacOS() ? '⌘' : 'Ctrl';
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let lastCall = 0;
    return (...args: Parameters<T>) => {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            fn(...args);
        }
    };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format duration in ms to readable string
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

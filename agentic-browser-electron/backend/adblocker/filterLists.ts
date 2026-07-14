/**
 * Filter Lists Configuration
 * URLs and metadata for ad blocking filter lists
 */

import { FilterList } from './types';

export const FILTER_LISTS: FilterList[] = [
    {
        id: 'easylist',
        name: 'EasyList',
        url: 'https://easylist.to/easylist/easylist.txt',
        enabled: true,
        description: 'Primary ad blocking rules',
    },
    {
        id: 'easyprivacy',
        name: 'EasyPrivacy',
        url: 'https://easylist.to/easylist/easyprivacy.txt',
        enabled: true,
        description: 'Tracker and analytics blocking',
    },
    {
        id: 'peterlowe',
        name: "Peter Lowe's Ad Server List",
        url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext',
        enabled: true,
        description: 'Ad server domains',
    },
    {
        id: 'fanboy-annoyance',
        name: 'Fanboy Annoyance List',
        url: 'https://secure.fanboy.co.nz/fanboy-annoyance.txt',
        enabled: true,
        description: 'Cookie notices, popups, and annoyances',
    },
    {
        id: 'ublock-badware',
        name: 'uBlock Badware Risks',
        url: 'https://raw.githubusercontent.com/niceclouds/uAssets/refs/heads/master/filters/badware.txt',
        enabled: true,
        description: 'Malicious scripts and known badware',
    },
];

/**
 * Get URLs of all enabled filter lists
 */
export function getEnabledFilterListUrls(): string[] {
    return FILTER_LISTS
        .filter(list => list.enabled)
        .map(list => list.url);
}

/**
 * Get all filter list URLs (for initial load)
 */
export function getAllFilterListUrls(): string[] {
    return FILTER_LISTS.map(list => list.url);
}

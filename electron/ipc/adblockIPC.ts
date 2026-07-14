import { ipcMain } from 'electron';
import {
    getAdBlockerState,
    setAdBlockerEnabled,
    getAdBlockerStats,
    refreshFilters,
    resetTabBlockedCount,
} from '../../backend/adblocker';
import {
    addToWhitelist,
    removeFromWhitelist,
    addCustomRule,
    removeCustomRule,
} from '../../backend/adblocker/AdBlockerStore';

export function registerAdblockIPC() {
    ipcMain.handle('adblock:getState', () => {
        return getAdBlockerState();
    });

    ipcMain.handle('adblock:setEnabled', (_, enabled: boolean) => {
        setAdBlockerEnabled(enabled);
        return getAdBlockerState();
    });

    ipcMain.handle('adblock:getStats', () => {
        return getAdBlockerStats();
    });

    ipcMain.handle('adblock:addToWhitelist', (_, domain: string) => {
        return addToWhitelist(domain);
    });

    ipcMain.handle('adblock:removeFromWhitelist', (_, domain: string) => {
        return removeFromWhitelist(domain);
    });

    ipcMain.handle('adblock:addCustomRule', (_, rule: string) => {
        return addCustomRule(rule);
    });

    ipcMain.handle('adblock:removeCustomRule', (_, rule: string) => {
        return removeCustomRule(rule);
    });

    ipcMain.handle('adblock:refreshFilters', async () => {
        await refreshFilters();
        return getAdBlockerState();
    });

    ipcMain.on('adblock:resetTabCount', () => {
        resetTabBlockedCount();
    });
}

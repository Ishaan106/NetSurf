import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';

// Secure storage path for encrypted API keys
export const getSecureStoragePath = () => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'secure-keys.enc');
};

// Read encrypted keys from file
export const readSecureKeys = (): Record<string, string> => {
    try {
        const filePath = getSecureStoragePath();
        if (!fs.existsSync(filePath)) {
            return {};
        }
        const encrypted = fs.readFileSync(filePath);
        const decrypted = safeStorage.decryptString(encrypted);
        return JSON.parse(decrypted);
    } catch {
        return {};
    }
};

// Write encrypted keys to file
export const writeSecureKeys = (keys: Record<string, string>): void => {
    const filePath = getSecureStoragePath();
    const encrypted = safeStorage.encryptString(JSON.stringify(keys));
    fs.writeFileSync(filePath, encrypted);
};

// Plain storage path (fallback for dev mode)
export const getPlainStoragePath = () => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'dev-keys.json');
};

// Read plain keys (dev fallback)
export const readSecureKeysPlain = (): Record<string, string> => {
    try {
        const filePath = getPlainStoragePath();
        if (!fs.existsSync(filePath)) {
            return {};
        }
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
};

// Write plain keys (dev fallback)
export const writeSecureKeysPlain = (keys: Record<string, string>): void => {
    const filePath = getPlainStoragePath();
    fs.writeFileSync(filePath, JSON.stringify(keys, null, 2));
};

// Local server URL storage path
export const getLocalServerUrlPath = () => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'local-server-url.txt');
};

// Read local server URL
export const readLocalServerUrl = (): string => {
    try {
        const filePath = getLocalServerUrlPath();
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8').trim();
        }
    } catch {
        // Ignore errors
    }
    return 'http://localhost:8080/v1'; // Default
};

// Write local server URL
export const writeLocalServerUrl = (url: string): void => {
    const filePath = getLocalServerUrlPath();
    fs.writeFileSync(filePath, url);
};

// Get API key for a provider
export function getSavedApiKey(provider: string): string {
    const useEncrypted = safeStorage.isEncryptionAvailable();
    const keys = useEncrypted ? readSecureKeys() : readSecureKeysPlain();
    return keys[provider] || '';
}

import { ipcMain, safeStorage } from 'electron';
import fs from 'fs';
import { validateApiKey, validateLocalServer, ValidationResult } from '../../backend/api/llmValidator';
import { LLMProvider, LLM_PROVIDERS, getProviderKeys } from '../../backend/models/llmProviders';
import {
    readSecureKeys,
    writeSecureKeys,
    readSecureKeysPlain,
    writeSecureKeysPlain,
    getLocalServerUrlPath,
    writeLocalServerUrl,
    readLocalServerUrl,
    getSavedApiKey,
} from '../settingsStore';

function normalizeProviderModels(provider: LLMProvider, data: any): string[] {
    if (provider === 'google') {
        return (data.models || [])
            .filter((model: any) => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes('generateContent'))
            .map((model: any) => String(model.name || '').replace(/^models\//, ''))
            .filter(Boolean);
    }

    const models = (data.data || data.models || [])
        .map((model: any) => typeof model === 'string' ? model : model?.id || model?.name)
        .map((model: string) => String(model || '').replace(/^models\//, ''))
        .filter(Boolean);

    if (provider === 'openai') {
        return models.filter((model: string) =>
            /^(gpt|o\d|chatgpt)/i.test(model) &&
            !/(audio|embedding|moderation|realtime|tts|transcribe|whisper|dall-e|image)/i.test(model)
        );
    }

    return models;
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

function redactCredentialFromErrorMessage(errorMessage: string, credential?: string): string {
    if (!credential) return errorMessage;
    const trimmed = credential.trim();
    if (!trimmed) return errorMessage;
    if (isHttpUrl(trimmed)) return errorMessage;
    const encoded = encodeURIComponent(trimmed);
    return errorMessage
        .split(trimmed).join('[REDACTED]')
        .split(encoded).join('[REDACTED]');
}

function getModelFetchRequest(provider: LLMProvider, credentialOrBaseUrl?: string): { url: string; init: RequestInit } {
    const config = LLM_PROVIDERS[provider];

    if (provider === 'local') {
        const baseUrl = credentialOrBaseUrl || readLocalServerUrl();
        if (!isHttpUrl(baseUrl)) {
            throw new Error('Invalid local server URL (must start with http:// or https://)');
        }
        return {
            url: `${baseUrl.replace(/\/$/, '')}/models`,
            init: { method: 'GET' },
        };
    }

    const apiKey = credentialOrBaseUrl || getSavedApiKey(provider);
    if (!apiKey) throw new Error('API key not configured');

    if (provider === 'google') {
        return {
            url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
            init: { method: 'GET' },
        };
    }

    if (provider === 'anthropic') {
        return {
            url: 'https://api.anthropic.com/v1/models',
            init: {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
            },
        };
    }

    const baseUrl = (config.baseURL || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error(`No models endpoint configured for ${provider}`);
    return {
        url: `${baseUrl}/models`,
        init: {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        },
    };
}

export function registerSettingsIPC() {
    ipcMain.handle('settings:saveApiKey', async (_, provider: string, apiKey: string) => {
        try {
            if (!safeStorage.isEncryptionAvailable()) {
                console.warn('[Settings] Secure storage not available, using plain storage');
                const keys = readSecureKeysPlain();
                keys[provider] = apiKey;
                writeSecureKeysPlain(keys);
                return { success: true };
            }
            const keys = readSecureKeys();
            keys[provider] = apiKey;
            writeSecureKeys(keys);
            return { success: true };
        } catch (error) {
            console.error('[Settings] Failed to save API key:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('settings:getApiKey', async (_, provider: string) => {
        try {
            const useEncrypted = safeStorage.isEncryptionAvailable();
            const keys = useEncrypted ? readSecureKeys() : readSecureKeysPlain();
            return keys[provider] || null;
        } catch {
            return null;
        }
    });

    ipcMain.handle('settings:deleteApiKey', async (_, provider: string) => {
        try {
            const useEncrypted = safeStorage.isEncryptionAvailable();
            const keys = useEncrypted ? readSecureKeys() : readSecureKeysPlain();
            delete keys[provider];
            if (useEncrypted) {
                writeSecureKeys(keys);
            } else {
                writeSecureKeysPlain(keys);
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('settings:hasApiKey', async (_, provider: string) => {
        try {
            if (provider === 'local') {
                const filePath = getLocalServerUrlPath();
                return fs.existsSync(filePath);
            }
            const useEncrypted = safeStorage.isEncryptionAvailable();
            const keys = useEncrypted ? readSecureKeys() : readSecureKeysPlain();
            return !!keys[provider];
        } catch {
            return false;
        }
    });

    ipcMain.handle('settings:validateApiKey', async (_, provider: LLMProvider, apiKey: string): Promise<ValidationResult> => {
        return await validateApiKey(provider, apiKey);
    });

    ipcMain.handle('settings:getProviders', () => {
        return LLM_PROVIDERS;
    });

    ipcMain.handle('settings:getProviderKeys', () => {
        return getProviderKeys();
    });

    ipcMain.handle('settings:getConfiguredProviders', async () => {
        try {
            const useEncrypted = safeStorage.isEncryptionAvailable();
            const keys = useEncrypted ? readSecureKeys() : readSecureKeysPlain();
            const configuredProviders = Object.keys(keys).filter(provider => !!keys[provider]);

            const localServerUrlPath = getLocalServerUrlPath();
            if (fs.existsSync(localServerUrlPath)) {
                if (!configuredProviders.includes('local')) {
                    configuredProviders.push('local');
                }
            }
            return configuredProviders;
        } catch {
            return [];
        }
    });

    ipcMain.handle('settings:saveLocalServerUrl', async (_, url: string) => {
        try {
            writeLocalServerUrl(url);
            return { success: true };
        } catch (error) {
            console.error('[Settings] Failed to save local server URL:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('settings:getLocalServerUrl', async () => {
        return readLocalServerUrl();
    });

    ipcMain.handle('settings:testLocalServer', async (_, url: string): Promise<ValidationResult> => {
        return await validateLocalServer(url);
    });

    ipcMain.handle('settings:deleteLocalServer', async () => {
        try {
            const filePath = getLocalServerUrlPath();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('settings:hasLocalServer', async () => {
        const filePath = getLocalServerUrlPath();
        return fs.existsSync(filePath);
    });

    ipcMain.handle('settings:fetchModels', async (_, provider: LLMProvider, credentialOrBaseUrl?: string) => {
        try {
            const request = getModelFetchRequest(provider, credentialOrBaseUrl);
            try {
                // eslint-disable-next-line no-new
                new URL(request.url);
            } catch {
                return { success: false, error: 'Invalid models endpoint URL' };
            }

            const response = await fetch(request.url, {
                ...request.init,
                signal: AbortSignal.timeout(8000),
            });
            if (!response.ok) {
                return { success: false, error: `HTTP ${response.status}` };
            }
            const data = await response.json();
            const models = normalizeProviderModels(provider, data)
                .filter((v, i, a) => a.indexOf(v) === i)
                .sort((a, b) => a.localeCompare(b));
            return { success: true, models };
        } catch (error: any) {
            const rawMessage = error?.message || 'Failed to fetch models';
            const safeMessage = redactCredentialFromErrorMessage(rawMessage, credentialOrBaseUrl);
            return { success: false, error: safeMessage };
        }
    });
}

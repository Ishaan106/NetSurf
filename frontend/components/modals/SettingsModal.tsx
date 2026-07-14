import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Settings, Key, Cpu, Eye, EyeOff, Check, AlertCircle,
    Loader2, Sparkles, Trash2, Server, ExternalLink, Image, ImageOff, RefreshCw
} from 'lucide-react';
import { useUIStore, useSettingsStore, useAgentStore } from '@/store';
import clsx from 'clsx';
import type { LLMProvider, ProviderConfig, ValidationResult } from '../../types.d';

// Provider icon colors for visual distinction
const PROVIDER_COLORS: Record<string, string> = {
    local: 'text-emerald-400',
    deepseek: 'text-blue-400',
    openrouter: 'text-purple-400',
    google: 'text-yellow-400',
    openai: 'text-green-400',
    anthropic: 'text-orange-400',
    qwen: 'text-cyan-400',
};

export function SettingsModal() {
    const isPanelOpen = useUIStore((s) => s.isPanelOpen);
    const activePanel = useUIStore((s) => s.activePanel);
    const closePanel = useUIStore((s) => s.closePanel);

    const llmProvider = useSettingsStore((s) => s.llmProvider);
    const llmModel = useSettingsStore((s) => s.llmModel);
    const isApiKeyConfigured = useSettingsStore((s) => s.isApiKeyConfigured);
    const screenshotEnabled = useSettingsStore((s) => s.screenshotEnabled);
    const setLLMProvider = useSettingsStore((s) => s.setLLMProvider);
    const setLLMModel = useSettingsStore((s) => s.setLLMModel);
    const setApiKeyConfigured = useSettingsStore((s) => s.setApiKeyConfigured);
    const setScreenshotEnabled = useSettingsStore((s) => s.setScreenshotEnabled);
    const reinitializeAgent = useAgentStore((s) => s.reinitializeAgent);

    const [providers, setProviders] = useState<Record<string, ProviderConfig>>({});
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [localServerUrl, setLocalServerUrl] = useState('http://localhost:8080/v1');
    const [isTestingLocal, setIsTestingLocal] = useState(false);
    const [localTestResult, setLocalTestResult] = useState<ValidationResult | null>(null);
    const [isSavingLocal, setIsSavingLocal] = useState(false);
    const [localSaveSuccess, setLocalSaveSuccess] = useState(false);
    const [fetchedLocalModels, setFetchedLocalModels] = useState<string[]>([]);
    const [isFetchingModels, setIsFetchingModels] = useState(false);

    const isVisible = isPanelOpen && activePanel === 'settings';
    const currentProvider = providers[llmProvider];

    // Load providers and configured keys
    useEffect(() => {
        if (!isVisible) return;
        (async () => {
            try {
                const api = window.electronAPI;
                if (!api?.settings) return;
                const bp = await api.settings.getProviders();
                if (bp) setProviders(bp as Record<string, ProviderConfig>);
                const configured = await api.settings.getConfiguredProviders();
                setConfiguredProviders(configured || []);
            } catch {}
        })();
    }, [isVisible]);

    // Check API key when provider changes
    useEffect(() => {
        if (!isVisible) return;
        (async () => {
            try {
                const api = window.electronAPI;
                if (!api?.settings) return;
                const hasKey = await api.settings.hasApiKey(llmProvider);
                setApiKeyConfigured(hasKey);
                setValidationResult(null);
                setApiKey('');
            } catch {}
        })();
    }, [llmProvider, isVisible, setApiKeyConfigured]);

    // Load local server URL
    useEffect(() => {
        if (!isVisible || llmProvider !== 'local') return;
        (async () => {
            try {
                const api = window.electronAPI;
                if (!api?.settings) return;
                const url = await api.settings.getLocalServerUrl();
                setLocalServerUrl(url);
                setLocalTestResult(null);
            } catch {}
        })();
    }, [llmProvider, isVisible]);

    // Auto-fetch models for local server
    useEffect(() => {
        if (!isVisible || llmProvider !== 'local') return;
        handleFetchLocalModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [llmProvider, isVisible]);

    // Update model when provider changes
    useEffect(() => {
        const provider = providers[llmProvider];
        if (provider && !provider.models.includes(llmModel)) {
            setLLMModel(provider.defaultModel);
        }
    }, [llmProvider, providers, llmModel, setLLMModel]);

    const handleProviderChange = (newProvider: LLMProvider) => {
        setLLMProvider(newProvider);
        setValidationResult(null);
        setApiKey('');
        setFetchedLocalModels([]);
    };

    const handleFetchLocalModels = async () => {
        setIsFetchingModels(true);
        try {
            const api = window.electronAPI;
            if (!api?.settings) return;
            const result = await api.settings.fetchModels('local', localServerUrl);
            if (result.success && result.models) {
                setFetchedLocalModels(result.models);
                if (result.models.length > 0 && (llmModel === 'auto' || llmModel === 'local-model')) {
                    setLLMModel(result.models[0]);
                }
            }
        } catch {} finally {
            setIsFetchingModels(false);
        }
    };

    const handleValidateKey = async () => {
        if (!apiKey.trim()) {
            setValidationResult({ valid: false, statusCode: 400, message: 'Please enter an API key', error: 'EMPTY_KEY' });
            return;
        }
        setIsValidating(true);
        setValidationResult(null);
        try {
            const api = window.electronAPI;
            if (api?.settings) {
                const result = await api.settings.validateApiKey(llmProvider, apiKey);
                setValidationResult(result);
            }
        } catch (error) {
            setValidationResult({ valid: false, statusCode: 500, message: 'Validation failed', error: error instanceof Error ? error.message : 'UNKNOWN' });
        } finally {
            setIsValidating(false);
        }
    };

    const handleSaveApiKey = async () => {
        if (!apiKey.trim()) return;
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const api = window.electronAPI;
            if (api?.settings) {
                const result = await api.settings.saveApiKey(llmProvider, apiKey);
                if (result.success) {
                    setApiKeyConfigured(true);
                    setSaveSuccess(true);
                    setApiKey('');
                    const configured = await api.settings.getConfiguredProviders();
                    setConfiguredProviders(configured || []);
                    await reinitializeAgent(llmProvider, llmModel);
                    setTimeout(() => setSaveSuccess(false), 2000);
                }
            }
        } catch {} finally {
            setIsSaving(false);
        }
    };

    const handleDeleteApiKey = async (providerToDelete: string) => {
        setIsDeleting(providerToDelete);
        try {
            const api = window.electronAPI;
            if (!api?.settings) return;
            if (providerToDelete === 'local') {
                const result = await api.settings.deleteLocalServer();
                if (result.success) {
                    const configured = await api.settings.getConfiguredProviders();
                    setConfiguredProviders(configured || []);
                    if (providerToDelete === llmProvider) setApiKeyConfigured(false);
                }
            } else {
                const result = await api.settings.deleteApiKey(providerToDelete);
                if (result.success) {
                    const configured = await api.settings.getConfiguredProviders();
                    setConfiguredProviders(configured || []);
                    if (providerToDelete === llmProvider) setApiKeyConfigured(false);
                }
            }
        } catch {} finally {
            setIsDeleting(null);
        }
    };

    const handleTestLocalServer = async () => {
        if (!localServerUrl.trim()) return;
        setIsTestingLocal(true);
        setLocalTestResult(null);
        try {
            const api = window.electronAPI;
            if (api?.settings) {
                const result = await api.settings.testLocalServer(localServerUrl);
                setLocalTestResult(result);
            }
        } catch (error) {
            setLocalTestResult({ valid: false, statusCode: 500, message: 'Test failed', error: error instanceof Error ? error.message : 'UNKNOWN' });
        } finally {
            setIsTestingLocal(false);
        }
    };

    const handleSaveLocalServer = async () => {
        if (!localServerUrl.trim()) return;
        setIsSavingLocal(true);
        setLocalSaveSuccess(false);
        try {
            const api = window.electronAPI;
            if (api?.settings) {
                const result = await api.settings.saveLocalServerUrl(localServerUrl);
                if (result.success) {
                    setApiKeyConfigured(true);
                    setLocalSaveSuccess(true);
                    const configured = await api.settings.getConfiguredProviders();
                    setConfiguredProviders(configured || []);
                    await reinitializeAgent('local', llmModel);
                    setTimeout(() => setLocalSaveSuccess(false), 2000);
                }
            }
        } catch {} finally {
            setIsSavingLocal(false);
        }
    };

    // Available models: for local, use fetched models; for others, use static list
    const availableModels = llmProvider === 'local' && fetchedLocalModels.length > 0
        ? fetchedLocalModels
        : currentProvider?.models || [];

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ x: 40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 40, opacity: 0 }}
                    transition={{ type: 'tween', duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className={clsx(
                        'fixed top-[var(--titlebar-height)] right-0 bottom-0 z-40',
                        'w-[460px] max-w-full',
                        'bg-chrome-surface-solid border-l border-chrome-border',
                        'flex flex-col shadow-2xl'
                    )}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between h-14 px-5 border-b border-chrome-border">
                        <div className="flex items-center gap-3">
                            <Settings className="w-5 h-5 text-chrome-accent" />
                            <span className="font-semibold text-base">Settings</span>
                        </div>
                        <button className="p-2 rounded-lg hover:bg-chrome-surface-hover transition-colors" onClick={closePanel}>
                            <X className="w-5 h-5 text-chrome-text-secondary" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {/* Provider Selection Cards */}
                        <section>
                            <h3 className="text-sm font-semibold text-chrome-text mb-3 flex items-center gap-2">
                                <Cpu className="w-4 h-4" />
                                LLM Provider
                            </h3>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(providers).map(([key, config]) => {
                                    const isSelected = llmProvider === key;
                                    const isConfigured = configuredProviders.includes(key);
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => handleProviderChange(key as LLMProvider)}
                                            className={clsx(
                                                'relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all duration-200',
                                                'border text-sm',
                                                isSelected
                                                    ? 'border-chrome-accent bg-chrome-accent ring-1 ring-chrome-accent/30'
                                                    : 'border-chrome-border bg-chrome-surface-hover hover:border-chrome-accent'
                                            )}
                                        >
                                            <Cpu className={clsx('w-4 h-4 flex-shrink-0', PROVIDER_COLORS[key] || 'text-chrome-text-secondary')} />
                                            <span className="truncate font-medium">{config.name}</span>
                                            {isConfigured && (
                                                <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Provider hint */}
                        {currentProvider?.hint && (
                            <div className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-500/10 px-3 py-2 rounded-lg">
                                <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                                {currentProvider.hint}
                            </div>
                        )}

                        {/* Model Selection */}
                        <section>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs text-chrome-text-secondary">Model</label>
                                {llmProvider === 'local' && (
                                    <button
                                        onClick={handleFetchLocalModels}
                                        disabled={isFetchingModels}
                                        className="flex items-center gap-1 text-xs text-chrome-accent hover:text-chrome-accent/80 transition-colors"
                                    >
                                        <RefreshCw className={clsx('w-3 h-3', isFetchingModels && 'animate-spin')} />
                                        Refresh
                                    </button>
                                )}
                            </div>
                            <select
                                value={llmModel}
                                onChange={(e) => setLLMModel(e.target.value)}
                                className={clsx(
                                    'w-full px-3 py-2.5 rounded-lg text-sm',
                                    'bg-chrome-surface-hover border border-chrome-border',
                                    'focus:border-chrome-accent focus:ring-2 focus:ring-chrome-accent/20',
                                    'outline-none transition-all cursor-pointer'
                                )}
                            >
                                {availableModels.map((model) => (
                                    <option key={model} value={model}>{model}</option>
                                ))}
                            </select>
                        </section>

                        {/* API Key / Local Server */}
                        <section>
                            {llmProvider === 'local' ? (
                                <>
                                    <h3 className="text-sm font-semibold text-chrome-text mb-3 flex items-center gap-2">
                                        <Server className="w-4 h-4" />
                                        Local Server
                                    </h3>
                                    {isApiKeyConfigured && (
                                        <div className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-500/10 px-3 py-2 rounded-lg mb-3">
                                            <Check className="w-3.5 h-3.5" />
                                            Local server configured
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs text-chrome-text-secondary mb-1">Server URL</label>
                                        <input
                                            type="text"
                                            value={localServerUrl}
                                            onChange={(e) => setLocalServerUrl(e.target.value)}
                                            placeholder="http://localhost:8080/v1"
                                            className={clsx(
                                                'w-full px-3 py-2.5 rounded-lg text-sm',
                                                'bg-chrome-surface-hover border',
                                                localTestResult && !localTestResult.valid ? 'border-red-500'
                                                    : localTestResult?.valid ? 'border-emerald-500' : 'border-chrome-border',
                                                'focus:border-chrome-accent focus:ring-2 focus:ring-chrome-accent/20',
                                                'outline-none transition-all placeholder:text-chrome-text-secondary'
                                            )}
                                        />
                                        <p className="text-xs text-chrome-text-secondary mt-1">
                                            llama.cpp, Ollama, LM Studio, or any OpenAI-compatible server
                                        </p>
                                    </div>
                                    {localTestResult && (
                                        <div className={clsx('flex items-center gap-2 text-xs mt-2', localTestResult.valid ? 'text-emerald-500' : 'text-red-500')}>
                                            {localTestResult.valid ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                            {localTestResult.valid ? 'Server is running' : localTestResult.message}
                                        </div>
                                    )}
                                    <div className="flex gap-2 mt-3">
                                        <button onClick={handleTestLocalServer} disabled={!localServerUrl.trim() || isTestingLocal}
                                            className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all border border-chrome-border',
                                                localServerUrl.trim() && !isTestingLocal ? 'bg-chrome-surface-hover hover:bg-chrome-border text-chrome-text' : 'bg-chrome-surface text-chrome-text-secondary cursor-not-allowed')}>
                                            {isTestingLocal ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test Connection'}
                                        </button>
                                        <button onClick={handleSaveLocalServer} disabled={!localServerUrl.trim() || isSavingLocal}
                                            className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                                                localServerUrl.trim() && !isSavingLocal ? 'bg-chrome-accent hover:bg-chrome-accent text-white' : 'bg-chrome-surface-hover text-chrome-text-secondary cursor-not-allowed')}>
                                            {isSavingLocal ? <Loader2 className="w-4 h-4 animate-spin" /> : localSaveSuccess ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-chrome-text flex items-center gap-2">
                                            <Key className="w-4 h-4" />
                                            API Key
                                        </h3>
                                        {currentProvider?.getKeyUrl && (
                                            <a href={currentProvider.getKeyUrl} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-xs text-chrome-accent hover:text-chrome-accent/80 transition-colors">
                                                Get Key <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                    </div>
                                    {isApiKeyConfigured && !apiKey && (
                                        <div className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-500/10 px-3 py-2 rounded-lg mb-3">
                                            <Check className="w-3.5 h-3.5" />
                                            API key configured
                                        </div>
                                    )}
                                    <div className="relative">
                                        <input
                                            type={showApiKey ? 'text' : 'password'}
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            placeholder={isApiKeyConfigured ? '••••••••••••••••' : 'Enter your API key'}
                                            className={clsx(
                                                'w-full px-3 py-2.5 pr-10 rounded-lg text-sm',
                                                'bg-chrome-surface-hover border',
                                                validationResult && !validationResult.valid ? 'border-red-500'
                                                    : validationResult?.valid ? 'border-emerald-500' : 'border-chrome-border',
                                                'focus:border-chrome-accent focus:ring-2 focus:ring-chrome-accent/20',
                                                'outline-none transition-all placeholder:text-chrome-text-secondary'
                                            )}
                                        />
                                        <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-chrome-text-secondary hover:text-chrome-text">
                                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {validationResult && (
                                        <div className={clsx('flex items-center gap-2 text-xs mt-2', validationResult.valid ? 'text-emerald-500' : 'text-red-500')}>
                                            {validationResult.valid ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                            {validationResult.valid ? 'API key is valid' : validationResult.message}
                                        </div>
                                    )}
                                    <div className="flex gap-2 mt-3">
                                        <button onClick={handleValidateKey} disabled={!apiKey.trim() || isValidating}
                                            className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all border border-chrome-border',
                                                apiKey.trim() && !isValidating ? 'bg-chrome-surface-hover hover:bg-chrome-border text-chrome-text' : 'bg-chrome-surface text-chrome-text-secondary cursor-not-allowed')}>
                                            {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Validate'}
                                        </button>
                                        <button onClick={handleSaveApiKey} disabled={!apiKey.trim() || isSaving}
                                            className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                                                apiKey.trim() && !isSaving ? 'bg-chrome-accent hover:bg-chrome-accent text-white' : 'bg-chrome-surface-hover text-chrome-text-secondary cursor-not-allowed')}>
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <><Check className="w-4 h-4" /> Saved</> : 'Save Key'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </section>

                        {/* Screenshot Toggle */}
                        <section className="border-t border-chrome-border pt-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {screenshotEnabled ? (
                                        <Image className="w-4 h-4 text-chrome-accent" />
                                    ) : (
                                        <ImageOff className="w-4 h-4 text-chrome-text-secondary" />
                                    )}
                                    <div>
                                        <div className="text-sm font-medium text-chrome-text">Page Screenshots</div>
                                        <div className="text-xs text-chrome-text-secondary">
                                            Send page screenshots to model. Disable for text-only models.
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setScreenshotEnabled(!screenshotEnabled)}
                                    className={clsx(
                                        'relative w-10 h-5 rounded-full transition-colors duration-200',
                                        screenshotEnabled ? 'bg-chrome-accent' : 'bg-chrome-border'
                                    )}
                                >
                                    <div className={clsx(
                                        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                                        screenshotEnabled ? 'translate-x-5' : 'translate-x-0.5'
                                    )} />
                                </button>
                            </div>
                            {!currentProvider?.supportsVision && screenshotEnabled && (
                                <div className="flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 px-3 py-2 rounded-lg mt-3">
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                    {currentProvider?.name || 'This provider'} may not support vision. Consider disabling screenshots.
                                </div>
                            )}
                        </section>

                        {/* Configured Providers */}
                        {configuredProviders.length > 0 && (
                            <section className="border-t border-chrome-border pt-5">
                                <h3 className="text-sm font-semibold text-chrome-text mb-3 flex items-center gap-2">
                                    <Check className="w-4 h-4" />
                                    Configured Providers
                                </h3>
                                <div className="space-y-2">
                                    {configuredProviders.map((provider) => {
                                        const providerConfig = providers[provider as LLMProvider];
                                        return (
                                            <div key={provider} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-chrome-surface-hover border border-chrome-border">
                                                <div className="flex items-center gap-2">
                                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                    <span className="text-sm text-chrome-text">{providerConfig?.name || provider}</span>
                                                </div>
                                                <button onClick={() => handleDeleteApiKey(provider)} disabled={isDeleting === provider}
                                                    className={clsx('p-1.5 rounded-md transition-colors text-chrome-text-secondary hover:text-red-500 hover:bg-red-500/10', isDeleting === provider && 'opacity-50')}
                                                    title="Delete API key">
                                                    {isDeleting === provider ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default SettingsModal;

import { useState, useEffect, useCallback } from 'react';
import {
    Eye, EyeOff, Check,
    Loader2, Sparkles, Trash2,
    RefreshCw, AlertCircle,
    ToggleLeft, ToggleRight
} from 'lucide-react';
import { useSettingsStore, useAgentStore } from '@/store';
import type { LLMProvider, ProviderConfig } from '../../../types.d';
import clsx from 'clsx';

function ModelToggleList({
    provider,
    models,
    enabled,
    selectedModel,
    onSetEnabled,
    onSelectModel,
}: {
    provider: string;
    models: string[];
    enabled: string[];
    selectedModel: string;
    onSetEnabled: (provider: string, models: string[]) => void;
    onSelectModel: (model: string) => void;
}) {
    if (models.length === 0) {
        return (
            <div className="text-[10px] text-chrome-text-secondary/50 border border-dashed border-chrome-border p-3 rounded-lg text-center">
                Configure credentials to fetch models lists
            </div>
        );
    }

    const enabledSet = new Set(enabled);
    const allEnabled = models.every(model => enabledSet.has(model));

    const setNextEnabled = (next: string[]) => {
        const uniqueNext = [...new Set(next)];
        onSetEnabled(provider, uniqueNext);
        if (uniqueNext.length > 0 && !uniqueNext.includes(selectedModel)) {
            onSelectModel(uniqueNext[0]);
        }
    };

    return (
        <div className="space-y-1.5 mt-2">
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] uppercase text-chrome-text-muted">Available Models</span>
                <button
                    type="button"
                    className="text-[10px] font-bold text-chrome-accent"
                    onClick={() => setNextEnabled(allEnabled ? [] : models)}
                >
                    {allEnabled ? 'Disable all' : 'Enable all'}
                </button>
            </div>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto scrollbar-none">
                {models.map(model => {
                    const isOn = enabledSet.has(model);
                    return (
                        <button
                            key={model}
                            type="button"
                            className={clsx(
                                "flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-all",
                                selectedModel === model 
                                    ? "bg-chrome-accent border-chrome-accent text-chrome-text" 
                                    : "bg-chrome-bg border-chrome-border text-chrome-text-secondary"
                            )}
                            onClick={() => {
                                const next = isOn
                                    ? enabled.filter(item => item !== model)
                                    : [...enabled, model];
                                setNextEnabled(next);
                                if (!isOn) onSelectModel(model);
                            }}
                        >
                            <span className="truncate flex-1 font-mono pr-2">{model}</span>
                            {isOn ? <ToggleRight className="w-4 h-4 text-chrome-accent flex-shrink-0" /> : <ToggleLeft className="w-4 h-4 text-chrome-text-secondary/40 flex-shrink-0" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function AITab() {
    const llmProvider = useSettingsStore(s => s.llmProvider);
    const llmModel = useSettingsStore(s => s.llmModel);
    const screenshotEnabled = useSettingsStore(s => s.screenshotEnabled);
    const availableModels = useSettingsStore(s => s.availableModels);
    const enabledModels = useSettingsStore(s => s.enabledModels);
    const setLLMProvider = useSettingsStore(s => s.setLLMProvider);
    const setLLMModel = useSettingsStore(s => s.setLLMModel);
    const setApiKeyConfigured = useSettingsStore(s => s.setApiKeyConfigured);
    const setScreenshotEnabled = useSettingsStore(s => s.setScreenshotEnabled);
    const setAvailableModels = useSettingsStore(s => s.setAvailableModels);
    const setEnabledModels = useSettingsStore(s => s.setEnabledModels);
    const reinitializeAgent = useAgentStore((s) => s.reinitializeAgent);

    const [providers, setProviders] = useState<Record<string, ProviderConfig>>({});
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; models?: string[] } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [configured, setConfigured] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [localUrl, setLocalUrl] = useState('http://localhost:8080/v1');
    const [localModels, setLocalModels] = useState<string[]>([]);
    const [pendingModels, setPendingModels] = useState<string[]>([]);
    const [fetchingLocal, setFetchingLocal] = useState(false);

    const current = providers[llmProvider];
    const modelList = llmProvider === 'local'
        ? (localModels.length > 0 ? localModels : (availableModels.local || []))
        : (pendingModels.length > 0 ? pendingModels : (availableModels[llmProvider] || []));

    useEffect(() => {
        (async () => {
            try {
                const api = window.electronAPI;
                if (!api?.settings) return;
                const bp = await api.settings.getProviders();
                if (bp) setProviders(bp as Record<string, ProviderConfig>);
                const c = await api.settings.getConfiguredProviders();
                setConfigured(c || []);
                const savedUrl = await api.settings.getLocalServerUrl();
                if (savedUrl) setLocalUrl(savedUrl);
                const settings = useSettingsStore.getState();
                await Promise.all((c || []).map(async (providerId: string) => {
                    if (settings.availableModels[providerId]?.length) return;
                    const modelResult = providerId === 'local'
                        ? await api.settings.fetchModels('local', savedUrl || localUrl)
                        : await api.settings.fetchModels(providerId);
                    if (modelResult?.success && modelResult.models?.length) {
                        settings.setAvailableModels(providerId, modelResult.models);
                        if (!(settings.enabledModels[providerId] || []).length) {
                            settings.setEnabledModels(providerId, modelResult.models);
                        }
                        if (providerId === 'local') setLocalModels(modelResult.models);
                    }
                }));
            } catch {}
        })();
    }, []);

    const handleTestKey = useCallback(async () => {
        if (!apiKey.trim()) return;
        setIsTesting(true); setTestResult(null); setPendingModels([]);
        try {
            const api = window.electronAPI;
            if (!api?.settings) throw new Error('Settings API unavailable');
            const res = await api.settings.validateApiKey(llmProvider, apiKey.trim());
            if (res.valid) {
                const mRes = await api.settings.fetchModels(llmProvider, apiKey.trim());
                const models = mRes?.success && mRes.models ? mRes.models : [];
                setPendingModels(models);
                if (models.length > 0 && !(enabledModels[llmProvider] || []).length) {
                    setEnabledModels(llmProvider, models);
                }
                setTestResult({
                    ok: true,
                    msg: models.length > 0
                        ? `Key is valid. Found ${models.length} model(s).`
                        : `Key is valid.${mRes?.error ? ` Model list unavailable: ${mRes.error}` : ''}`,
                    models: models.length > 0 ? models : undefined,
                });
            } else {
                setTestResult({ ok: false, msg: res.error || 'Invalid key' });
            }
        } catch (err: any) {
            setTestResult({ ok: false, msg: err.message || 'Test failed' });
        } finally { setIsTesting(false); }
    }, [apiKey, llmProvider, enabledModels, setEnabledModels]);

    const handleSaveKey = useCallback(async () => {
        if (!apiKey.trim()) return;
        setIsSaving(true);
        try {
            const api = window.electronAPI;
            if (!api?.settings) return;
            const r = await api.settings.saveApiKey(llmProvider, apiKey.trim());
            if (r.success) {
                setSaved(true); setApiKeyConfigured(true);
                setConfigured(prev => [...new Set([...prev, llmProvider])]);
                const models = pendingModels.length > 0 ? pendingModels : (availableModels[llmProvider] || []);
                if (models.length > 0) {
                    const existingEnabled = enabledModels[llmProvider] || [];
                    const nextEnabled = existingEnabled.length > 0
                        ? existingEnabled.filter(m => models.includes(m))
                        : models;
                    setAvailableModels(llmProvider, models);
                    setEnabledModels(llmProvider, nextEnabled.length > 0 ? nextEnabled : models);
                    if (!models.includes(llmModel)) setLLMModel(models[0]);
                }
                await reinitializeAgent(llmProvider, llmModel);
                setTimeout(() => setSaved(false), 2000);
            }
        } catch {} finally { setIsSaving(false); }
    }, [apiKey, llmProvider, pendingModels, availableModels, enabledModels, llmModel, setApiKeyConfigured, setAvailableModels, setEnabledModels, setLLMModel, reinitializeAgent]);

    const handleDeleteKey = useCallback(async (id: string) => {
        setIsDeleting(id);
        try {
            const api = window.electronAPI;
            if (!api?.settings) return;
            await api.settings.deleteApiKey(id);
            setConfigured(prev => prev.filter(p => p !== id));
            setAvailableModels(id, []);
            setEnabledModels(id, []);
            if (id === llmProvider) setApiKeyConfigured(false);
        } catch {} finally { setIsDeleting(null); }
    }, [llmProvider, setApiKeyConfigured, setAvailableModels, setEnabledModels]);

    const fetchLocal = useCallback(async () => {
        setFetchingLocal(true); setTestResult(null);
        try {
            const api = window.electronAPI;
            if (!api?.settings) return;
            await api.settings.saveLocalServerUrl(localUrl);
            const testRes = await api.settings.testLocalServer(localUrl);
            if (!testRes.valid) {
                setTestResult({ ok: false, msg: testRes.error || 'Cannot connect to server' });
                setFetchingLocal(false);
                return;
            }
            const r = await api.settings.fetchModels('local', localUrl);
            if (r?.models && r.models.length > 0) {
                setLocalModels(r.models);
                setAvailableModels('local', r.models);
                const currentEnabled = enabledModels.local || [];
                const nextEnabled = currentEnabled.length > 0
                    ? currentEnabled.filter(m => r.models!.includes(m))
                    : r.models;
                setEnabledModels('local', nextEnabled.length > 0 ? nextEnabled : r.models);
                if (!r.models.includes(llmModel)) setLLMModel(r.models[0]);
                setConfigured(prev => [...new Set([...prev, 'local'])]);
                await reinitializeAgent('local', llmModel);
                setTestResult({ ok: true, msg: `Connected! Found ${r.models.length} model(s).` });
            } else {
                setTestResult({ ok: true, msg: 'Connected but no models found.' });
            }
        } catch (err: any) {
            setTestResult({ ok: false, msg: err.message || 'Connection failed' });
        } finally { setFetchingLocal(false); }
    }, [localUrl, enabledModels.local, llmModel, setAvailableModels, setEnabledModels, setLLMModel, reinitializeAgent]);

    const PROVIDER_DOTS: Record<string, string> = {
        local: '#10b981', deepseek: '#3b82f6', openrouter: '#8b5cf6',
        google: '#f59e0b', openai: '#10b981', anthropic: '#f97316', qwen: '#06b6d4',
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-chrome-text flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-chrome-accent" />
                    AI Providers
                </h2>
                <p className="text-xs text-chrome-text-secondary">Configure credentials, server hosts, and model options for the smart AI sidebar.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {Object.entries(providers).map(([id, p]) => (
                    <button 
                        key={id} 
                        onClick={() => { setLLMProvider(id as LLMProvider); setTestResult(null); setPendingModels([]); setApiKey(''); }}
                        className={clsx(
                            "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold border transition-all",
                            llmProvider === id 
                                ? "bg-chrome-surface-solid border-chrome-accent shadow-sm" 
                                : "border-chrome-border hover:bg-chrome-surface-hover"
                        )}
                    >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PROVIDER_DOTS[id] || '#888' }} />
                        <span className="flex-1 truncate">{p.name}</span>
                        {configured.includes(id) && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                    </button>
                ))}
            </div>

            {current && (
                <div className="p-4 bg-chrome-surface border border-chrome-border rounded-xl space-y-3.5">
                    <h3 className="text-xs font-bold text-chrome-text">{current.name}</h3>

                    {llmProvider !== 'local' ? (
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] uppercase text-chrome-text-muted">API Key</label>
                                <div className="flex gap-2 mt-1">
                                    <div className="flex-1 flex items-center bg-chrome-bg border border-chrome-border rounded-xl px-3 py-1.5 focus-within:border-chrome-accent">
                                        <input 
                                            type={showKey ? 'text' : 'password'} 
                                            value={apiKey}
                                            onChange={e => setApiKey(e.target.value)}
                                            placeholder={`Enter ${current.name} API key`} 
                                            className="w-full bg-transparent border-none outline-none text-xs text-chrome-text" 
                                        />
                                        <button onClick={() => setShowKey(!showKey)} className="text-chrome-text-secondary/50 hover:text-chrome-text">
                                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <button onClick={handleTestKey} disabled={!apiKey.trim() || isTesting} className="px-3.5 py-1.5 bg-chrome-surface border border-chrome-border text-xs rounded-xl hover:bg-chrome-surface-solid font-semibold disabled:opacity-40">
                                        {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
                                    </button>
                                    <button onClick={handleSaveKey} disabled={!apiKey.trim() || isSaving || (testResult !== null && !testResult.ok)} className="px-4 py-1.5 bg-chrome-accent text-white text-xs rounded-xl hover:brightness-105 font-semibold disabled:opacity-40">
                                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : 'Save'}
                                    </button>
                                </div>
                            </div>

                            {testResult && (
                                <div className={clsx("flex items-center gap-2 text-xs p-2 rounded-lg", testResult.ok ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10")}>
                                    {testResult.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    <span>{testResult.msg}</span>
                                </div>
                            )}

                            <ModelToggleList
                                provider={llmProvider}
                                models={modelList}
                                enabled={enabledModels[llmProvider] || []}
                                selectedModel={llmModel}
                                onSetEnabled={setEnabledModels}
                                onSelectModel={setLLMModel}
                            />

                            {configured.includes(llmProvider) && (
                                <div className="flex items-center justify-between p-2 bg-emerald-500/10 rounded-lg text-emerald-500 text-xs">
                                    <div className="flex items-center gap-1.5">
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Key Configured</span>
                                    </div>
                                    <button onClick={() => handleDeleteKey(llmProvider)} className="p-1 rounded hover:bg-red-500/10 text-chrome-text-secondary hover:text-red-500">
                                        {isDeleting === llmProvider ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] uppercase text-chrome-text-muted">Local Server Host</label>
                                <div className="flex gap-2 mt-1">
                                    <input 
                                        type="text" 
                                        value={localUrl} 
                                        onChange={e => setLocalUrl(e.target.value)} 
                                        className="flex-1 px-3 py-1.5 rounded-xl bg-chrome-bg border border-chrome-border text-xs outline-none focus:border-chrome-accent" 
                                        placeholder="http://localhost:8080/v1" 
                                    />
                                    <button onClick={fetchLocal} className="px-4 py-1.5 bg-chrome-accent text-white text-xs rounded-xl hover:brightness-105 font-semibold" disabled={fetchingLocal}>
                                        {fetchingLocal ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {testResult && (
                                <div className={clsx("flex items-center gap-2 text-xs p-2 rounded-lg", testResult.ok ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10")}>
                                    {testResult.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    <span>{testResult.msg}</span>
                                </div>
                            )}

                            <ModelToggleList
                                provider="local"
                                models={modelList}
                                enabled={enabledModels.local || []}
                                selectedModel={llmModel}
                                onSetEnabled={setEnabledModels}
                                onSelectModel={setLLMModel}
                            />
                        </div>
                    )}

                    {/* Screenshot feature toggle */}
                    <div className="border-t border-chrome-border pt-3 flex items-center justify-between">
                        <div>
                            <label className="text-xs font-semibold text-chrome-text">Multimodal Screenshot Input</label>
                            <p className="text-[10px] text-chrome-text-secondary">Capture page screen context to assist model reasoning</p>
                        </div>
                        <button 
                            className={clsx(
                                "relative w-9 h-5 rounded-full transition-colors",
                                screenshotEnabled ? "bg-chrome-accent" : "bg-chrome-border"
                            )}
                            onClick={() => setScreenshotEnabled(!screenshotEnabled)}
                        >
                            <span className={clsx("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform", screenshotEnabled ? "translate-x-4.5" : "translate-x-0.5")} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

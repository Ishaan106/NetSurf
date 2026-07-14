import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { LLMProvider } from '../types.d';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface ShortcutConfig {
    id: string;
    action: string;
    keys: string[];
    enabled: boolean;
}

export interface PermissionSetting {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    requiresApproval: boolean;
}

export interface Workspace {
    id: string;
    name: string;
    color: string;
    icon?: string;
}

interface SettingsState {
    themePreference: ThemePreference;
    fontSize: 'small' | 'medium' | 'large';
    showBookmarkBar: boolean;

    layoutMode: 'horizontal' | 'vertical';
    isSidebarCollapsed: boolean;
    sidebarWidth: number;
    enableVerticalTabsFeature: boolean;

    shortcuts: ShortcutConfig[];
    permissions: PermissionSetting[];

    agentApprovalRequired: boolean;
    agentShowToolUsage: boolean;
    agentLogLevel: 'minimal' | 'normal' | 'verbose';

    telemetryEnabled: boolean;
    performanceMonitorEnabled: boolean;

    llmProvider: LLMProvider;
    llmModel: string;
    isApiKeyConfigured: boolean;
    screenshotEnabled: boolean;
    availableModels: Record<string, string[]>;
    enabledModels: Record<string, string[]>;

    voice: {
        enabled: boolean;
        model: string;
        maxDurationSec: number;
        cpuThreads: number;
        autoSendToAgent: boolean;
    };

    // Premium UI Customization Fields
    accentColor: string; // hex or gradient
    sidebarStyle: 'glass' | 'solid' | 'minimal';
    animationIntensity: 'none' | 'subtle' | 'full';
    transparency: number; // 0-100
    wallpaper: string | null; // URL or background class
    fontFamily: string;
    densityMode: 'compact' | 'comfortable';
    chromeLayoutStyle: 'dia-minimal' | 'arc-floating';
    workspaces: Workspace[];
    activeWorkspaceId: string;
    userName: string;
    /** Per-workspace ad blocker toggle — true = enabled (default) */
    workspaceAdblock: Record<string, boolean>;
    themePreset: 'desert-cream' | 'sage-mist' | 'nordic-slate' | 'lavender-fields' | 'rose-quartz' | 'obsidian-charcoal' | 'nebula-deep';
}

interface SettingsActions {
    setUserName: (name: string) => void;
    setThemePreference: (preference: ThemePreference) => void;
    setFontSize: (size: 'small' | 'medium' | 'large') => void;
    toggleBookmarkBar: () => void;
    setLayoutMode: (mode: 'horizontal' | 'vertical') => void;
    toggleLayoutMode: () => void;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setSidebarWidth: (width: number) => void;
    toggleVerticalTabsFeature: () => void;
    updateShortcut: (id: string, keys: string[]) => void;
    toggleShortcut: (id: string) => void;
    updatePermission: (id: string, updates: Partial<PermissionSetting>) => void;
    setAgentApproval: (required: boolean) => void;
    setAgentLogLevel: (level: 'minimal' | 'normal' | 'verbose') => void;
    toggleTelemetry: () => void;
    togglePerformanceMonitor: () => void;
    resetToDefaults: () => void;
    setLLMProvider: (provider: LLMProvider) => void;
    setLLMModel: (model: string) => void;
    setApiKeyConfigured: (configured: boolean) => void;
    setScreenshotEnabled: (enabled: boolean) => void;
    setAvailableModels: (provider: string, models: string[]) => void;
    toggleModelEnabled: (provider: string, model: string) => void;
    setEnabledModels: (provider: string, models: string[]) => void;
    setVoiceEnabled: (enabled: boolean) => void;
    setVoiceMaxDuration: (seconds: number) => void;
    setVoiceCpuThreads: (threads: number) => void;
    setVoiceAutoSend: (autoSend: boolean) => void;

    // Customizers
    setAccentColor: (color: string) => void;
    setSidebarStyle: (style: 'glass' | 'solid' | 'minimal') => void;
    setAnimationIntensity: (intensity: 'none' | 'subtle' | 'full') => void;
    setTransparency: (transparency: number) => void;
    setWallpaper: (wallpaper: string | null) => void;
    setFontFamily: (font: string) => void;
    setDensityMode: (mode: 'compact' | 'comfortable') => void;
    setChromeLayoutStyle: (style: 'dia-minimal' | 'arc-floating') => void;
    setActiveWorkspaceId: (id: string) => void;
    addWorkspace: (workspace: Workspace) => void;
    deleteWorkspace: (id: string) => void;
    updateWorkspace: (id: string, updates: Partial<Workspace>) => void;
    /** Toggle ad blocker on/off for a specific workspace */
    toggleWorkspaceAdblock: (workspaceId: string) => void;
    isWorkspaceAdblockEnabled: (workspaceId: string) => boolean;
    setThemePreset: (preset: 'desert-cream' | 'sage-mist' | 'nordic-slate' | 'lavender-fields' | 'rose-quartz' | 'obsidian-charcoal' | 'nebula-deep') => void;
}

export type SettingsStore = SettingsState & SettingsActions;

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const defaultShortcuts: ShortcutConfig[] = [
    { id: 'newTab', action: 'New Tab', keys: ['Ctrl', 'T'], enabled: true },
    { id: 'closeTab', action: 'Close Tab', keys: ['Ctrl', 'W'], enabled: true },
    { id: 'reopenTab', action: 'Reopen Closed Tab', keys: ['Ctrl', 'Shift', 'T'], enabled: true },
    { id: 'nextTab', action: 'Next Tab', keys: ['Ctrl', 'Tab'], enabled: true },
    { id: 'prevTab', action: 'Previous Tab', keys: ['Ctrl', 'Shift', 'Tab'], enabled: true },
    { id: 'addressBar', action: 'Focus Address Bar', keys: ['Ctrl', 'L'], enabled: true },
    { id: 'settings', action: 'Open Settings', keys: ['Ctrl', ','], enabled: true },
    { id: 'agentPanel', action: 'Toggle Agent Panel', keys: ['Ctrl', 'Shift', 'A'], enabled: true },
    { id: 'downloads', action: 'Open Downloads', keys: ['Ctrl', 'J'], enabled: true },
    { id: 'history', action: 'Open History', keys: ['Ctrl', 'H'], enabled: true },
    { id: 'newWindow', action: 'New Window', keys: ['Ctrl', 'N'], enabled: true },
    { id: 'reload', action: 'Reload Page', keys: ['Ctrl', 'R'], enabled: true },
    { id: 'hardReload', action: 'Hard Reload', keys: ['Ctrl', 'Shift', 'R'], enabled: true },
    { id: 'toggleVerticalMode', action: 'Toggle Vertical Tabs', keys: ['Ctrl', 'Shift', 'V'], enabled: true },
    { id: 'toggleBookmarks', action: 'Toggle Bookmark Bar', keys: ['Ctrl', 'Shift', 'B'], enabled: true },
];

const defaultPermissions: PermissionSetting[] = [
    { id: 'camera', name: 'Camera', description: 'Access your camera', enabled: false, requiresApproval: true },
    { id: 'microphone', name: 'Microphone', description: 'Access your microphone', enabled: false, requiresApproval: true },
    { id: 'location', name: 'Location', description: 'Access your location', enabled: false, requiresApproval: true },
    { id: 'notifications', name: 'Notifications', description: 'Show notifications', enabled: true, requiresApproval: true },
    { id: 'clipboard', name: 'Clipboard', description: 'Read/write clipboard', enabled: true, requiresApproval: false },
];

const defaultWorkspaces: Workspace[] = [
    { id: 'home', name: 'Home', color: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)', icon: 'Home' },
    { id: 'work', name: 'Work', color: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)', icon: 'Briefcase' },
    { id: 'personal', name: 'Personal', color: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)', icon: 'User' },
    { id: 'research', name: 'Research', color: 'linear-gradient(135deg, #b92b27 0%, #1565c0 100%)', icon: 'Search' },
    { id: 'inspiration', name: 'Inspiration', color: 'linear-gradient(135deg, #ec008c 0%, #fc6767 100%)', icon: 'Sparkles' },
    { id: 'archive', name: 'Archive', color: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', icon: 'Archive' },
];

const initialState: SettingsState = {
    themePreference: 'system',
    fontSize: 'medium',
    showBookmarkBar: true,
    layoutMode: 'horizontal',
    isSidebarCollapsed: false,
    sidebarWidth: 280,
    enableVerticalTabsFeature: false,
    shortcuts: defaultShortcuts,
    permissions: defaultPermissions,
    agentApprovalRequired: true,
    agentShowToolUsage: true,
    agentLogLevel: 'normal',
    telemetryEnabled: false,
    performanceMonitorEnabled: false,
    llmProvider: 'local' as LLMProvider,
    llmModel: 'auto',
    isApiKeyConfigured: false,
    screenshotEnabled: true,
    availableModels: {},
    enabledModels: {},
    voice: {
        enabled: true,
        model: 'tiny.en',
        maxDurationSec: 20,
        cpuThreads: 4,
        autoSendToAgent: true,
    },

    // Theme customization defaults
    accentColor: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)', // Default gradient accent
    sidebarStyle: 'glass',
    animationIntensity: 'full',
    transparency: 15,
    wallpaper: 'ambient-gradient',
    fontFamily: 'Plus Jakarta Sans',
    densityMode: 'comfortable',
    chromeLayoutStyle: 'arc-floating',
    workspaces: defaultWorkspaces,
    activeWorkspaceId: 'home',
    userName: 'User',
    workspaceAdblock: {},
    themePreset: 'desert-cream',
};

export const useSettingsStore = create<SettingsStore>()(
    devtools(
        persist(
            (set, get) => ({
                ...initialState,

                setUserName: (name) => set({ userName: name }),
                setThemePreference: (preference) => set({ themePreference: preference }),
                setFontSize: (size) => set({ fontSize: size }),
                toggleBookmarkBar: () => set((state) => ({ showBookmarkBar: !state.showBookmarkBar })),

                setLayoutMode: (mode) => set({ layoutMode: mode }),
                toggleLayoutMode: () => {
                    set((state) => ({
                        layoutMode: state.layoutMode === 'horizontal' ? 'vertical' : 'horizontal',
                        isSidebarCollapsed: false,
                    }));
                },
                toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
                setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
                setSidebarWidth: (width) => set({ sidebarWidth: width }),
                toggleVerticalTabsFeature: () => {
                    set((state) => ({
                        enableVerticalTabsFeature: !state.enableVerticalTabsFeature,
                        layoutMode: !state.enableVerticalTabsFeature ? 'horizontal' : state.layoutMode,
                    }));
                },

                updateShortcut: (id, keys) => {
                    set((state) => ({
                        shortcuts: state.shortcuts.map((shortcut) =>
                            shortcut.id === id ? { ...shortcut, keys } : shortcut
                        ),
                    }));
                },
                toggleShortcut: (id) => {
                    set((state) => ({
                        shortcuts: state.shortcuts.map((shortcut) =>
                            shortcut.id === id ? { ...shortcut, enabled: !shortcut.enabled } : shortcut
                        ),
                    }));
                },
                updatePermission: (id, updates) => {
                    set((state) => ({
                        permissions: state.permissions.map((permission) =>
                            permission.id === id ? { ...permission, ...updates } : permission
                        ),
                    }));
                },

                setAgentApproval: (required) => set({ agentApprovalRequired: required }),
                setAgentLogLevel: (level) => set({ agentLogLevel: level }),
                toggleTelemetry: () => set((state) => ({ telemetryEnabled: !state.telemetryEnabled })),
                togglePerformanceMonitor: () => set((state) => ({ performanceMonitorEnabled: !state.performanceMonitorEnabled })),
                resetToDefaults: () => set(initialState),

                setLLMProvider: (provider) => set({ llmProvider: provider }),
                setLLMModel: (model) => set({ llmModel: model }),
                setApiKeyConfigured: (configured) => set({ isApiKeyConfigured: configured }),
                setScreenshotEnabled: (enabled) => set({ screenshotEnabled: enabled }),

                setAvailableModels: (provider, models) => {
                    const nextModels = unique(models);
                    set((state) => ({
                        availableModels: { ...state.availableModels, [provider]: nextModels },
                        enabledModels: {
                            ...state.enabledModels,
                            [provider]: (state.enabledModels[provider] || []).filter((model) => nextModels.includes(model)),
                        },
                    }));
                },
                toggleModelEnabled: (provider, model) => {
                    set((state) => {
                        const current = state.enabledModels[provider] || [];
                        const updated = current.includes(model)
                            ? current.filter((item) => item !== model)
                            : [...current, model];
                        return { enabledModels: { ...state.enabledModels, [provider]: unique(updated) } };
                    });
                },
                setEnabledModels: (provider, models) => {
                    set((state) => ({
                        enabledModels: { ...state.enabledModels, [provider]: unique(models) },
                    }));
                },

                setVoiceEnabled: (enabled) => set((state) => ({ voice: { ...state.voice, enabled } })),
                setVoiceMaxDuration: (seconds) => {
                    set((state) => ({
                        voice: { ...state.voice, maxDurationSec: Math.max(5, Math.min(60, seconds)) },
                    }));
                },
                setVoiceCpuThreads: (threads) => {
                    set((state) => ({
                        voice: { ...state.voice, cpuThreads: Math.max(1, Math.min(16, threads)) },
                    }));
                },
                setVoiceAutoSend: (autoSend) => set((state) => ({ voice: { ...state.voice, autoSendToAgent: autoSend } })),

                // Customizers
                setAccentColor: (color) => set({ accentColor: color }),
                setSidebarStyle: (style) => set({ sidebarStyle: style }),
                setAnimationIntensity: (intensity) => set({ animationIntensity: intensity }),
                setTransparency: (transparency) => set({ transparency }),
                setWallpaper: (wallpaper) => set({ wallpaper }),
                setFontFamily: (font) => set({ fontFamily: font }),
                setDensityMode: (mode) => set({ densityMode: mode }),
                setChromeLayoutStyle: (style) => set({ chromeLayoutStyle: style }),
                setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
                addWorkspace: (workspace) => set((state) => ({ workspaces: [...state.workspaces, workspace] })),
                deleteWorkspace: (id) => set((state) => ({
                    workspaces: state.workspaces.filter((w) => w.id !== id),
                    activeWorkspaceId: state.activeWorkspaceId === id ? (state.workspaces.find((w) => w.id !== id)?.id || '') : state.activeWorkspaceId
                })),
                updateWorkspace: (id, updates) => set((state) => ({
                    workspaces: state.workspaces.map((w) => w.id === id ? { ...w, ...updates } : w)
                })),
                toggleWorkspaceAdblock: (workspaceId) => set((state) => ({
                    workspaceAdblock: {
                        ...state.workspaceAdblock,
                        // Default is enabled (true), toggling switches it
                        [workspaceId]: !(state.workspaceAdblock[workspaceId] ?? true),
                    },
                })),
                setThemePreset: (preset) => set({ themePreset: preset }),
                isWorkspaceAdblockEnabled: (workspaceId: string): boolean => {
                    return get().workspaceAdblock[workspaceId] ?? true;
                },
            }),
            {
                name: 'settings-storage',
                merge: (persistedState: unknown, currentState: SettingsStore) => {
                    const persisted = (persistedState || {}) as Partial<SettingsStore>;
                    const merged = { ...currentState, ...persisted };
                    merged.voice = {
                        ...currentState.voice,
                        ...persisted.voice,
                    };
                    merged.availableModels = {
                        ...currentState.availableModels,
                        ...persisted.availableModels,
                    };
                    merged.enabledModels = {
                        ...currentState.enabledModels,
                        ...persisted.enabledModels,
                    };
                    // Always enforce horizontal layout (sidebar mode)
                    merged.layoutMode = 'horizontal';
                    merged.enableVerticalTabsFeature = false;
                    // Ensure 'home' workspace always exists (add it if missing from persisted data)
                    if (!merged.workspaces.find((w: Workspace) => w.id === 'home')) {
                        merged.workspaces = [defaultWorkspaces[0], ...merged.workspaces];
                    }
                    return merged;
                },
            }
        ),
        { name: 'SettingsStore' }
    )
);

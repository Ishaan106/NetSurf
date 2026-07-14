import { Palette, Sun, Moon, Monitor } from 'lucide-react';
import { useSettingsStore } from '@/store';
import { useTheme } from '@/theme';
import clsx from 'clsx';

export const ACCENT_PRESETS = [
    { name: 'Aurora Purple', value: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)' },
    { name: 'Sunset Peach', value: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)' },
    { name: 'Ocean Blue', value: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)' },
    { name: 'Crimson Fire', value: 'linear-gradient(135deg, #b92b27 0%, #1565c0 100%)' },
    { name: 'Forest Emerald', value: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
    { name: 'Cyberpunk Pink', value: 'linear-gradient(135deg, #ec008c 0%, #fc6767 100%)' },
    // Solid Presets
    { name: 'Arc Blue', value: '#1098f7' },
    { name: 'Neon Green', value: '#00f2fe' },
    { name: 'Fuchsia Violet', value: '#d63031' },
    { name: 'Muted Lavender', value: '#a55eea' },
    { name: 'Ember Orange', value: '#fa8231' },
    { name: 'Soft Mint', value: '#20bf6b' }
];

export const THEME_PRESETS = [
    { id: 'desert-cream', name: 'Desert Cream', colors: ['#f8f6f0', '#dca34f'] },
    { id: 'sage-mist', name: 'Sage Mist', colors: ['#f0f4f1', '#4fb282'] },
    { id: 'nordic-slate', name: 'Nordic Slate', colors: ['#f1f4f6', '#60a5fa'] },
    { id: 'lavender-fields', name: 'Lavender Fields', colors: ['#f4f0f6', '#a872f8'] },
    { id: 'rose-quartz', name: 'Rose Quartz', colors: ['#f7f0f1', '#f472b6'] },
    { id: 'obsidian-charcoal', name: 'Obsidian Charcoal', colors: ['#f4f4f5', '#ffffff'] },
    { id: 'nebula-deep', name: 'Nebula Deep', colors: ['#edf2ff', '#c084fc'] }
];

export const FONT_PRESETS = [
    { name: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans' },
    { name: 'Outfit Sans', value: 'Outfit' },
    { name: 'Inter System', value: 'Inter' },
    { name: 'Default UI', value: 'ui-sans-serif, system-ui, -apple-system' }
];

export function AppearanceTab() {
    const { preference, setPreference } = useTheme();
    const accentColor = useSettingsStore((s) => s.accentColor);
    const setAccentColor = useSettingsStore((s) => s.setAccentColor);
    const sidebarStyle = useSettingsStore((s) => s.sidebarStyle);
    const setSidebarStyle = useSettingsStore((s) => s.setSidebarStyle);
    const animationIntensity = useSettingsStore((s) => s.animationIntensity);
    const setAnimationIntensity = useSettingsStore((s) => s.setAnimationIntensity);
    const transparency = useSettingsStore((s) => s.transparency);
    const setTransparency = useSettingsStore((s) => s.setTransparency);
    const fontFamily = useSettingsStore((s) => s.fontFamily);
    const setFontFamily = useSettingsStore((s) => s.setFontFamily);
    const densityMode = useSettingsStore((s) => s.densityMode);
    const setDensityMode = useSettingsStore((s) => s.setDensityMode);
    const chromeLayoutStyle = useSettingsStore((s) => s.chromeLayoutStyle || 'arc-floating');
    const setChromeLayoutStyle = useSettingsStore((s) => s.setChromeLayoutStyle);
    const userName = useSettingsStore((s) => s.userName || 'Arjun');
    const setUserName = useSettingsStore((s) => s.setUserName);
    const activeWorkspaceId = useSettingsStore((s) => s.activeWorkspaceId);
    const workspaces = useSettingsStore((s) => s.workspaces);
    const updateWorkspace = useSettingsStore((s) => s.updateWorkspace);
    const wallpaper = useSettingsStore((s) => s.wallpaper);
    const setWallpaper = useSettingsStore((s) => s.setWallpaper);
    const themePreset = useSettingsStore((s) => s.themePreset);
    const setThemePreset = useSettingsStore((s) => s.setThemePreset);

    const activeColor = workspaces.find((w) => w.id === activeWorkspaceId)?.color || accentColor;

    // Parse start and end colors if it is a gradient
    const isGradient = activeColor.startsWith('linear-gradient');
    let color1 = '#6c5ce7';
    let color2 = '#a29bfe';
    if (isGradient) {
        const hexes = activeColor.match(/#[0-9a-fA-F]{6}/g);
        if (hexes && hexes.length >= 2) {
            color1 = hexes[0];
            color2 = hexes[1];
        }
    } else if (activeColor.startsWith('#')) {
        color1 = activeColor;
        color2 = activeColor;
    }

    const handleColorChange = (c1: string, c2: string) => {
        const newColor = c1.toLowerCase() === c2.toLowerCase() ? c1 : `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
        setAccentColor(newColor);
        if (activeWorkspaceId) {
            updateWorkspace(activeWorkspaceId, { color: newColor });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-chrome-text flex items-center gap-2">
                    <Palette className="w-5 h-5 text-chrome-accent" />
                    Appearance & Customization
                </h2>
                <p className="text-xs text-chrome-text-secondary">Tailor the look, theme, and animations of your browser workspace.</p>
            </div>

            {/* User Profile */}
            <div className="space-y-2 bg-chrome-surface border border-chrome-border rounded-2xl p-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-chrome-text-muted">User Profile Name</label>
                    <p className="text-[10px] text-chrome-text-secondary/70">Customize the name displayed in greetings and search portals.</p>
                </div>
                <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Enter your name..."
                    className="w-full px-3 py-2.5 rounded-xl bg-chrome-surface border border-chrome-border text-xs text-chrome-text focus:border-chrome-accent outline-none transition-all"
                />
            </div>

            {/* Theme Preference */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-chrome-text-muted">Color Mode</label>
                    <div className="grid grid-cols-3 gap-2.5">
                        {[
                            { id: 'light', name: 'Light Mode', icon: Sun },
                            { id: 'dark', name: 'Dark Mode', icon: Moon },
                            { id: 'system', name: 'System Sync', icon: Monitor }
                        ].map((themeOpt) => {
                            const active = preference === themeOpt.id;
                            return (
                                <button
                                    key={themeOpt.id}
                                    onClick={() => setPreference(themeOpt.id as any)}
                                    className={clsx(
                                        "flex items-center justify-center gap-2 py-3 rounded-xl border text-xs font-semibold transition-all",
                                        active 
                                            ? "bg-chrome-surface-solid border-chrome-accent text-chrome-accent shadow-sm" 
                                            : "border-chrome-border hover:bg-chrome-surface-hover hover:border-chrome-border text-chrome-text-secondary"
                                    )}
                                >
                                    <themeOpt.icon className="w-3.5 h-3.5" />
                                    <span>{themeOpt.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-chrome-text-muted">Visual Theme Preset</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {THEME_PRESETS.map((preset) => {
                            const active = themePreset === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    onClick={() => setThemePreset(preset.id as any)}
                                    className={clsx(
                                        "flex flex-col items-center gap-2 p-2.5 rounded-xl border text-center transition-all",
                                        active 
                                            ? "bg-chrome-surface-solid border-chrome-accent shadow-sm" 
                                            : "border-chrome-border hover:bg-chrome-surface-hover hover:border-chrome-border text-chrome-text-secondary"
                                    )}
                                >
                                    <div className="flex h-5 w-10 rounded-full overflow-hidden border border-chrome-border">
                                        <span className="flex-1" style={{ backgroundColor: preset.colors[0] }} />
                                        <span className="flex-1" style={{ backgroundColor: preset.colors[1] }} />
                                    </div>
                                    <span className="text-[11px] font-semibold truncate w-full">{preset.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Accent Gradients presets */}
            <div className="space-y-2">
                <label className="text-xs font-semibold text-chrome-text-muted">Workspace Accent Color</label>
                <div className="grid grid-cols-3 gap-2">
                    {ACCENT_PRESETS.map((preset) => {
                        const active = activeColor === preset.value;
                        return (
                            <button
                                key={preset.name}
                                onClick={() => {
                                    setAccentColor(preset.value);
                                    if (activeWorkspaceId) {
                                        updateWorkspace(activeWorkspaceId, { color: preset.value });
                                    }
                                }}
                                className={clsx(
                                    "flex items-center gap-2 p-2 rounded-xl border text-xs font-semibold transition-all text-left",
                                    active 
                                        ? "border-chrome-accent bg-chrome-surface shadow-sm" 
                                        : "border-chrome-border hover:bg-chrome-surface-hover text-chrome-text-secondary"
                                )}
                            >
                                <span className="w-5 h-5 rounded-full shadow-sm" style={{ background: preset.value }} />
                                <span className="truncate">{preset.name}</span>
                             </button>
                        );
                    })}
                </div>
            </div>

            {/* Custom Accent Color & Gradient Picker */}
            <div className="space-y-3 bg-chrome-surface border border-chrome-border rounded-2xl p-4">
                <div>
                    <label className="text-xs font-semibold text-chrome-text-muted">Custom Accent & Gradient</label>
                    <p className="text-[10px] text-chrome-text-secondary/70">Pick a custom solid color or design your own dual-color gradient.</p>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-chrome-border">
                    <div className="flex items-center gap-4">
                        {/* Color Picker 1 */}
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-semibold text-chrome-text-secondary/60">Color 1 (Start)</span>
                            <div className="w-9 h-9 rounded-full border border-chrome-border shadow-sm relative overflow-hidden cursor-pointer hover:scale-105 active:scale-95 transition-transform" style={{ background: color1 }}>
                                <input
                                    type="color"
                                    value={color1}
                                    onChange={(e) => handleColorChange(e.target.value, color2)}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                                />
                            </div>
                        </div>

                        {/* Color Picker 2 */}
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-semibold text-chrome-text-secondary/60">Color 2 (End)</span>
                            <div className="w-9 h-9 rounded-full border border-chrome-border shadow-sm relative overflow-hidden cursor-pointer hover:scale-105 active:scale-95 transition-transform" style={{ background: color2 }}>
                                <input
                                    type="color"
                                    value={color2}
                                    onChange={(e) => handleColorChange(color1, e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                        <span className="text-[9px] font-semibold text-chrome-text-secondary/60">Current Preview</span>
                        <div className="flex items-center gap-3">
                            <div className="w-16 h-8 rounded-lg border border-chrome-border shadow-md" style={{ background: activeColor }} />
                            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-chrome-text">
                                {isGradient ? 'Gradient' : activeColor}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Background Style Selector */}
            <div className="space-y-3 bg-chrome-surface border border-chrome-border rounded-2xl p-4">
                <div>
                    <label className="text-xs font-semibold text-chrome-text-muted">Window Background Style</label>
                    <p className="text-[10px] text-chrome-text-secondary/70">Select the dynamic background style for the browser shell.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { id: 'ambient-gradient', name: 'Dynamic Ambient', desc: 'Flow updates with color' },
                        { id: 'cosmic-nebula', name: 'Cosmic Nebula', desc: 'Classic purple, peach, blue' },
                        { id: 'glass-frosted', name: 'Glass Frosted', desc: 'Frosted texture depth' },
                        { id: 'solid-dark', name: 'Solid Minimalist', desc: 'Flat background color' }
                    ].map((wp) => {
                        const active = (wallpaper || 'ambient-gradient') === wp.id;
                        return (
                            <button
                                key={wp.id}
                                onClick={() => setWallpaper(wp.id)}
                                className={clsx(
                                    "flex flex-col gap-1 p-3 rounded-xl border text-left transition-all",
                                    active 
                                        ? "bg-chrome-surface-solid border-chrome-accent shadow-sm" 
                                        : "border-chrome-border hover:bg-chrome-surface-hover hover:border-chrome-border text-chrome-text-secondary"
                                )}
                            >
                                <span className={clsx("text-xs font-semibold", active ? "text-chrome-accent" : "text-chrome-text")}>{wp.name}</span>
                                <span className="text-[9px] text-chrome-text-secondary/70">{wp.desc}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Sidebar transparency and blur options */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-chrome-text-muted">Sidebar Glass Opacity</label>
                    <span className="text-xs font-mono">{transparency}%</span>
                </div>
                <input
                    type="range"
                    min="5"
                    max="95"
                    value={transparency}
                    onChange={(e) => setTransparency(Number(e.target.value))}
                    className="w-full h-1 bg-chrome-border rounded-lg appearance-none cursor-pointer accent-chrome-accent"
                />
            </div>

            {/* Font Family Preference */}
            <div className="space-y-2">
                <label className="text-xs font-semibold text-chrome-text-muted">Workspace Font Family</label>
                <div className="grid grid-cols-2 gap-2">
                    {FONT_PRESETS.map((font) => {
                        const active = fontFamily === font.value;
                        return (
                            <button
                                key={font.name}
                                onClick={() => setFontFamily(font.value)}
                                className={clsx(
                                    "py-2 px-3.5 rounded-xl border text-xs text-left font-semibold transition-all",
                                    active 
                                        ? "bg-chrome-surface-solid border-chrome-accent text-chrome-accent" 
                                        : "border-chrome-border hover:bg-chrome-surface-hover text-chrome-text-secondary"
                                )}
                                style={{ fontFamily: font.value }}
                            >
                                {font.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Layout Density */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-chrome-text-muted">Sidebar Style</label>
                    <select
                        value={sidebarStyle}
                        onChange={(e) => setSidebarStyle(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-chrome-surface-hover border border-chrome-border text-xs outline-none"
                    >
                        <option value="glass">Glassmorphic (Frosted Blur)</option>
                        <option value="solid">Solid Canvas</option>
                        <option value="minimal">Minimal Borders Only</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-chrome-text-muted">Density Profile</label>
                    <select
                        value={densityMode}
                        onChange={(e) => setDensityMode(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-chrome-surface-hover border border-chrome-border text-xs outline-none"
                    >
                        <option value="comfortable">Comfortable (Arc Default)</option>
                        <option value="compact">Compact (High Information Density)</option>
                    </select>
                </div>
            </div>

            {/* Window Layout Style */}
            <div className="space-y-3 bg-chrome-surface border border-chrome-border rounded-2xl p-4">
                <div>
                    <label className="text-xs font-semibold text-chrome-text-muted">Chrome Layout Style</label>
                    <p className="text-[10px] text-chrome-text-secondary/70">Choose the browser frame aesthetic: unified minimalist panels or floating cards.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { id: 'dia-minimal', name: 'Dia Minimalist (Unified)', desc: 'Seamless full-bleed canvas, flat panels & divider lines' },
                        { id: 'arc-floating', name: 'Arc Floating (Classic)', desc: 'Floating rounded-corner cards with margins and drop shadows' }
                    ].map((styleOpt) => {
                        const active = chromeLayoutStyle === styleOpt.id;
                        return (
                            <button
                                key={styleOpt.id}
                                onClick={() => setChromeLayoutStyle(styleOpt.id as any)}
                                className={clsx(
                                    "flex flex-col gap-1 p-3 rounded-xl border text-left transition-all",
                                    active 
                                        ? "bg-chrome-surface-solid border-chrome-accent shadow-sm" 
                                        : "border-chrome-border hover:bg-chrome-surface-hover hover:border-chrome-border text-chrome-text-secondary"
                                )}
                            >
                                <span className={clsx("text-xs font-semibold", active ? "text-chrome-accent" : "text-chrome-text")}>{styleOpt.name}</span>
                                <span className="text-[9px] text-chrome-text-secondary/70 leading-relaxed">{styleOpt.desc}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Animations intensity config */}
            <div className="space-y-2">
                <label className="text-xs font-semibold text-chrome-text-muted">Interface Animations</label>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { id: 'none', label: 'Static (Disable Animations)' },
                        { id: 'subtle', label: 'Balanced (Calm Transitions)' },
                        { id: 'full', label: 'Expressive (Spring Physics)' }
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => setAnimationIntensity(opt.id as any)}
                            className={clsx(
                                "py-2 px-3 rounded-xl border text-xs font-semibold transition-all",
                                animationIntensity === opt.id 
                                    ? "bg-chrome-surface-solid border-chrome-accent text-chrome-accent" 
                                    : "border-chrome-border hover:bg-chrome-surface-hover text-chrome-text-secondary"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

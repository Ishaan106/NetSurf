import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { isMacOS } from '@/utils/helpers';

type Theme = 'light' | 'dark';
type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
    theme: Theme;
    preference: ThemePreference;
    setPreference: (preference: ThemePreference) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
    children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
    const preference = useSettingsStore((s) => s.themePreference);
    const setPreference = useSettingsStore((s) => s.setThemePreference);
    const accentColor = useSettingsStore((s) => s.accentColor);
    const transparency = useSettingsStore((s) => s.transparency);
    const fontFamily = useSettingsStore((s) => s.fontFamily);
    const sidebarStyle = useSettingsStore((s) => s.sidebarStyle);
    const workspaces = useSettingsStore((s) => s.workspaces);
    const activeWorkspaceId = useSettingsStore((s) => s.activeWorkspaceId);

    const themePreset = useSettingsStore((s) => s.themePreset);

    const [theme, setTheme] = useState<Theme>('dark');

    // Resolve actual theme from preference
    const resolveTheme = useCallback(async () => {
        if (preference === 'system') {
            if (window.electronAPI?.theme) {
                const systemTheme = await window.electronAPI.theme.get();
                setTheme(systemTheme);
            } else {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                setTheme(isDark ? 'dark' : 'light');
            }
        } else {
            setTheme(preference);
        }
    }, [preference]);

    // Initialize theme
    useEffect(() => {
        resolveTheme();
    }, [resolveTheme]);

    // Sync theme preference with Electron main process
    useEffect(() => {
        if (window.electronAPI?.theme) {
            window.electronAPI.theme.set(preference);
        }
    }, [preference]);

    // Listen for system theme changes
    useEffect(() => {
        if (window.electronAPI?.theme) {
            window.electronAPI.theme.onChange((newTheme) => {
                if (preference === 'system') {
                    setTheme(newTheme);
                }
            });
        } else {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = (e: MediaQueryListEvent) => {
                if (preference === 'system') {
                    setTheme(e.matches ? 'dark' : 'light');
                }
            };
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        }
    }, [preference]);

    // Apply theme and preset classes to document
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);

        // Clean up and apply preset class
        const classesToRemove = Array.from(root.classList).filter(c => c.startsWith('theme-preset-'));
        classesToRemove.forEach(c => root.classList.remove(c));
        root.classList.add(`theme-preset-${themePreset}`);
    }, [theme, themePreset]);

    // Apply dynamic variables for accents, fonts, transparency, and style
    useEffect(() => {
        const root = document.documentElement;

        // Find active workspace color, fallback to settings accent color
        const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
        const currentAccentColor = activeWorkspace ? activeWorkspace.color : accentColor;

        // Helpers to parse and extract solid & transparent colors
        const extractSolidColor = (colorStr: string) => {
            if (!colorStr) return '#6c5ce7';
            const hexMatch = colorStr.match(/#[0-9a-fA-F]{3,8}/);
            if (hexMatch) return hexMatch[0];
            const rgbMatch = colorStr.match(/rgba?\(.*?\)/);
            if (rgbMatch) return rgbMatch[0];
            return colorStr;
        };

        const getLightAccent = (solidColor: string) => {
            if (solidColor.startsWith('#')) {
                let hex = solidColor.substring(1);
                if (hex.length === 3) {
                    hex = hex.split('').map(c => c + c).join('');
                }
                if (hex.length === 6) {
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    return `rgba(${r}, ${g}, ${b}, 0.15)`;
                }
            }
            return 'rgba(108, 92, 231, 0.15)';
        };

        const getGlowAccent = (solidColor: string, isDark: boolean) => {
            if (solidColor.startsWith('#')) {
                let hex = solidColor.substring(1);
                if (hex.length === 3) {
                    hex = hex.split('').map(c => c + c).join('');
                }
                if (hex.length === 6) {
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    return `rgba(${r}, ${g}, ${b}, ${isDark ? 0.24 : 0.12})`;
                }
            }
            return isDark ? 'rgba(162, 155, 254, 0.3)' : 'rgba(108, 92, 231, 0.12)';
        };

        const solidAccent = extractSolidColor(currentAccentColor);
        const lightAccent = getLightAccent(solidAccent);
        const glowAccent = getGlowAccent(solidAccent, theme === 'dark');

        // Extract RGB values for custom transparent variants in CSS
        const parseRgb = (colorStr: string): [number, number, number] => {
            let r = 108, g = 92, b = 231;
            if (colorStr.startsWith('#')) {
                let hex = colorStr.substring(1);
                if (hex.length === 3) {
                    hex = hex.split('').map(c => c + c).join('');
                }
                if (hex.length === 6) {
                    r = parseInt(hex.substring(0, 2), 16);
                    g = parseInt(hex.substring(2, 4), 16);
                    b = parseInt(hex.substring(4, 6), 16);
                }
            } else if (colorStr.startsWith('rgb')) {
                const matches = colorStr.match(/\d+/g);
                if (matches && matches.length >= 3) {
                    r = parseInt(matches[0]);
                    g = parseInt(matches[1]);
                    b = parseInt(matches[2]);
                }
            }
            return [r, g, b];
        };

        const [r1, g1, b1] = parseRgb(solidAccent);

        let endSolidAccent = solidAccent;
        if (currentAccentColor.startsWith('linear-gradient')) {
            const hexes = currentAccentColor.match(/#[0-9a-fA-F]{3,8}/g);
            if (hexes && hexes.length >= 2) {
                endSolidAccent = hexes[1];
            }
        }
        const [r2, g2, b2] = parseRgb(endSolidAccent);

        // Apply Dynamic Accents to root
        root.style.setProperty('--chrome-accent', solidAccent);
        root.style.setProperty('--chrome-accent-hover', solidAccent);
        root.style.setProperty('--chrome-accent-light', lightAccent);
        root.style.setProperty('--chrome-accent-glow', glowAccent);
        root.style.setProperty('--chrome-accent-gradient', currentAccentColor);
        root.style.setProperty('--chrome-accent-rgb', `${r1}, ${g1}, ${b1}`);
        root.style.setProperty('--chrome-accent-end-rgb', `${r2}, ${g2}, ${b2}`);

        // Force sidebar to be transparent/blended with outer canvas as requested by user
        root.style.setProperty('--sidebar-transparency', '0%');
        root.style.setProperty('--sidebar-bg', 'transparent');
        root.style.setProperty('--sidebar-border', 'transparent');
        root.style.setProperty('--sidebar-blur', '0px');

        // Dynamic Titlebar Height based on platform
        root.style.setProperty('--titlebar-height', isMacOS() ? '74px' : '44px');

        // Font Family
        root.style.setProperty('--font-sans', `'${fontFamily}', var(--font-sans-fallback)`);
    }, [accentColor, transparency, fontFamily, sidebarStyle, theme, workspaces, activeWorkspaceId]);

    const handleSetPreference = useCallback((newPreference: ThemePreference) => {
        setPreference(newPreference);
    }, [setPreference]);

    const toggleTheme = useCallback(() => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        handleSetPreference(newTheme);
    }, [theme, handleSetPreference]);

    return (
        <ThemeContext.Provider
            value={{
                theme,
                preference,
                setPreference: handleSetPreference,
                toggleTheme,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

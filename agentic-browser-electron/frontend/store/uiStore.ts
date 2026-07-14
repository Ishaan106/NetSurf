import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

type PanelType = 'agent' | 'downloads' | 'settings' | 'history' | null;
type ModalType = 'permission' | 'agentApproval' | 'shortcutConfig' | null;
export type AgentMode = 'chat' | 'research';

interface ModalData {
    type: ModalType;
    props?: Record<string, unknown>;
}

interface UIState {
    // Panels
    activePanel: PanelType;
    isPanelOpen: boolean;

    // Modals
    activeModal: ModalData | null;

    // Address bar
    isAddressBarFocused: boolean;
    addressBarValue: string;

    // Context menus
    contextMenu: {
        isOpen: boolean;
        x: number;
        y: number;
        items: ContextMenuItem[];
    };

    // Tooltips
    tooltip: {
        isVisible: boolean;
        content: string;
        x: number;
        y: number;
    };

    // Sidebar (for macOS-like layout)
    isSidebarCollapsed: boolean;

    // Window state
    isMaximized: boolean;

    // Loading states
    isGlobalLoading: boolean;

    // Deep Research
    isDeepResearchOpen: boolean;

    // Agent mode
    agentMode: AgentMode;

    // In-app Settings Overlay
    isSettingsOpen: boolean;
}

export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: string;
    shortcut?: string;
    disabled?: boolean;
    danger?: boolean;
    separator?: boolean;
    onClick?: () => void;
}

interface UIActions {
    // Panels
    openPanel: (panel: PanelType) => void;
    closePanel: () => void;
    togglePanel: (panel: PanelType) => void;

    // Modals
    openModal: (type: ModalType, props?: Record<string, unknown>) => void;
    closeModal: () => void;

    // Address bar
    focusAddressBar: () => void;
    blurAddressBar: () => void;
    setAddressBarValue: (value: string) => void;

    // Context menu
    openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
    closeContextMenu: () => void;

    // Tooltip
    showTooltip: (content: string, x: number, y: number) => void;
    hideTooltip: () => void;

    // Sidebar
    toggleSidebar: () => void;

    // Window
    setMaximized: (isMaximized: boolean) => void;

    // Loading
    setGlobalLoading: (isLoading: boolean) => void;

    // Deep Research
    openDeepResearch: () => void;
    closeDeepResearch: () => void;
    toggleDeepResearch: () => void;

    // Agent mode
    setAgentMode: (mode: AgentMode) => void;

    // Settings overlay
    openSettings: () => void;
    closeSettings: () => void;
    toggleSettings: () => void;
}

export type UIStore = UIState & UIActions;

const initialState: UIState = {
    activePanel: null,
    isPanelOpen: false,
    activeModal: null,
    isAddressBarFocused: false,
    addressBarValue: '',
    contextMenu: { isOpen: false, x: 0, y: 0, items: [] },
    tooltip: { isVisible: false, content: '', x: 0, y: 0 },
    isSidebarCollapsed: false,
    isMaximized: false,
    isGlobalLoading: false,
    isDeepResearchOpen: false,
    agentMode: 'research' as AgentMode,
    isSettingsOpen: false,
};

export const useUIStore = create<UIStore>()(
    devtools(
        (set) => ({
            ...initialState,

            openPanel: (panel) => {
                set({ activePanel: panel, isPanelOpen: true });
            },

            closePanel: () => {
                set({ isPanelOpen: false });
                // Delay clearing panel type for animation (matches 180ms exit duration)
                setTimeout(() => {
                    set((state) => (state.isPanelOpen ? state : { activePanel: null }));
                }, 190);
            },

            togglePanel: (panel) => {
                set((state) => {
                    if (state.activePanel === panel && state.isPanelOpen) {
                        return { isPanelOpen: false };
                    }
                    return { activePanel: panel, isPanelOpen: true };
                });
            },

            openModal: (type, props) => {
                set({ activeModal: { type, props } });
            },

            closeModal: () => {
                set({ activeModal: null });
            },

            focusAddressBar: () => {
                set({ isAddressBarFocused: true });
            },

            blurAddressBar: () => {
                set({ isAddressBarFocused: false });
            },

            setAddressBarValue: (value) => {
                set({ addressBarValue: value });
            },

            openContextMenu: (x, y, items) => {
                set({ contextMenu: { isOpen: true, x, y, items } });
            },

            closeContextMenu: () => {
                set({ contextMenu: { isOpen: false, x: 0, y: 0, items: [] } });
            },

            showTooltip: (content, x, y) => {
                set({ tooltip: { isVisible: true, content, x, y } });
            },

            hideTooltip: () => {
                set({ tooltip: { isVisible: false, content: '', x: 0, y: 0 } });
            },

            toggleSidebar: () => {
                set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
            },

            setMaximized: (isMaximized) => {
                set({ isMaximized });
            },

            setGlobalLoading: (isLoading) => {
                set({ isGlobalLoading: isLoading });
            },

            openDeepResearch: () => {
                set({ isDeepResearchOpen: true, isPanelOpen: false });
            },

            closeDeepResearch: () => {
                set({ isDeepResearchOpen: false });
            },

            toggleDeepResearch: () => {
                set((state) => ({
                    isDeepResearchOpen: !state.isDeepResearchOpen,
                    ...(state.isDeepResearchOpen ? {} : { isPanelOpen: false }),
                }));
            },

            setAgentMode: (mode) => {
                set({ agentMode: mode });
            },

            openSettings: () => {
                set({ isSettingsOpen: true });
            },

            closeSettings: () => {
                set({ isSettingsOpen: false });
            },

            toggleSettings: () => {
                set((state) => ({ isSettingsOpen: !state.isSettingsOpen }));
            },
        }),
        { name: 'UIStore' }
    )
);

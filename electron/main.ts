import { app, BrowserWindow, ipcMain, nativeTheme, session, dialog, nativeImage, Menu, desktopCapturer } from 'electron';
import path from 'path';

// Import ad blocker service
import { initializeAdBlocker } from '../backend/adblocker';

// Import modular IPC registrations
import { registerSettingsIPC } from './ipc/settingsIPC';
import { registerEkoIPC } from './ipc/ekoIPC';
import { registerAdblockIPC } from './ipc/adblockIPC';
import { registerRecorderIPC } from './ipc/recorderIPC';
import { registerVoiceIPC } from './ipc/voiceIPC';

// ============ CHROMIUM FLAGS FOR SCREEN CAPTURE ============
// These must be set before app.whenReady()
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('auto-select-desktop-capture-source', 'Entire screen');
app.commandLine.appendSwitch('enable-features', 'DesktopCaptureaudio');
// GPU acceleration for capture
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// Disable features that cause errors or crashes
app.commandLine.appendSwitch('disable-features', 'PictureInPicture,DocumentPictureInPictureAPI,AutofillServerCommunication');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

// Debug logging
const DEBUG = false;
const log = (...args: any[]) => { if (DEBUG) console.log(...args); };

const TITLEBAR_OVERLAY_HEIGHT = 32;
const getTitleBarOverlayColor = () => 'rgba(0, 0, 0, 0)';

let mainWindow: BrowserWindow | null = null;
let ipcHandlersRegistered = false; // Track if IPC handlers are registered to prevent duplicates
let isCreatingWindow = false; // Guard against infinite window creation loop
let shortcutsRegistered = false; // Track if shortcuts are registered (only once per app)

const createWindow = (isNewWindow: boolean = false) => {
    // Remove native application menu
    Menu.setApplicationMenu(null);

    // Create the browser window with native frame
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        frame: true, // Native OS frame with system min/max/close
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: getTitleBarOverlayColor(),
            symbolColor: nativeTheme.shouldUseDarkColors ? '#edf0f7' : '#111318',
            height: TITLEBAR_OVERLAY_HEIGHT
        },
        backgroundColor: '#00000000',
        backgroundMaterial: 'acrylic',
        vibrancy: 'under-window',
        visualEffectState: 'active',
        icon: nativeImage.createFromPath(path.join(__dirname, '../../public/netsurf.png')),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,   // Uses contextBridge
            sandbox: false,           // Required for webviewTag
            webviewTag: true,         // Enable webview for browser tabs
        },
    });

    // Load the app
    const isDev = !app.isPackaged || process.env.npm_lifecycle_event === 'electron:start' || process.env.npm_lifecycle_event === 'dev';
    const isDebug = process.argv.includes('--debug');
    log('App starting...', { isPackaged: app.isPackaged, isDev, isNewWindow, isDebug });

    // Append ?newWindow=true to reset tabs in new windows
    const urlSuffix = isNewWindow ? '?newWindow=true' : '';

    if (isDev) {
        mainWindow.loadURL(`http://localhost:5173${urlSuffix}`);
        if (isDebug) {
            mainWindow.webContents.openDevTools();
        }
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
            query: isNewWindow ? { newWindow: 'true' } : {}
        });
    }

    // Only register IPC handlers once (not on every window creation)
    if (!ipcHandlersRegistered) {
        ipcHandlersRegistered = true;

        // Window controls
        ipcMain.on('window:minimize', (event) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            win?.minimize();
        });
        ipcMain.on('window:maximize', (event) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win?.isMaximized()) {
                win.unmaximize();
            } else {
                win?.maximize();
            }
        });
        ipcMain.on('window:close', (event) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            win?.close();
        });

        ipcMain.on('window:toggleFullScreen', (event) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win) {
                const newState = !win.isFullScreen();
                win.setFullScreen(newState);
                win.webContents.send('window:fullscreen-change', newState);
            }
        });

        ipcMain.handle('window:isMaximized', (event) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            return win?.isMaximized();
        });

        ipcMain.handle('window:isFullScreen', (event) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            return win?.isFullScreen() || false;
        });

        // Dialogs
        ipcMain.handle('dialog:showSaveDialog', async (_, options: any) => {
            return dialog.showSaveDialog(mainWindow!, options);
        });

        ipcMain.handle('dialog:showOpenDialog', async (_, options: any) => {
            return dialog.showOpenDialog(mainWindow!, options);
        });

        // Theme handling
        ipcMain.handle('theme:get', () => {
            return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
        });

        ipcMain.handle('theme:set', (_, theme: 'light' | 'dark' | 'system') => {
            nativeTheme.themeSource = theme;
            const isDark = nativeTheme.shouldUseDarkColors;
            mainWindow?.setTitleBarOverlay?.({
                color: getTitleBarOverlayColor(),
                symbolColor: isDark ? '#edf0f7' : '#111318',
                height: TITLEBAR_OVERLAY_HEIGHT
            });
            return isDark ? 'dark' : 'light';
        });

        // Platform info
        ipcMain.handle('platform:get', () => process.platform);

        // Webview Context Menu IPC Handler
        ipcMain.on('webview:show-context-menu', (event, params) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (!win) return;

            const { MenuItem } = require('electron');
            const menu = new Menu();

            // 1. Link items
            if (params.linkURL) {
                menu.append(new MenuItem({
                    label: 'Open Link in New Tab',
                    click: () => {
                        win.webContents.send('webview:open-link-new-tab', params.linkURL);
                    }
                }));
                menu.append(new MenuItem({
                    label: 'Copy Link Address',
                    click: () => {
                        const { clipboard } = require('electron');
                        clipboard.writeText(params.linkURL);
                    }
                }));
                menu.append(new MenuItem({ type: 'separator' }));
            }

            // 2. Selection text items
            if (params.selectionText) {
                menu.append(new MenuItem({
                    label: `Search Google for "${params.selectionText.length > 20 ? params.selectionText.substring(0, 20) + '...' : params.selectionText}"`,
                    click: () => {
                        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`;
                        win.webContents.send('webview:open-link-new-tab', searchUrl);
                    }
                }));
                menu.append(new MenuItem({
                    label: 'Copy Selection',
                    role: 'copy'
                }));
                menu.append(new MenuItem({ type: 'separator' }));
            }

            // 3. Media items
            if (params.mediaType === 'image' && params.srcURL) {
                menu.append(new MenuItem({
                    label: 'Copy Image Address',
                    click: () => {
                        const { clipboard } = require('electron');
                        clipboard.writeText(params.srcURL);
                    }
                }));
                menu.append(new MenuItem({ type: 'separator' }));
            }

            // 4. Standard Page items
            if (!params.linkURL && !params.selectionText && params.mediaType !== 'image') {
                menu.append(new MenuItem({
                    label: 'Back',
                    click: () => {
                        win.webContents.send('webview:action-back', params.id);
                    }
                }));
                menu.append(new MenuItem({
                    label: 'Forward',
                    click: () => {
                        win.webContents.send('webview:action-forward', params.id);
                    }
                }));
                menu.append(new MenuItem({
                    label: 'Reload',
                    click: () => {
                        win.webContents.send('webview:action-reload', params.id);
                    }
                }));
                menu.append(new MenuItem({ type: 'separator' }));
            }

            // 5. Editable items
            if (params.isEditable) {
                menu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
                menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
                menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
                menu.append(new MenuItem({ type: 'separator' }));
            }

            // 6. Inspect element
            menu.append(new MenuItem({
                label: 'Inspect Element',
                click: () => {
                    win.webContents.send('webview:action-inspect', { id: params.id, x: params.x, y: params.y });
                }
            }));

            menu.popup({ window: win });
        });

        // Destroy webContents to free memory when tab is closed
        ipcMain.on('tabs:destroyWebContents', (_, webContentsId: number) => {
            try {
                const { webContents } = require('electron');
                const wc = webContents.fromId(webContentsId);
                if (wc && !wc.isDestroyed()) {
                    // Stop any media playback
                    wc.executeJavaScript(
                        `try { document.querySelectorAll('video,audio').forEach(m => { m.pause(); m.src=''; }); } catch(e) {}`
                    ).catch(() => {});
                    // Let GC handle it — we just stop holding the reference
                    wc.forcefullyCrashRenderer?.();
                }
            } catch (e) {
                // Silently ignore if already destroyed
            }
        });

        // Register domain-specific modular IPC handlers
        const getMainWindowRef = () => mainWindow;
        registerSettingsIPC();
        registerEkoIPC(getMainWindowRef);
        registerAdblockIPC();
        registerRecorderIPC(getMainWindowRef);
        registerVoiceIPC(getMainWindowRef);
    }

    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window:maximized', true);
    });

    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window:maximized', false);
    });

    // Setup app-level shortcut management (only once)
    if (!shortcutsRegistered) {
        shortcutsRegistered = true;

        const { globalShortcut } = require('electron');

        const shortcuts: Array<{ accelerator: string; channel: string }> = [
            { accelerator: 'CommandOrControl+T', channel: 'shortcut:newTab' },
            { accelerator: 'CommandOrControl+W', channel: 'shortcut:closeTab' },
            { accelerator: 'CommandOrControl+Shift+T', channel: 'shortcut:reopenTab' },
            { accelerator: 'Control+Tab', channel: 'shortcut:nextTab' },
            { accelerator: 'Control+Shift+Tab', channel: 'shortcut:prevTab' },
            { accelerator: 'CommandOrControl+H', channel: 'shortcut:history' },
            { accelerator: 'CommandOrControl+Shift+V', channel: 'shortcut:toggleVerticalMode' },
            { accelerator: 'CommandOrControl+R', channel: 'shortcut:reload' },
            { accelerator: 'F5', channel: 'shortcut:reload' },
            { accelerator: 'Alt+Left', channel: 'shortcut:goBack' },
            { accelerator: 'Alt+Right', channel: 'shortcut:goForward' },
            { accelerator: 'CommandOrControl+B', channel: 'shortcut:toggleSidebar' },
        ];

        const doRegisterShortcuts = () => {
            shortcuts.forEach(({ accelerator, channel }) => {
                try {
                    if (!globalShortcut.isRegistered(accelerator)) {
                        globalShortcut.register(accelerator, () => {
                            const win = BrowserWindow.getFocusedWindow();
                            if (win) win.webContents.send(channel);
                        });
                    }
                } catch (e) { }
            });

            if (!globalShortcut.isRegistered('CommandOrControl+N')) {
                globalShortcut.register('CommandOrControl+N', () => {
                    if (!isCreatingWindow && BrowserWindow.getFocusedWindow()) {
                        isCreatingWindow = true;
                        createWindow(true);
                        setTimeout(() => { isCreatingWindow = false; }, 500);
                    }
                });
            }
        };

        const doUnregisterShortcuts = () => {
            globalShortcut.unregisterAll();
        };

        app.on('browser-window-focus', () => {
            doRegisterShortcuts();
            log('[Shortcuts] App window focused - shortcuts active');
        });

        app.on('browser-window-blur', () => {
            setTimeout(() => {
                if (!BrowserWindow.getFocusedWindow()) {
                    doUnregisterShortcuts();
                    log('[Shortcuts] No app windows focused - shortcuts released');
                }
            }, 100);
        });

        if (BrowserWindow.getFocusedWindow()) {
            doRegisterShortcuts();
        }

        log('[Shortcuts] App-level shortcut management initialized');
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

nativeTheme.on('updated', () => {
    const isDark = nativeTheme.shouldUseDarkColors;
    mainWindow?.webContents.send('theme:changed', isDark ? 'dark' : 'light');
    mainWindow?.setTitleBarOverlay?.({
        color: getTitleBarOverlayColor(),
        symbolColor: isDark ? '#edf0f7' : '#111318',
        height: TITLEBAR_OVERLAY_HEIGHT
    });
});

app.whenReady().then(async () => {
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.netsurf.browser');
    }

    // Initialize ad blocker before creating window
    await initializeAdBlocker();

    createWindow();

    const webviewSession = session.fromPartition('persist:default');
    const deniedPermissions = new Set(['window-management', 'window-placement']);

    webviewSession.setPermissionCheckHandler((_, permission) =>
        !deniedPermissions.has(permission)
    );

    webviewSession.setPermissionRequestHandler((_, permission, callback) => {
        callback(!deniedPermissions.has(permission));
    });

    webviewSession.setDisplayMediaRequestHandler((request, callback) => {
        log('[DisplayMedia] Screen share requested');
        log('[DisplayMedia] Request frame:', request.frame?.url);

        desktopCapturer.getSources({ types: ['screen'] }).then((sources: Electron.DesktopCapturerSource[]) => {
            if (sources.length > 0) {
                const source = sources[0];
                log('[DisplayMedia] ✅ Auto-selecting screen:', source.name, 'ID:', source.id);
                callback({ video: source });
            } else {
                log('[DisplayMedia] ❌ No screens available');
                callback({});
            }
        }).catch((error: any) => {
            console.error('[DisplayMedia] Error getting sources:', error);
            callback({});
        });
    });

    log('[Permissions] Session permission handlers configured');

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

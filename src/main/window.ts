import { app, BrowserWindow, screen, session } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppPaths } from './paths';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

export class WindowController {
  private window: BrowserWindow | null = null;
  private isQuitting = false;
  private state: WindowState;
  private stateSaveTimeout: NodeJS.Timeout | null = null;

  constructor(private paths: AppPaths) {
    this.state = this.loadWindowState();

    app.on('before-quit', () => {
      this.isQuitting = true;
    });

    process.on('SIGTERM', () => {
      this.isQuitting = true;
      app.quit();
    });

    process.on('SIGINT', () => {
      this.isQuitting = true;
      app.quit();
    });
  }

  public getMainWindow(): BrowserWindow | null {
    return this.window;
  }

  public createWindow(startHidden = false): BrowserWindow {
    const partitionSession = session.fromPartition('persist:whatsapp-session');

    const win = new BrowserWindow({
      title: 'WhatsApp',
      x: this.state.x,
      y: this.state.y,
      width: this.state.width,
      height: this.state.height,
      minWidth: 600,
      minHeight: 500,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#111b21', // WhatsApp Web Dark background to prevent white flash
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        webviewTag: false,
        navigateOnDragDrop: false,
        session: partitionSession,
        preload: path.join(__dirname, '../preload/index.js'),
        spellcheck: true,
        backgroundThrottling: false,
      },
    });

    this.window = win;

    if (this.state.isMaximized) {
      win.maximize();
    }

    this.trackWindowState(win);

    // Window close -> hide to tray unless explicitly quitting
    win.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        win.hide();
      }
    });

    // Custom user agent: clean modern Chrome on Linux (strip Electron and wrapper tokens)
    const chromeVersion = process.versions.chrome || '130.0.0.0';
    const cleanUserAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    partitionSession.setUserAgent(cleanUserAgent);
    win.webContents.setUserAgent(cleanUserAgent);

    // Diagnostics: capture console messages from WhatsApp Web
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        console.warn(`[WhatsApp Console] [level ${level}] ${message} (${sourceId}:${line})`);
      }
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[WhatsApp FailLoad] ${errorCode}: ${errorDescription} on ${validatedURL}`);
    });

    // DevTools shortcut (F12 or Ctrl+Shift+I)
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))
      ) {
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
    });

    // Load WhatsApp Web with clean User-Agent
    win.loadURL('https://web.whatsapp.com', { userAgent: cleanUserAgent });

    win.once('ready-to-show', () => {
      if (!startHidden) {
        win.show();
        win.focus();
      }
    });

    return win;
  }

  public toggleVisibility(): void {
    if (!this.window) return;

    if (this.window.isVisible()) {
      if (this.window.isFocused()) {
        this.window.hide();
      } else {
        this.restoreAndFocus();
      }
    } else {
      this.restoreAndFocus();
    }
  }

  public restoreAndFocus(): void {
    if (!this.window) return;

    if (this.window.isMinimized()) {
      this.window.restore();
    }
    this.window.show();
    this.window.focus();
    this.window.flashFrame(true);
  }

  public forceQuit(): void {
    this.isQuitting = true;
    app.quit();
  }

  private trackWindowState(win: BrowserWindow): void {
    const update = () => {
      if (!win.isMaximized() && !win.isMinimized()) {
        const bounds = win.getBounds();
        this.state.x = bounds.x;
        this.state.y = bounds.y;
        this.state.width = bounds.width;
        this.state.height = bounds.height;
      }
      this.state.isMaximized = win.isMaximized();
      this.debounceSaveState();
    };

    win.on('resize', update);
    win.on('move', update);
    win.on('close', update);
  }

  private debounceSaveState(): void {
    if (this.stateSaveTimeout) clearTimeout(this.stateSaveTimeout);
    this.stateSaveTimeout = setTimeout(() => {
      try {
        fs.writeFileSync(this.paths.windowStateFile, JSON.stringify(this.state, null, 2), 'utf8');
      } catch (err) {
        console.error('[WindowController] Failed to save window state:', err);
      }
    }, 500);
  }

  private loadWindowState(): WindowState {
    const defaultState: WindowState = { width: 1100, height: 750, isMaximized: false };
    try {
      if (!fs.existsSync(this.paths.windowStateFile)) return defaultState;
      const parsed: WindowState = JSON.parse(fs.readFileSync(this.paths.windowStateFile, 'utf8'));

      if (parsed.x !== undefined && parsed.y !== undefined) {
        const displays = screen.getAllDisplays();
        const isVisible = displays.some((d) => {
          const area = d.workArea;
          return (
            parsed.x! >= area.x - 20 &&
            parsed.y! >= area.y - 20 &&
            parsed.x! + parsed.width <= area.x + area.width + 20 &&
            parsed.y! + parsed.height <= area.y + area.height + 20
          );
        });

        if (!isVisible) {
          delete parsed.x;
          delete parsed.y;
        }
      }

      return { ...defaultState, ...parsed };
    } catch {
      return defaultState;
    }
  }
}

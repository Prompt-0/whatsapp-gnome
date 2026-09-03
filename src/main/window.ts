import { app, BrowserWindow, screen, session } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { XdgDirectories } from './xdg';

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

  constructor(private dirs: XdgDirectories) {
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
        disableBlinkFeatures: 'Auxclick',
        session: partitionSession,
        partition: 'persist:whatsapp-session',
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

    // Custom user agent: modern Chrome on Linux for 100% WhatsApp Web feature parity
    const defaultUserAgent = win.webContents.getUserAgent();
    const chromeUserAgent = defaultUserAgent.replace(/whatsapp-gnome\/[0-9.-]+ /i, '');
    win.webContents.setUserAgent(chromeUserAgent);

    // Load WhatsApp Web
    win.loadURL('https://web.whatsapp.com');

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
        fs.writeFileSync(this.dirs.windowStateFile, JSON.stringify(this.state, null, 2), 'utf8');
      } catch (err) {
        console.error('[WindowController] Failed to save window state:', err);
      }
    }, 500);
  }

  private loadWindowState(): WindowState {
    const defaultState: WindowState = { width: 1100, height: 750, isMaximized: false };
    try {
      if (!fs.existsSync(this.dirs.windowStateFile)) return defaultState;
      const parsed: WindowState = JSON.parse(fs.readFileSync(this.dirs.windowStateFile, 'utf8'));

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

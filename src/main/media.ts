import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import { SecurityManager } from './security';

export type PlaybackStatus = 'Playing' | 'Paused' | 'Stopped';

export class MediaController {
  private currentStatus: PlaybackStatus = 'Stopped';

  constructor(private getMainWindow: () => BrowserWindow | null) {
    this.registerGlobalShortcuts();
    this.registerIpcHandlers();
  }

  public getPlaybackStatus(): PlaybackStatus {
    return this.currentStatus;
  }

  private registerGlobalShortcuts(): void {
    app.whenReady().then(() => {
      // Hardware Play/Pause Media Key
      globalShortcut.register('MediaPlayPause', () => {
        this.dispatchCommand('media:toggle-play-pause');
      });

      // Hardware Stop Media Key
      globalShortcut.register('MediaStop', () => {
        this.dispatchCommand('media:stop');
      });

      // Hardware Next / Skip Media Key (e.g. advance to next voice note)
      globalShortcut.register('MediaNextTrack', () => {
        this.dispatchCommand('media:next-track');
      });

      // Hardware Previous Media Key
      globalShortcut.register('MediaPreviousTrack', () => {
        this.dispatchCommand('media:previous-track');
      });
    });

    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
    });
  }

  private dispatchCommand(channel: string): void {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel);
    }
  }

  private registerIpcHandlers(): void {
    ipcMain.on('media:playback-state', (event, { status }: { status: PlaybackStatus }) => {
      if (!SecurityManager.isTrustedSender(event.senderFrame)) {
        return;
      }
      this.currentStatus = status;
    });
  }
}

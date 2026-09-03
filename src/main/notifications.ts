import { app, BrowserWindow, ipcMain, nativeImage, Notification } from 'electron';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { InterceptedNotification, SoundMode } from '../common/types';
import { TrayManager } from './tray';
import { WindowController } from './window';
import { XdgDirectories } from './xdg';
import { SecurityManager } from './security';

export class NotificationManager {
  private activeNotifications: Map<string, Notification> = new Map();
  private tagMap: Map<string, string> = new Map();
  private soundMode: SoundMode = 'WHATSAPP_ONLY';

  constructor(
    private windowController: WindowController,
    private trayManager: TrayManager,
    private dirs: XdgDirectories,
    private defaultIconPath: string
  ) {
    this.registerIpcHandlers();
  }

  public setSoundMode(mode: SoundMode): void {
    this.soundMode = mode;
  }

  public getSoundMode(): SoundMode {
    return this.soundMode;
  }

  private registerIpcHandlers(): void {
    ipcMain.on('whatsapp:notification-dispatched', async (event, payload: InterceptedNotification) => {
      if (!SecurityManager.isTrustedSender(event.senderFrame)) {
        console.warn('[NotificationManager] Rejected notification from untrusted sender frame');
        return;
      }

      await this.dispatchNativeNotification(payload);
    });

    ipcMain.on(
      'whatsapp:unread-count-changed',
      (event, { count, trayDataUrl }: { count: number; trayDataUrl?: string }) => {
        if (!SecurityManager.isTrustedSender(event.senderFrame)) {
          return;
        }

        this.syncUnreadCount(count, trayDataUrl);
      }
    );
  }

  private async cacheAvatar(iconData?: string): Promise<string | null> {
    if (!iconData) return null;

    try {
      const hash = crypto.createHash('sha256').update(iconData).digest('hex');
      const targetPath = path.join(this.dirs.avatarCacheDir, `${hash}.png`);

      try {
        await fs.access(targetPath);
        return targetPath;
      } catch {
        // Not cached yet
      }

      if (iconData.startsWith('data:image/')) {
        const base64Data = iconData.split(',')[1];
        if (!base64Data) return null;
        const buffer = Buffer.from(base64Data, 'base64');
        const tempPath = `${targetPath}.tmp.${Date.now()}`;
        await fs.writeFile(tempPath, buffer);
        await fs.rename(tempPath, targetPath);
        return targetPath;
      }
    } catch (err) {
      console.error('[NotificationManager] Failed to cache avatar:', err);
    }
    return null;
  }

  private async dispatchNativeNotification(payload: InterceptedNotification): Promise<void> {
    if (this.trayManager.getIsMuted() || this.soundMode === 'MUTED') {
      return;
    }

    // Deduplicate existing notification with the same tag
    if (payload.tag && this.tagMap.has(payload.tag)) {
      const prevId = this.tagMap.get(payload.tag)!;
      const prevNotif = this.activeNotifications.get(prevId);
      if (prevNotif) {
        prevNotif.close();
        this.activeNotifications.delete(prevId);
      }
    }

    const cachedAvatarPath = await this.cacheAvatar(payload.icon);
    const iconImage = cachedAvatarPath
      ? nativeImage.createFromPath(cachedAvatarPath)
      : nativeImage.createFromPath(this.defaultIconPath);

    const isSilent = this.soundMode === 'WHATSAPP_ONLY' || Boolean(payload.silent);

    const notif = new Notification({
      title: payload.title || 'WhatsApp',
      body: payload.body || '',
      icon: iconImage,
      urgency: 'normal',
      silent: isSilent,
    });

    notif.on('click', () => {
      this.handleNotificationClick(payload.id);
    });

    notif.on('close', () => {
      this.activeNotifications.delete(payload.id);
      if (payload.tag) this.tagMap.delete(payload.tag);
      const win = this.windowController.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('whatsapp:notification-closed', payload.id);
      }
    });

    this.activeNotifications.set(payload.id, notif);
    if (payload.tag) {
      this.tagMap.set(payload.tag, payload.id);
    }

    notif.show();
  }

  private handleNotificationClick(id: string): void {
    this.windowController.restoreAndFocus();
    const win = this.windowController.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('whatsapp:notification-clicked', id);
    }
  }

  private syncUnreadCount(count: number, trayDataUrl?: string): void {
    // 1. Dash-to-Dock / Unity LauncherEntry D-Bus signal
    app.setBadgeCount(count);

    // 2. Dynamic AppIndicator tray icon
    this.trayManager.updateBadge(count, trayDataUrl);

    // 3. Window title and taskbar flash
    const win = this.windowController.getMainWindow();
    if (win && !win.isDestroyed()) {
      const baseTitle = 'WhatsApp';
      win.setTitle(count > 0 ? `(${count}) ${baseTitle}` : baseTitle);
      win.flashFrame(count > 0);
    }
  }
}

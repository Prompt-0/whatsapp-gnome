import { Menu, MenuItemConstructorOptions, nativeImage, NativeImage, Tray } from 'electron';
import * as path from 'node:path';
import { WindowController } from './window';

export class TrayManager {
  private tray: Tray | null = null;
  private defaultIcon: NativeImage;
  private isMuted = false;
  private unreadCount = 0;

  constructor(
    private windowController: WindowController,
    assetsDir: string
  ) {
    const iconPath = path.join(assetsDir, 'whatsapp-icon.png');
    this.defaultIcon = nativeImage.createFromPath(iconPath);
  }

  public initialize(): Tray {
    if (this.tray) {
      return this.tray;
    }

    this.tray = new Tray(this.defaultIcon);
    this.tray.setToolTip('WhatsApp');

    this.tray.on('click', () => {
      this.windowController.toggleVisibility();
      this.updateContextMenu();
    });

    this.tray.on('double-click', () => {
      this.windowController.restoreAndFocus();
      this.updateContextMenu();
    });

    this.updateContextMenu();
    return this.tray;
  }

  public updateBadge(count: number, trayDataUrl?: string): void {
    if (!this.tray) return;

    this.unreadCount = count;

    if (trayDataUrl && trayDataUrl.startsWith('data:image/png;base64,')) {
      const img = nativeImage.createFromDataURL(trayDataUrl);
      this.tray.setImage(img);
    } else if (count === 0) {
      this.tray.setImage(this.defaultIcon);
    }

    const tip = count > 0 ? `WhatsApp (${count} unread)` : 'WhatsApp';
    this.tray.setToolTip(tip);
    this.updateContextMenu();
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.updateContextMenu();
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public updateContextMenu(): void {
    if (!this.tray) return;

    const win = this.windowController.getMainWindow();
    const isVisible = win ? win.isVisible() : false;

    const template: MenuItemConstructorOptions[] = [
      {
        label: isVisible ? 'Hide WhatsApp' : 'Show WhatsApp',
        click: () => {
          this.windowController.toggleVisibility();
          this.updateContextMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Mute Notifications',
        type: 'checkbox',
        checked: this.isMuted,
        click: (item) => {
          this.isMuted = item.checked;
        },
      },
      { type: 'separator' },
      {
        label: 'Quit WhatsApp',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          this.windowController.forceQuit();
        },
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    this.tray.setContextMenu(menu);
  }
}

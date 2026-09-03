import { app, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SecurityManager } from './security';
import { SettingsManager } from './settings';

export class AutostartManager {
  private autostartDir: string;
  private autostartDesktopFile: string;
  private systemdUserDir: string;
  private systemdServiceFile: string;

  constructor(private settingsManager: SettingsManager) {
    const home = os.homedir();
    this.autostartDir = path.join(home, '.config', 'autostart');
    this.autostartDesktopFile = path.join(this.autostartDir, 'whatsapp-gnome.desktop');
    this.systemdUserDir = path.join(home, '.config', 'systemd', 'user');
    this.systemdServiceFile = path.join(this.systemdUserDir, 'whatsapp-gnome.service');

    this.registerIpcHandlers();
    this.syncInitialState();
  }

  public isAutostartEnabled(): boolean {
    return fs.existsSync(this.autostartDesktopFile) || fs.existsSync(this.systemdServiceFile);
  }

  public setAutostart(enabled: boolean, startHidden = true, useSystemd = false): void {
    if (enabled) {
      this.enableAutostart(startHidden, useSystemd);
    } else {
      this.disableAutostart();
    }
    this.settingsManager.updateSettings({ autostart: enabled, startHidden });
  }

  private enableAutostart(startHidden: boolean, useSystemd: boolean): void {
    const execCmd = this.resolveExecCommand(startHidden);

    if (useSystemd) {
      // Install systemd --user service unit
      fs.mkdirSync(this.systemdUserDir, { recursive: true });
      const serviceContent = [
        '[Unit]',
        'Description=WhatsApp Web GNOME Desktop Client',
        'Documentation=https://web.whatsapp.com',
        'After=graphical-session.target',
        'PartOf=graphical-session.target',
        '',
        '[Service]',
        'Type=exec',
        `ExecStart=${execCmd}`,
        'Restart=on-failure',
        'RestartSec=5s',
        'Slice=app-graphical.slice',
        '',
        '[Install]',
        'WantedBy=graphical-session.target',
        '',
      ].join('\n');

      fs.writeFileSync(this.systemdServiceFile, serviceContent, 'utf8');

      // Also remove desktop autostart to avoid double execution
      if (fs.existsSync(this.autostartDesktopFile)) {
        fs.unlinkSync(this.autostartDesktopFile);
      }
    } else {
      // Install standard XDG autostart .desktop entry
      fs.mkdirSync(this.autostartDir, { recursive: true });
      const desktopContent = [
        '[Desktop Entry]',
        'Type=Application',
        'Version=1.0',
        'Name=WhatsApp',
        'Comment=WhatsApp Web Native GNOME Desktop Client',
        `Exec=${execCmd}`,
        'Icon=whatsapp-gnome',
        'Terminal=false',
        'Categories=Network;InstantMessaging;Chat;',
        'StartupWMClass=whatsapp-gnome',
        'X-GNOME-Autostart-enabled=true',
        // 3-second delay prevents AppIndicator registration race condition on boot
        'X-GNOME-Autostart-Delay=3',
        '',
      ].join('\n');

      fs.writeFileSync(this.autostartDesktopFile, desktopContent, 'utf8');

      // Remove systemd service if present to avoid collision
      if (fs.existsSync(this.systemdServiceFile)) {
        fs.unlinkSync(this.systemdServiceFile);
      }
    }
  }

  private disableAutostart(): void {
    if (fs.existsSync(this.autostartDesktopFile)) {
      try {
        fs.unlinkSync(this.autostartDesktopFile);
      } catch (err) {
        console.error('[AutostartManager] Failed to delete autostart .desktop file:', err);
      }
    }

    if (fs.existsSync(this.systemdServiceFile)) {
      try {
        fs.unlinkSync(this.systemdServiceFile);
      } catch (err) {
        console.error('[AutostartManager] Failed to delete systemd user service:', err);
      }
    }
  }

  private resolveExecCommand(startHidden: boolean): string {
    const flag = startHidden ? '--hidden' : '';

    if (process.env.APPIMAGE) {
      return `${process.env.APPIMAGE} ${flag}`.trim();
    }

    if (!app.isPackaged) {
      return `${process.execPath} ${app.getAppPath()} ${flag}`.trim();
    }

    return `${process.execPath} ${flag}`.trim();
  }

  private syncInitialState(): void {
    const isConfiguredOnDisk = this.isAutostartEnabled();
    const settings = this.settingsManager.getSettings();

    // If config on disk differs from loaded settings, reconcile
    if (settings.autostart && !isConfiguredOnDisk) {
      this.enableAutostart(settings.startHidden, false);
    } else if (!settings.autostart && isConfiguredOnDisk) {
      this.settingsManager.updateSettings({ autostart: true });
    }
  }

  private registerIpcHandlers(): void {
    ipcMain.handle('autostart:get-status', (event) => {
      if (!SecurityManager.isTrustedSender(event.senderFrame)) {
        throw new Error('Unauthorized sender');
      }
      return {
        enabled: this.isAutostartEnabled(),
        desktopFileExists: fs.existsSync(this.autostartDesktopFile),
        systemdFileExists: fs.existsSync(this.systemdServiceFile),
      };
    });

    ipcMain.handle(
      'autostart:set-status',
      (
        event,
        {
          enabled,
          startHidden,
          useSystemd,
        }: { enabled: boolean; startHidden?: boolean; useSystemd?: boolean }
      ) => {
        if (!SecurityManager.isTrustedSender(event.senderFrame)) {
          throw new Error('Unauthorized sender');
        }
        this.setAutostart(enabled, startHidden ?? true, useSystemd ?? false);
        return { enabled: this.isAutostartEnabled() };
      }
    );
  }
}

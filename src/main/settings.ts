import { ipcMain } from 'electron';
import * as fs from 'node:fs';
import { AppSettings } from '../common/types';
import { XdgDirectories } from './xdg';
import { SecurityManager } from './security';

const DEFAULT_SETTINGS: AppSettings = {
  autostart: false,
  startHidden: false,
  closeToTray: true,
  soundMode: 'WHATSAPP_ONLY',
  customTheme: 'auto',
};

export class SettingsManager {
  private settings: AppSettings;

  constructor(private dirs: XdgDirectories) {
    this.settings = this.loadSettings();
    this.registerIpcHandlers();
  }

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...partial };
    this.saveSettings();
    return { ...this.settings };
  }

  private registerIpcHandlers(): void {
    ipcMain.handle('app:get-settings', (event) => {
      if (!SecurityManager.isTrustedSender(event.senderFrame)) {
        throw new Error('Unauthorized sender');
      }
      return this.getSettings();
    });

    ipcMain.handle('app:update-settings', (event, partial: Partial<AppSettings>) => {
      if (!SecurityManager.isTrustedSender(event.senderFrame)) {
        throw new Error('Unauthorized sender');
      }
      return this.updateSettings(partial);
    });
  }

  private loadSettings(): AppSettings {
    try {
      if (!fs.existsSync(this.dirs.configFile)) {
        this.saveSettings(DEFAULT_SETTINGS);
        return { ...DEFAULT_SETTINGS };
      }
      const data = fs.readFileSync(this.dirs.configFile, 'utf8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (err) {
      console.error('[SettingsManager] Failed to load settings, using defaults:', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings(data = this.settings): void {
    try {
      fs.writeFileSync(this.dirs.configFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[SettingsManager] Failed to save settings:', err);
    }
  }
}

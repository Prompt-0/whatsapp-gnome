export type SoundMode = 'WHATSAPP_ONLY' | 'SYSTEM_ONLY' | 'MUTED';

export interface InterceptedNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  silent?: boolean;
}

export interface AppSettings {
  autostart: boolean;
  startHidden: boolean;
  closeToTray: boolean;
  soundMode: SoundMode;
  customTheme: 'auto' | 'dark' | 'light';
}

export interface DesktopBridgeApi {
  dispatchNotification: (data: InterceptedNotification) => void;
  onNotificationClick: (callback: (id: string) => void) => () => void;
  onNotificationClose: (callback: (id: string) => void) => () => void;
  updateBadgeCount: (count: number, trayDataUrl?: string) => void;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  getAutostartStatus: () => Promise<{ enabled: boolean; desktopFileExists: boolean; systemdFileExists: boolean }>;
  setAutostart: (options: { enabled: boolean; startHidden?: boolean; useSystemd?: boolean }) => Promise<{ enabled: boolean }>;
}

declare global {
  interface Window {
    __gnomeDesktopBridge?: DesktopBridgeApi;
  }
}

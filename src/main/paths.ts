import { app } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface AppPaths {
  userDataDir: string;
  avatarCacheDir: string;
  configFile: string;
  windowStateFile: string;
}

/**
 * Standard Electron storage paths. All application data, caches, and configuration
 * reside in Electron's standard userData directory (~/.config/whatsapp-gnome on Linux).
 */
export function initializeAppPaths(): AppPaths {
  const home = os.homedir();
  const userDataDir =
    app && typeof app.getPath === 'function'
      ? app.getPath('userData')
      : path.join(home, '.config', 'whatsapp-gnome');

  const avatarCacheDir = path.join(userDataDir, 'cache', 'avatars');
  const configFile = path.join(userDataDir, 'config.json');
  const windowStateFile = path.join(userDataDir, 'window-state.json');

  fs.mkdirSync(avatarCacheDir, { recursive: true });

  return {
    userDataDir,
    avatarCacheDir,
    configFile,
    windowStateFile,
  };
}

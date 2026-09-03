import { app } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface XdgDirectories {
  configHome: string;
  dataHome: string;
  cacheHome: string;
  stateHome: string;
  avatarCacheDir: string;
  partitionDir: string;
  configFile: string;
  windowStateFile: string;
}

/**
 * Resolves standard paths according to the XDG Base Directory Specification.
 */
export function getXdgDirectories(): XdgDirectories {
  const home = os.homedir();
  const appName = 'whatsapp-gnome';

  const configHome = process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, appName)
    : path.join(home, '.config', appName);

  const dataHome = process.env.XDG_DATA_HOME
    ? path.join(process.env.XDG_DATA_HOME, appName)
    : path.join(home, '.local', 'share', appName);

  const cacheHome = process.env.XDG_CACHE_HOME
    ? path.join(process.env.XDG_CACHE_HOME, appName)
    : path.join(home, '.cache', appName);

  const stateHome = process.env.XDG_STATE_HOME
    ? path.join(process.env.XDG_STATE_HOME, appName)
    : path.join(home, '.local', 'state', appName);

  const avatarCacheDir = path.join(cacheHome, 'avatars');
  const partitionDir = path.join(dataHome, 'Partitions', 'whatsapp-session');
  const configFile = path.join(configHome, 'config.json');
  const windowStateFile = path.join(configHome, 'window-state.json');

  return {
    configHome,
    dataHome,
    cacheHome,
    stateHome,
    avatarCacheDir,
    partitionDir,
    configFile,
    windowStateFile,
  };
}

/**
 * Initializes and creates all required XDG directories, and configures Electron paths.
 */
export function initializeXdgEnvironment(): XdgDirectories {
  const dirs = getXdgDirectories();

  // Create required directory hierarchy
  fs.mkdirSync(dirs.configHome, { recursive: true });
  fs.mkdirSync(dirs.dataHome, { recursive: true });
  fs.mkdirSync(dirs.cacheHome, { recursive: true });
  fs.mkdirSync(dirs.stateHome, { recursive: true });
  fs.mkdirSync(dirs.avatarCacheDir, { recursive: true });
  fs.mkdirSync(dirs.partitionDir, { recursive: true });

  // Map Electron paths to conform to XDG Base Directory specification
  app.setPath('userData', dirs.dataHome);
  app.setPath('sessionData', dirs.partitionDir);
  app.setPath('crashDumps', dirs.stateHome);

  return dirs;
}

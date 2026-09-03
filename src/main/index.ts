import { app, session } from 'electron';
import * as path from 'node:path';
import { initializeXdgEnvironment } from './xdg';
import { SettingsManager } from './settings';
import { WindowController } from './window';
import { TrayManager } from './tray';
import { NotificationManager } from './notifications';
import { SecurityManager } from './security';

// ============================================================================
// 1. Pure Wayland & GNOME Platform Configuration (Pre-Ready)
// ============================================================================
if (process.platform === 'linux') {
  // Pure Wayland platform flag (Ozone)
  app.commandLine.appendSwitch('ozone-platform', 'wayland');
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');

  // Match installed XDG desktop entry for GNOME Dash grouping and notifications
  app.setDesktopName('whatsapp-gnome.desktop');
}

// Parse command line launch flags
const isStartHidden =
  process.argv.includes('--hidden') ||
  process.argv.includes('--minimized') ||
  process.argv.includes('-h');

// ============================================================================
// 2. Single Instance Lock
// ============================================================================
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  console.info('[WhatsApp GNOME] Another instance is already running. Exiting.');
  app.exit(0);
}

// ============================================================================
// 3. Application Lifecycle & Service Wiring
// ============================================================================
async function bootstrap(): Promise<void> {
  const assetsDir = path.join(__dirname, '../../assets');
  const defaultIconPath = path.join(assetsDir, 'whatsapp-icon.png');

  // 1. Initialize XDG Base Directory environment
  const xdgDirs = initializeXdgEnvironment();

  // 2. Initialize Core Subsystems
  const settingsManager = new SettingsManager(xdgDirs);
  const windowController = new WindowController(xdgDirs);
  const trayManager = new TrayManager(windowController, assetsDir);

  // Handle second instance launch
  app.on('second-instance', () => {
    windowController.restoreAndFocus();
  });

  // 3. App Ready Handler
  await app.whenReady();

  // Create Window
  const settings = settingsManager.getSettings();
  const startHidden = isStartHidden || settings.startHidden;
  const mainWindow = windowController.createWindow(startHidden);

  // Apply Security Boundaries
  const partitionSession = session.fromPartition('persist:whatsapp-session');
  SecurityManager.apply(mainWindow, partitionSession);

  // Initialize AppIndicator Tray
  trayManager.initialize();

  // Initialize Notification Manager
  const notificationManager = new NotificationManager(
    windowController,
    trayManager,
    xdgDirs,
    defaultIconPath
  );
  notificationManager.setSoundMode(settings.soundMode);

  // Prevent process exit when all windows are closed (runs in tray)
  app.on('window-all-closed', () => {
    // Keep running in background tray
  });
}

bootstrap().catch((err) => {
  console.error('[WhatsApp GNOME] Fatal initialization error:', err);
  process.exit(1);
});

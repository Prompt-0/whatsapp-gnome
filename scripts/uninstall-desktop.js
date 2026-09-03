const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

function uninstall() {
  const home = os.homedir();
  console.log('[Uninstall] Removing WhatsApp GNOME desktop integration...');

  const desktopFile = path.join(home, '.local', 'share', 'applications', 'whatsapp-gnome.desktop');
  if (fs.existsSync(desktopFile)) {
    fs.unlinkSync(desktopFile);
    console.log(`[Uninstall] Removed ${desktopFile}`);
  }

  const runnerFile = path.join(home, '.local', 'bin', 'whatsapp-gnome');
  if (fs.existsSync(runnerFile)) {
    fs.unlinkSync(runnerFile);
    console.log(`[Uninstall] Removed ${runnerFile}`);
  }

  const iconSizes = [16, 32, 48, 64, 128, 256];
  for (const size of iconSizes) {
    const iconFile = path.join(home, '.local', 'share', 'icons', 'hicolor', `${size}x${size}`, 'apps', 'whatsapp-gnome.png');
    if (fs.existsSync(iconFile)) {
      fs.unlinkSync(iconFile);
    }
  }
  console.log('[Uninstall] Removed hicolor system icons.');

  const appsDir = path.join(home, '.local', 'share', 'applications');
  try {
    execSync(`update-desktop-database "${appsDir}" 2>/dev/null || true`);
  } catch {}

  const hicolorRoot = path.join(home, '.local', 'share', 'icons', 'hicolor');
  try {
    execSync(`gtk-update-icon-cache -f -t "${hicolorRoot}" 2>/dev/null || true`);
  } catch {}

  console.log('[Uninstall] Desktop and icon caches refreshed.');
  console.log('[Uninstall] Done.');
}

uninstall();

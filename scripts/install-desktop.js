const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { execSync } = require('node:child_process');

function createPng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const toCrc = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(toCrc), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  const cx = width / 2;
  const cy = height / 2;
  const r = width / 2 - 1.5;
  const innerR = r * 0.45;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // Center white phone icon area
        if (dist <= innerR && Math.abs(dx - dy * 0.5) < innerR * 0.7) {
          raw[offset++] = 0xff; // R
          raw[offset++] = 0xff; // G
          raw[offset++] = 0xff; // B
          raw[offset++] = 0xff; // A
        } else {
          // WhatsApp Green #25D366
          raw[offset++] = 0x25;
          raw[offset++] = 0xd3;
          raw[offset++] = 0x66;
          raw[offset++] = 0xff;
        }
      } else {
        // Transparent outside circle
        raw[offset++] = 0;
        raw[offset++] = 0;
        raw[offset++] = 0;
        raw[offset++] = 0;
      }
    }
  }

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function install() {
  const home = os.homedir();
  const appRoot = path.resolve(__dirname, '..');
  const electronBin = path.join(appRoot, 'node_modules', '.bin', 'electron');

  console.log('[Install] Setting up WhatsApp GNOME integration...');

  // 1. Install multi-resolution hicolor system icons
  const iconSizes = [16, 32, 48, 64, 128, 256];
  for (const size of iconSizes) {
    const iconDir = path.join(home, '.local', 'share', 'icons', 'hicolor', `${size}x${size}`, 'apps');
    fs.mkdirSync(iconDir, { recursive: true });
    const iconFile = path.join(iconDir, 'whatsapp-gnome.png');
    const pngBuf = createPng(size, size);
    fs.writeFileSync(iconFile, pngBuf);
  }
  console.log(`[Install] Multi-resolution icons installed to ~/.local/share/icons/hicolor/`);

  // Also copy 256x256 icon to assets/whatsapp-icon.png
  const assetsDir = path.join(appRoot, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'whatsapp-icon.png'), createPng(256, 256));

  // 2. Create runner binary in ~/.local/bin/whatsapp-gnome
  const binDir = path.join(home, '.local', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const runnerFile = path.join(binDir, 'whatsapp-gnome');

  const runnerScript = `#!/usr/bin/env bash
# WhatsApp GNOME Pure Wayland Runner
exec "${electronBin}" "${appRoot}" --ozone-platform=wayland --enable-features=WaylandWindowDecorations "$@"
`;

  fs.writeFileSync(runnerFile, runnerScript, { mode: 0o755 });
  console.log(`[Install] Runner installed to ${runnerFile}`);

  // 3. Create .desktop file in ~/.local/share/applications/whatsapp-gnome.desktop
  const appsDir = path.join(home, '.local', 'share', 'applications');
  fs.mkdirSync(appsDir, { recursive: true });
  const desktopFile = path.join(appsDir, 'whatsapp-gnome.desktop');

  const desktopContent = `[Desktop Entry]
Type=Application
Version=1.0
Name=WhatsApp
GenericName=WhatsApp Desktop Client
Comment=Native WhatsApp Web client for GNOME 50 Wayland
Exec=${runnerFile} %u
Icon=whatsapp-gnome
Terminal=false
Categories=Network;InstantMessaging;Chat;
StartupWMClass=whatsapp-gnome
MimeType=x-scheme-handler/whatsapp;
Keywords=WhatsApp;Chat;Messenger;
X-GNOME-UsesNotifications=true
Actions=NewChat;

[Desktop Action NewChat]
Name=New Chat
Exec=${runnerFile}
`;

  fs.writeFileSync(desktopFile, desktopContent, 'utf8');
  console.log(`[Install] Desktop launcher installed to ${desktopFile}`);

  // 4. Update system caches
  try {
    execSync(`update-desktop-database "${appsDir}" 2>/dev/null || true`);
  } catch {}

  try {
    const hicolorRoot = path.join(home, '.local', 'share', 'icons', 'hicolor');
    execSync(`gtk-update-icon-cache -f -t "${hicolorRoot}" 2>/dev/null || true`);
  } catch {}

  console.log('[Install] GNOME desktop and icon caches refreshed successfully.');
  console.log('[Install] Installation complete! WhatsApp is now ready in GNOME Shell.');
}

install().catch((err) => {
  console.error('[Install] Error:', err);
  process.exit(1);
});

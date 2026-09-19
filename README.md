# WhatsApp GNOME 🐧

> **Native WhatsApp Web Desktop Client for GNOME on Pure Wayland**

![Linux](https://img.shields.io/badge/Platform-Linux%20GNOME-blue.svg)
![Wayland](https://img.shields.io/badge/Display-Pure%20Wayland-informational.svg)
![Electron](https://img.shields.io/badge/Electron-44-47848F.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue.svg)

A hardened, lightweight, and modern Linux desktop client designed exclusively for GNOME on pure Wayland wrapping WhatsApp Web. Built with zero-trust sandboxing, native Libadwaita styling, FreeDesktop D-Bus notifications, and seamless system tray integration.

---

## 🌟 Features

- **Pure Wayland First**: Zero XWayland overhead with native Wayland window decorations and scaling via Chromium Ozone Wayland platform flags.
- **Strict Security & Sandboxing**:
  - Multi-layer sandbox (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`).
  - Strict Content Security Policy (CSP) rewriting for Signal WebAssembly protocols.
  - Hardened navigation guard ensuring all external URLs open securely in default system browser.
- **Native GNOME & Libadwaita Aesthetics**: Dynamic theme switching (Dark/Light) synced with GNOME system preferences, Cantarell typography, and floating overlay scrollbars.
- **Deep Desktop Integration**:
  - **AppIndicator / Tray**: KStatusNotifierItem tray with dynamic unread message count badges.
  - **FreeDesktop Notifications**: Native desktop notifications with avatar rendering and deep chat switching on click.
  - **XDG Base Directory Compliance**: Strict segregation of config (`~/.config`), persistent session partition (`~/.local/share`), and caches (`~/.cache`).
  - **Autostart**: Configurable XDG autostart minimized to tray on system boot.
- **Privacy & Security Vault**:
  - Built-in App Lock screen isolated in dedicated WebContentsView to prevent DOM tampering.
  - Scrypt key derivation with AES-256-GCM vault and optional GNOME Keyring (`secret-tool`) integration.
- **Media Controls**: MPRIS2 D-Bus media key integration for voice messages and video playback.

---

## 🚀 Getting Started

### Prerequisites
- Linux running GNOME 45+ on Wayland
- [Node.js](https://nodejs.org/) (v20+ recommended)
- `npm`

### Installation & Launch
```bash
# Clone the repository
git clone https://github.com/Prompt-0/whatsapp-gnome.git
cd whatsapp-gnome

# Install dependencies
npm install

# Compile TypeScript
npm run build

# Start WhatsApp GNOME
npm start
```

### Install Desktop Launcher & System Icons
To install the application launcher to `~/.local/share/applications/whatsapp-gnome.desktop` with system icons:
```bash
npm run install-desktop
```
To uninstall:
```bash
npm run uninstall-desktop
```

---

## 📂 Architecture

```
whatsapp-gnome/
├── src/
│   ├── main/           # Main process: SecurityManager, WindowController, TrayManager, Auth
│   ├── preload/        # Hardened preload bridge exposing safe IPC API to web context
│   └── common/         # Shared interfaces, constants, and IPC channels
├── scripts/
│   ├── install-desktop.js    # Installer for XDG .desktop launcher & system icons
│   └── uninstall-desktop.js  # Clean uninstaller
├── docs/wayfinder/     # Comprehensive design documentation & architecture tickets
└── package.json
```

---

## 📜 License

MIT License.

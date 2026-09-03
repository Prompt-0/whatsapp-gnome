---
id: T08-packaging-and-desktop-integration
title: Packaging and Desktop Integration
type: wayfinder:task
status: closed
blocked_by: []
assignee: agy
---

## Question

How should the application be packaged and integrated into the GNOME 50 desktop environment for immediate daily use?

Specifically, investigate and implement:
1. Generation and installation of the native desktop launcher file at `~/.local/share/applications/whatsapp-gnome.desktop` with pure Wayland parameters (`Exec=... --ozone-platform=wayland`).
2. Installation of multi-resolution hicolor icon assets into `~/.local/share/icons/hicolor/` for crisp rendering in GNOME Shell Dash, App Grid, and Alt-Tab switcher.
3. Convenient npm execution scripts and verification of application launch in the user environment.

## Resolution

The desktop integration and runner subsystem was implemented and verified:

1. **Native GNOME Desktop Launcher ([scripts/install-desktop.js](../../scripts/install-desktop.js))**:
   - Generates `~/.local/share/applications/whatsapp-gnome.desktop` targeting Wayland with `--ozone-platform=wayland --enable-features=WaylandWindowDecorations`.
   - Verified 100% compliant via `desktop-file-validate`.
   - Registers MIME type handlers (`x-scheme-handler/whatsapp`), categories, and desktop actions (`NewChat`).
2. **Multi-Resolution Hicolor System Icons**:
   - Generated and installed crisp PNG icons across standard sizes (16x16, 32x32, 48x48, 64x64, 128x128, 256x256) into `~/.local/share/icons/hicolor/<size>x<size>/apps/whatsapp-gnome.png`.
   - Refreshed system icon and desktop databases via `gtk-update-icon-cache` and `update-desktop-database`.
3. **Runner Script & Package Automation**:
   - Installed standalone executable wrapper `~/.local/bin/whatsapp-gnome`.
   - Added `npm run install-desktop` and `npm run uninstall-desktop` to [package.json](../../package.json).
   - Preserved zero runtime production dependencies (`"dependencies": {}`).

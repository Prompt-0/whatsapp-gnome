---
id: T04-autostart-and-background-startup
title: Autostart and Background Startup
type: wayfinder:task
status: closed
blocked_by: []
assignee: agy
---

## Question

How should background autostart upon system boot/login be configured and managed across GNOME desktop environments?

Specifically, investigate and implement:
1. Generation and management of standard XDG autostart `.desktop` entry in `~/.config/autostart/whatsapp-gnome.desktop`.
2. Handling CLI launch flags: `--hidden` / `--minimized` to ensure silent startup directly into the AppIndicator tray without opening a window on user login.
3. Systemd user unit option (`~/.config/systemd/user/whatsapp-gnome.service`) configured with `After=graphical-session.target` and crash restart policies.
4. Setting toggle inside the app preferences to enable/disable autostart cleanly via IPC without manual terminal intervention.

## Resolution

A complete background startup and autostart subsystem was implemented and verified in [src/main/autostart.ts](../../src/main/autostart.ts):

1. **Dual-Mode Autostart Generation**:
   - **Mode A (Standard XDG Autostart)**: Generates `~/.config/autostart/whatsapp-gnome.desktop` with `Exec=<path> --hidden`, `StartupWMClass=whatsapp-gnome`, and `X-GNOME-Autostart-Delay=3` (which prevents D-Bus registration race conditions with the GNOME Shell AppIndicator extension during session startup).
   - **Mode B (Systemd User Service)**: Generates `~/.config/systemd/user/whatsapp-gnome.service` bound to `graphical-session.target`, with `Restart=on-failure`, `RestartSec=5s`, and `Slice=app-graphical.slice`.
2. **CLI Launch Flags**:
   - Integrated `--hidden` / `--minimized` / `-h` into [src/main/index.ts](../../src/main/index.ts), causing the window to be initialized off-screen while the AppIndicator tray icon registers immediately.
3. **IPC & Settings Synchronization**:
   - Added `autostart:get-status` and `autostart:set-status` IPC handlers with cryptographic sender frame origin verification.
   - Exposed `getAutostartStatus()` and `setAutostart()` through the sandboxed `contextBridge` in [src/preload/index.ts](../../src/preload/index.ts).
4. **Automated Verification**:
   - Verified with unit tests covering creation, switching between XDG and systemd modes, and clean removal on disable.

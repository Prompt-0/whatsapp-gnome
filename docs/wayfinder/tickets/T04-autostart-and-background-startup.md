---
id: T04-autostart-and-background-startup
title: Autostart and Background Startup
type: wayfinder:task
status: open
blocked_by: []
assignee: null
---

## Question

How should background autostart upon system boot/login be configured and managed across GNOME desktop environments?

Specifically, investigate and implement:
1. Generation and management of standard XDG autostart `.desktop` entry in `~/.config/autostart/whatsapp-gnome.desktop`.
2. Handling CLI launch flags: `--hidden` / `--minimized` to ensure silent startup directly into the AppIndicator tray without opening a window on user login.
3. Systemd user unit option (`~/.config/systemd/user/whatsapp-gnome.service`) configured with `After=graphical-session.target` and crash restart policies.
4. Setting toggle inside the app preferences to enable/disable autostart cleanly via IPC without manual terminal intervention.

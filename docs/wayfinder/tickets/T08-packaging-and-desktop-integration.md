---
id: T08-packaging-and-desktop-integration
title: Packaging and Desktop Integration
type: wayfinder:task
status: open
blocked_by: []
assignee: null
---

## Question

How should the application be packaged and integrated into the GNOME 50 desktop environment for immediate daily use?

Specifically, investigate and implement:
1. Generation and installation of the native desktop launcher file at `~/.local/share/applications/whatsapp-gnome.desktop` with pure Wayland parameters (`Exec=... --ozone-platform=wayland`).
2. Installation of multi-resolution hicolor icon assets into `~/.local/share/icons/hicolor/` for crisp rendering in GNOME Shell Dash, App Grid, and Alt-Tab switcher.
3. Convenient npm execution scripts and verification of application launch in the user environment.

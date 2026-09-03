---
id: T02-appindicator-tray-and-window-lifecycle
title: AppIndicator Tray and Window Lifecycle
type: wayfinder:research
status: closed
blocked_by: []
assignee: agy
---

## Question

How should the GNOME AppIndicator / KStatusNotifierItem tray lifecycle and window management be structured across Wayland and X11 sessions?

Specifically, investigate and specify:
1. Integration with GNOME Shell via the `AppIndicator and KStatusNotifierItem Support` extension using Electron's native `Tray` API or an Ayatana AppIndicator binding.
2. Dynamic tray icon generation with real-time unread badge count overlays (rendering unread counts onto a canvas or SVG to update the tray icon dynamically).
3. Window lifecycle management: intercepting the window `close` event to hide to the tray (`event.preventDefault(); window.hide()`) rather than terminating the process.
4. Single-click tray activation to restore/toggle window visibility and bring the application to the foreground.
5. Context menu items (Open WhatsApp, Mute Notifications, Check for Updates, Quit).
6. Wayland-specific CLI flags (`--enable-features=UseOzonePlatform`, `--ozone-platform=wayland`) and compatibility considerations.

## Resolution

A comprehensive GNOME AppIndicator and Wayland window lifecycle design was established and documented in [appindicator-tray-and-window-lifecycle.md](../research/appindicator-tray-and-window-lifecycle.md):

1. **D-Bus AppIndicator Model**: Integrated with GNOME Shell's `AppIndicator and KStatusNotifierItem Support` extension over D-Bus (`org.kde.StatusNotifierWatcher`, `org.kde.StatusNotifierItem`, and `com.canonical.dbusmenu`).
2. **Wayland Display Independence**: Configured `--ozone-platform-hint=auto` and `--enable-features=WaylandWindowDecorations,UseOzonePlatform` before `app.whenReady()`. Recognized that Linux tray communication is purely out-of-band over session D-Bus.
3. **Singleton Tray Lifecycle**: Enforced a strict single-instance `Tray` object to eliminate orphan registrations and ghost icon duplication on Linux (Electron issue #40936).
4. **Dynamic High-DPI Badge Rendering**: Built `TrayBadgeManager` with `@resvg/resvg-js` to rasterize dynamic SVG unread badge pill/circle overlays to 64x64 PNG buffers with an LRU cache.
5. **Window Lifecycle & Wayland Focus-Stealing Mitigation**: Window `close` events intercept to `window.hide()` conditioned on `isQuitting`. Single instance activation via `app.requestSingleInstanceLock()` executes `restore()`, `show()`, `focus()`, and `flashFrame(true)` to alert the GNOME compositor.
6. **State Persistence**: Geometry persistence (`window-state.json`) with multi-display work area validation to avoid off-screen spawning on disconnected external monitors.

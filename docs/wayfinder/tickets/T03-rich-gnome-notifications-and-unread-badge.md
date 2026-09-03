---
id: T03-rich-gnome-notifications-and-unread-badge
title: Rich GNOME Notifications and Unread Badge
type: wayfinder:research
status: closed
blocked_by: []
assignee: agy
---

## Question

How can we capture WhatsApp Web notifications and render them as rich, native GNOME desktop notifications with unread counts and direct activation?

Specifically, investigate and specify:
1. Interception mechanism for `window.Notification` in the sandboxed preload script to capture title, body, icon/avatar, and click handlers.
2. Dispatching native desktop notifications via Electron's `Notification` module or D-Bus `org.freedesktop.Notifications` with support for urgency levels and sound.
3. Notification click behavior: raising the window, restoring from tray, and focusing the active chat.
4. Parsing unread message badges from WhatsApp Web title (e.g. `(3) WhatsApp`) or DOM mutation observers.
5. Updating the GNOME Dash/Dock unread counter badge via Unity/GNOME Shell Launcher API (`app.setBadgeCount`).

## Resolution

A comprehensive native GNOME desktop notifications and unread badge architecture was established and documented in [rich-gnome-notifications-and-unread-badge.md](../research/rich-gnome-notifications-and-unread-badge.md):

1. **Dual-Tier Interception**: Implemented a two-tier mechanism combining an isolated `contextBridge` (`__gnomeDesktopBridge`) with main-world injection via `webFrame.executeJavaScript()` to proxy `window.Notification` and `ServiceWorkerRegistration.prototype.showNotification`, synchronously returning `'granted'` permissions.
2. **Blob Transcoding & Local Disk Cache**: Injected proxy converts renderer `blob:` avatar URLs to base64 Data URLs via `FileReader`, which the main process streams to disk (`~/.config/whatsapp-gnome/cache/avatars/<hash>.png`) for GNOME Shell display.
3. **Notification Dispatch & In-Place Updates**: Designed dispatching via FreeDesktop D-Bus (`org.freedesktop.Notifications`) and Electron's built-in `Notification`, supporting `replaces_id` in-place updates to avoid burst spam.
4. **Chat Switching & Activation**: Clicking notifications executes window restore and focus, forwarding the click back over IPC to the `ProxyNotification` instance to trigger WhatsApp's internal chat switch.
5. **Acoustic Coordination**: 3-way sound matrix (`WHATSAPP_ONLY`, `SYSTEM_ONLY`, `MUTED`) preventing double-chime collisions between WhatsApp audio and GNOME system sounds.
6. **Triple-Layer Unread Count Sync**: Resilient `MutationObserver` on `document.title` updating GNOME Dash/Dock badges (`app.setBadgeCount(count)` via Unity LauncherEntry D-Bus), dynamic 2D canvas tray icon badge overlays, and window title urgency.

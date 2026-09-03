---
id: T07-core-application-scaffold-and-sandbox-implementation
title: Core Application Scaffold and Sandbox Implementation
type: wayfinder:task
status: closed
blocked_by: []
assignee: agy
---

## Question

How do we scaffold the Electron + TypeScript workspace at `/root/Projects/whatsapp-gnome` and implement the production core combining the resolved security architecture, tray lifecycle, and notification proxying?

Specifically, implement and verify:
1. Minimal, hardened `package.json` with zero production dependencies, strict build scripts (`build`, `build:main`, `build:preload`, `typecheck`), and TypeScript configuration (`tsconfig.json`).
2. `src/main/security.ts`: Implementing the resolved `SecurityManager` (CSP rewriting, tri-layer navigation guard, senderFrame validation, permission handler).
3. `src/main/window.ts`: BrowserWindow lifecycle with state persistence, hide-to-tray on close, and Wayland Ozone platform switches.
4. `src/main/tray.ts`: Singleton `Tray` instance with dynamic unread badge canvas/PNG rendering.
5. `src/preload/index.ts`: Hardened preload exposing `whatsappBridge` and injecting the two-tier `ProxyNotification` and title `MutationObserver`.
6. Verify clean compilation with `npm run build` and zero type errors.

## Resolution

The production-grade Electron + TypeScript core application has been scaffolded, implemented, and verified at `/root/Projects/whatsapp-gnome`:

1. **Strict XDG Base Directory Conformance (`src/main/xdg.ts`)**:
   - Mapped `$XDG_CONFIG_HOME/whatsapp-gnome` (`config.json`, `window-state.json`).
   - Mapped `$XDG_DATA_HOME/whatsapp-gnome` (`Partitions/whatsapp-session`).
   - Mapped `$XDG_CACHE_HOME/whatsapp-gnome` (`avatars/`).
   - Mapped `$XDG_STATE_HOME/whatsapp-gnome` (`crashDumps/`).
   - Electron paths remapped via `app.setPath()`.
2. **Pure Wayland GNOME 50 Platform Support (`src/main/index.ts`)**:
   - Appended `--ozone-platform=wayland` and `--enable-features=WaylandWindowDecorations`.
   - Set desktop name `whatsapp-gnome.desktop` for GNOME Shell Dash grouping.
   - Enforced single-instance lock via `app.requestSingleInstanceLock()` with Wayland focus-stealing mitigation.
   - Supported `--hidden` / `--minimized` CLI launch flags.
3. **Defense-in-Depth Security Engine (`src/main/security.ts`)**:
   - Strict CSP rewriting in `onHeadersReceived` allowing Signal Protocol WebAssembly without arbitrary JavaScript eval.
   - Tri-layer navigation guard intercepting `setWindowOpenHandler` (always denying child windows), `will-navigate`, and `will-redirect`.
   - Safe external URL router allowlisting `https:` and `http:` via `shell.openExternal`.
   - SenderFrame cryptographic origin verification (`event.senderFrame.url === 'https://web.whatsapp.com' && event.senderFrame.parent === null`).
   - Dual-layer permission handler strictly gating camera/microphone and notifications.
4. **Window & Tray Subsystems (`src/main/window.ts`, `src/main/tray.ts`)**:
   - BrowserWindow lifecycle with multi-monitor safe geometry persistence.
   - `close` interception to hide window to tray unless `isQuitting`.
   - Singleton `Tray` instance with dynamic badge updates and GNOME HIG context menu.
5. **Notification Subsystem (`src/main/notifications.ts`, `src/preload/index.ts`)**:
   - Context-isolated bridge (`__gnomeDesktopBridge`) with main-world injection via `webFrame.executeJavaScript()`.
   - Transparent proxying of `window.Notification` and `ServiceWorkerRegistration.prototype.showNotification`.
   - Avatar blob transcoding to base64 and atomic local disk caching.
   - Title `MutationObserver` with offscreen HTML5 canvas badge generator synchronizing counts to Dash-to-Dock via `app.setBadgeCount(count)` and the tray icon.
6. **Zero Runtime Production Dependencies & Verification**:
   - `"dependencies": {}` in `package.json`.
   - Verified compilation: `npm run build` and `npm run typecheck` succeed cleanly with zero warnings or errors.

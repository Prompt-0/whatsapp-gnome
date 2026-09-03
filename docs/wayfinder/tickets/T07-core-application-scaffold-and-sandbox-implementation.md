---
id: T07-core-application-scaffold-and-sandbox-implementation
title: Core Application Scaffold and Sandbox Implementation
type: wayfinder:task
status: open
blocked_by: []
assignee: null
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

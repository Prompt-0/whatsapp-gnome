---
id: T01-security-hardening-and-sandboxing-architecture
title: Security Hardening and Sandboxing Architecture
type: wayfinder:research
status: closed
blocked_by: []
assignee: agy
---

## Question

How can we engineer a defense-in-depth security model for an Electron-based WhatsApp Web desktop client to ensure user accounts, local session data, and host systems are completely immune to remote code execution, XSS, malicious redirects, clickjacking, and session hijacking?

Specifically, investigate and specify:
1. Exact Electron webPreferences configuration (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `nodeIntegrationInSubFrames: false`, `webSecurity: true`, `allowRunningInsecureContent: false`).
2. Content Security Policy (CSP) modification and HTTP header hardening via `session.defaultSession.webRequest.onHeadersReceived`.
3. Navigation and popup guard: intercepting `will-navigate`, `will-redirect`, and `setWindowOpenHandler` to strictly whitelist official WhatsApp origins (`web.whatsapp.com`, `*.whatsapp.net`) while safely routing external URLs through `shell.openExternal` after strict protocol (`https:`) validation.
4. Minimalist, typed, context-isolated IPC bridge using `contextBridge.exposeInMainWorld` exposing zero sensitive Node/Electron APIs to WhatsApp Web scripts.
5. Permission request handling via `session.setPermissionRequestHandler`: explicitly restricting camera, microphone, and notifications to WhatsApp, and denying all arbitrary permissions.
6. Session partition isolation (`persist:whatsapp-session`) to guarantee cookies and local storage are walled off from any other application or browser session.

## Resolution

A comprehensive zero-trust defense-in-depth security model was established and documented in [security-hardening-and-sandboxing.md](../research/security-hardening-and-sandboxing.md):

1. **Window & Process Isolation**: Configured `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `nodeIntegrationInSubFrames: false`, `webSecurity: true`, `allowRunningInsecureContent: false`, `webviewTag: false`, `navigateOnDragDrop: false`, and `disableBlinkFeatures: 'Auxclick'`.
2. **Dynamic CSP & HTTP Header Engine**: Intercepts `onHeadersReceived` to strip server/permissive CSPs and enforce strict desktop CSP (`script-src 'self' 'wasm-unsafe-eval' https://web.whatsapp.com https://*.whatsapp.net https://*.facebook.com`) supporting Signal Protocol WebAssembly while blocking arbitrary JavaScript eval. Injects `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `COOP`, `CORP`, and `Permissions-Policy`.
3. **Tri-Layer Navigation & Link Guard**: Intercepts `setWindowOpenHandler` (always denying child windows), `will-navigate`, and `will-redirect`. Strictly allows internal navigation within `https://web.whatsapp.com/*`. Sanitizes and allowlists external links (`https:`, `http:` only), dispatching them safely via `setImmediate(() => shell.openExternal(...))` to eliminate local protocol exploits and command injection.
4. **Sandboxed Preload & Minimal ContextBridge**: Frozen API (`whatsappBridge`) exposing strictly typed methods (`updateBadgeCount`, `getTheme`, `toggleMute`) with sender frame origin validation (`senderFrame.url === 'https://web.whatsapp.com' && senderFrame.parent === null`).
5. **Dual-Layer Permission Handlers**: Restricts `setPermissionRequestHandler` and `setPermissionCheckHandler` strictly to `media` (audio/video only) and `notifications` from `https://web.whatsapp.com`, denying geolocation, midi, usb, and all other device capabilities.
6. **Partition Isolation**: Session data isolated under `~/.config/whatsapp-gnome/Partitions/whatsapp-session/` via `persist:whatsapp-session`.
7. **Supply Chain Hardening**: Strict zero-production-dependency architecture with cryptographic lockfile verification and non-tampering with WhatsApp's underlying WebSocket protocols.

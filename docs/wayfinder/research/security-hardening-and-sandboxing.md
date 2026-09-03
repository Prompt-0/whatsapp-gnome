# Ticket T01: Security Hardening & Sandboxing Architecture Specification

## Executive Summary

Embedding WhatsApp Web into an Electron desktop client presents a high-severity threat model: the client renders arbitrary remote web content and processes user-supplied multimedia (stickers, WebP, audio clips, documents, chat links) sent by third parties over end-to-end encrypted channels. If an attacker discovers an XSS flaw in WhatsApp Web (as seen historically in CVE-2019-18426) or a zero-day in Chromium's rendering pipeline (such as the WebP heap buffer overflow CVE-2023-4863), an insecure Electron wrapper can permit full **Remote Code Execution (RCE)** on the user's Linux workstation.

This technical specification defines a **Zero-Trust, Multi-Layered Defense-in-Depth Sandboxing Architecture**:
1. **The Operating System is protected**: Renderer processes are confined by Linux kernel user namespaces and seccomp-BPF filters (`sandbox: true`), with zero access to Node.js native runtimes.
2. **The IPC boundary is impregnable**: Communication between the sandboxed renderer and the privileged main process is governed by a strictly typed, frozen `contextBridge` API with bidirectional payload schema validation and frame-origin sender verification (`senderFrame`).
3. **Network traffic is strictly contained**: A dynamic HTTP response header manipulation engine enforces a strict Content Security Policy (CSP) allowing only verified WhatsApp and Meta CDN infrastructure.
4. **Navigation and links cannot escape or execute arbitrary handlers**: Every URL navigation, redirect, and window creation is intercepted. External links undergo strict protocol allowlisting (`https:`, `http:` only) before hand-off to the Linux desktop default browser, neutralizing command injection, protocol handler hijacking, and local file reading.
5. **Local state is siloed**: Persistent sessions use an isolated storage partition (`persist:whatsapp-session`), completely segregating cookies, tokens, IndexedDB, and cache from any other application profile.

---

## 1. Process & Window Isolation (`webPreferences`)

### 1.1 BrowserWindow Security Configuration
```typescript
import { BrowserWindow, session } from 'electron';
import * as path from 'node:path';

export function createWhatsAppWindow(): BrowserWindow {
  const partitionSession = session.fromPartition('persist:whatsapp-session');

  const win = new BrowserWindow({
    title: 'WhatsApp',
    width: 1100,
    height: 750,
    minWidth: 600,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // 1. Core Isolation & Sandboxing
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,

      // 2. Web Security & Origin Restrictions
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,

      // 3. Navigation & Input Hardening
      navigateOnDragDrop: false,
      disableBlinkFeatures: 'Auxclick',

      // 4. Partitioning & Preload Binding
      session: partitionSession,
      partition: 'persist:whatsapp-session',
      preload: path.join(__dirname, '../preload/index.js'),

      // 5. Native Capabilities
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  return win;
}
```

### 1.2 Defense-in-Depth Rationale
- `contextIsolation: true`: Isolates the JavaScript runtime context of the preload script from the main world. Even if an XSS occurs on WhatsApp Web, it cannot access the preload's scope or prototype chain.
- `sandbox: true`: Restricts renderer processes via Linux namespaces (`CLONE_NEWUSER`) and seccomp-BPF filters. Node.js built-ins (`fs`, `child_process`) are never initialized.
- `nodeIntegration: false`: Completely prevents Node.js globals (`require`, `process`, `Buffer`) from leaking into the renderer window.
- `webSecurity: true`: Enforces Chromium's Same-Origin Policy (SOP), blocking local `file://` reading and unauthorized cross-origin requests.
- `webviewTag: false`: Disables `<webview>` tags, eliminating legacy guest WebContents privilege escalation vectors.
- `disableBlinkFeatures: 'Auxclick'`: Disables middle-mouse-click auxiliary events that could bypass click interceptors.

---

## 2. Dynamic CSP Modification & HTTP Header Hardening

```typescript
import { Session } from 'electron';

export function setupHeaderHardening(ses: Session): void {
  const WHATSAPP_ORIGINS = [
    'https://web.whatsapp.com/*',
    'https://*.web.whatsapp.com/*',
    'https://*.whatsapp.net/*',
  ];

  const STRICT_CSP = [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval' https://web.whatsapp.com https://*.whatsapp.net https://*.facebook.com",
    "style-src 'self' 'unsafe-inline' https://web.whatsapp.com https://*.whatsapp.net",
    "connect-src 'self' wss://*.web.whatsapp.com wss://*.whatsapp.net https://*.web.whatsapp.com https://*.whatsapp.net https://*.whatsapp.com https://*.fbcdn.net https://*.facebook.com",
    "img-src 'self' data: blob: https://*.whatsapp.net https://*.fbcdn.net https://*.facebook.com",
    "media-src 'self' blob: mediastream: https://*.whatsapp.net https://*.fbcdn.net",
    "font-src 'self' data: https://web.whatsapp.com https://*.whatsapp.net",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-src 'self' https://web.whatsapp.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self' https://web.whatsapp.com",
    "frame-ancestors 'none'",
  ].join('; ');

  ses.webRequest.onHeadersReceived({ urls: WHATSAPP_ORIGINS }, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    for (const headerKey of Object.keys(responseHeaders)) {
      const lowerKey = headerKey.toLowerCase();
      if (
        lowerKey === 'content-security-policy' ||
        lowerKey === 'content-security-policy-report-only' ||
        lowerKey === 'x-content-security-policy'
      ) {
        delete responseHeaders[headerKey];
      }
    }

    responseHeaders['Content-Security-Policy'] = [STRICT_CSP];
    responseHeaders['X-Content-Type-Options'] = ['nosniff'];
    responseHeaders['X-Frame-Options'] = ['DENY'];
    responseHeaders['Cross-Origin-Opener-Policy'] = ['same-origin'];
    responseHeaders['Cross-Origin-Resource-Policy'] = ['same-site'];
    responseHeaders['Referrer-Policy'] = ['strict-origin-when-cross-origin'];
    responseHeaders['Permissions-Policy'] = [
      'camera=(self), microphone=(self), display-capture=(), geolocation=(), midi=(), usb=(), serial=(), payment=()',
    ];

    callback({ responseHeaders });
  });
}
```

---

## 3. Tri-Layer Navigation & Safe External Link Routing

```typescript
import { BrowserWindow, shell } from 'electron';
import { URL } from 'node:url';

const ALLOWED_INTERNAL_PREFIX = 'https://web.whatsapp.com';
const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:']);

export function openSafeExternal(rawUrl: string): void {
  try {
    const parsed = new URL(rawUrl);

    // 1. Strict protocol allowlist
    if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      console.warn(`[Security Guard] Blocked unsafe protocol: ${parsed.protocol} (${rawUrl})`);
      return;
    }

    // 2. Validate hostname sanity
    if (!parsed.hostname || parsed.hostname.includes(' ') || parsed.hostname.length > 253) {
      console.warn(`[Security Guard] Blocked malformed hostname: ${parsed.hostname}`);
      return;
    }

    // 3. Asynchronously dispatch to default Linux browser (xdg-open)
    setImmediate(() => {
      shell.openExternal(parsed.href).catch((err) => {
        console.error('[Security Guard] Failed to open external URL:', err.message);
      });
    });
  } catch {
    console.warn(`[Security Guard] Blocked unparseable URL string: ${rawUrl}`);
  }
}

export function setupNavigationGuards(win: BrowserWindow): void {
  const { webContents } = win;

  // Layer 1: Popup and window.open Interception
  webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternal(url);
    return { action: 'deny' };
  });

  // Layer 2: In-Page Top-Level Navigation Interception
  webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl.startsWith(ALLOWED_INTERNAL_PREFIX)) {
      return;
    }
    event.preventDefault();
    openSafeExternal(navigationUrl);
  });

  // Layer 3: Server-side HTTP 3xx Redirect Interception
  webContents.on('will-redirect', (event, navigationUrl) => {
    if (!navigationUrl.startsWith(ALLOWED_INTERNAL_PREFIX)) {
      console.warn(`[Security Guard] Blocked external redirect to: ${navigationUrl}`);
      event.preventDefault();
    }
  });

  // Safety net: Destroy any rogue child window
  webContents.on('did-create-window', (childWin) => {
    childWin.destroy();
  });
}
```

---

## 4. Permission Request & Check Handlers

```typescript
import { Session } from 'electron';
import { URL } from 'node:url';

const TRUSTED_ORIGIN = 'https://web.whatsapp.com';
const ALLOWED_PERMISSIONS = new Set(['media', 'notifications']);

export function setupPermissionHandlers(ses: Session): void {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    try {
      const requestOrigin = new URL(details.requestingUrl).origin;

      if (requestOrigin !== TRUSTED_ORIGIN) {
        return callback(false);
      }

      if (ALLOWED_PERMISSIONS.has(permission)) {
        if (permission === 'media') {
          const mediaTypes = details.mediaTypes || [];
          const isAudioOrVideo = mediaTypes.every(
            (t) => t === 'audio' || t === 'video'
          );
          return callback(isAudioOrVideo);
        } else if (permission === 'notifications') {
          return callback(true);
        }
      }

      return callback(false);
    } catch {
      return callback(false);
    }
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return requestingOrigin === TRUSTED_ORIGIN && ALLOWED_PERMISSIONS.has(permission);
  });
}
```

---

## 5. Storage Partitioning & Session Data Isolation

- Persistent session storage is partitioned under:
  `~/.config/whatsapp-gnome/Partitions/whatsapp-session/`
- Completely segregated from other Chromium/Electron profiles, ensuring decrypted IndexedDB records, local storage, and authentication tokens are walled off.
- Clean session wipe handler implemented via `ses.clearStorageData(...)`.

---

## 6. Supply Chain & Anti-Tamper Security

- **Zero Runtime Dependencies**: `"dependencies": {}` in `package.json`.
- **Reproducible Deterministic Build**: Enforce `npm ci --ignore-scripts` to neutralize malicious `postinstall` scripts.
- **Cryptographic Integrity**: Locked `package-lock.json` with SHA-512 verification.
- **Account Safety Guarantee**: Embeds official WhatsApp Web SPA without headless automation or private WebSocket tampering, preventing WhatsApp phone number bans.

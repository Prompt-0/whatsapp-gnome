# Ticket T03: Native GNOME Desktop Notifications & Dock Unread Badges Specification

## Executive Summary

1. **Dual-Tier Preload & Main-World Proxying**: Because `contextIsolation: true` isolates the preload V8 context from the web page's Main World, simple property assignment to `window.Notification` does not affect WhatsApp Web scripts. We implement a two-tier mechanism: exposing a typed, hardened IPC conduit via `contextBridge.exposeInMainWorld`, followed by main-world injection via `webFrame.executeJavaScript` to install a drop-in `ProxyNotification` class and patch `ServiceWorkerRegistration.prototype.showNotification`.
2. **Avatar Pipeline & Blob Transcoding**: WhatsApp Web dynamically generates avatar URLs as renderer-bound `blob:https://web.whatsapp.com/...` objects. Because Node.js cannot read renderer-scoped blob URIs, the renderer transcodes blobs into base64 Data URLs before IPC dispatch. The main process streams them to an atomic disk cache (`userData/cache/avatars/<hash>.png`) for GNOME Shell consumption.
3. **Dispatch Engines**: Built-in Electron `Notification` provides reliable basic FreeDesktop integration. Direct D-Bus (`org.freedesktop.Notifications`) unlocks native `replaces_id` in-place updates (preventing notification banner spam on burst messages) and `image-path` avatar hints.
4. **Window Activation & Deep Chat Switching**: Clicking a notification restores, unminimizes, and focuses the window without triggering GNOME's intrusive "Window is ready" suppression banner. The click is forwarded over IPC to the stored `Notification` proxy instance, invoking WhatsApp Web's internal React action to switch to the sender's conversation.
5. **Acoustic Coordination (Anti-Double-Chime)**: WhatsApp Web's in-app HTML5 audio engine and GNOME's system sound daemon collide when notifications arrive. We specify a 3-way arbitration matrix (`WHATSAPP_ONLY`, `SYSTEM_ONLY`, `MUTED`) that suppresses either the native notification sound or WhatsApp's blurred in-app audio element.
6. **Unread Badge Synchronization**: Extracting unread counts via `MutationObserver` on `document.title` (e.g., `(5) WhatsApp`) provides a 100% resilient, i18n-agnostic counter immune to WhatsApp Web's virtualized DOM scrolling. The count is synchronized in real-time across the Dash-to-Dock badge (`app.setBadgeCount(count)` / `com.canonical.Unity.LauncherEntry`), dynamic canvas-rendered AppIndicator tray icons, and window title urgency.

---

## 1. Intercepting WhatsApp Web Notifications

```typescript
import { contextBridge, ipcRenderer, webFrame } from 'electron';

// 1. Expose typed bridge to Main World
contextBridge.exposeInMainWorld('__gnomeDesktopBridge', {
  dispatchNotification: (data: any) => {
    ipcRenderer.send('whatsapp:notification-dispatched', data);
  },
  onNotificationClick: (callback: (id: string) => void) => {
    ipcRenderer.on('whatsapp:notification-clicked', (_event, id: string) => {
      callback(id);
    });
  },
  onNotificationClose: (callback: (id: string) => void) => {
    ipcRenderer.on('whatsapp:notification-closed', (_event, id: string) => {
      callback(id);
    });
  }
});

// 2. Inject drop-in Notification & ServiceWorker proxy into Main World
webFrame.executeJavaScript(`
  (() => {
    const registry = new Map();

    window.__gnomeDesktopBridge.onNotificationClick((id) => {
      const notif = registry.get(id);
      if (notif) {
        const clickEvent = new Event('click');
        notif.dispatchEvent(clickEvent);
        if (typeof notif.onclick === 'function') {
          try { notif.onclick(clickEvent); } catch (e) {}
        }
      }
    });

    window.__gnomeDesktopBridge.onNotificationClose((id) => {
      const notif = registry.get(id);
      if (notif) {
        const closeEvent = new Event('close');
        notif.dispatchEvent(closeEvent);
        if (typeof notif.onclose === 'function') {
          try { notif.onclose(closeEvent); } catch (e) {}
        }
        registry.delete(id);
      }
    });

    class ProxyNotification extends EventTarget {
      static get permission() { return 'granted'; }
      static requestPermission(cb) {
        const p = Promise.resolve('granted');
        if (typeof cb === 'function') p.then(cb);
        return p;
      }

      constructor(title, options = {}) {
        super();
        this.id = 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        this.title = String(title || '');
        this.body = String(options.body || '');
        this.icon = options.icon || '';
        this.tag = options.tag || '';
        this.silent = Boolean(options.silent);

        registry.set(this.id, this);

        if (this.icon && this.icon.startsWith('blob:')) {
          fetch(this.icon)
            .then(res => res.blob())
            .then(blob => {
              const reader = new FileReader();
              reader.onloadend = () => {
                window.__gnomeDesktopBridge.dispatchNotification({
                  id: this.id,
                  title: this.title,
                  body: this.body,
                  icon: reader.result,
                  tag: this.tag,
                  silent: this.silent
                });
              };
              reader.readAsDataURL(blob);
            })
            .catch(() => {
              window.__gnomeDesktopBridge.dispatchNotification({
                id: this.id,
                title: this.title,
                body: this.body,
                icon: '',
                tag: this.tag,
                silent: this.silent
              });
            });
        } else {
          window.__gnomeDesktopBridge.dispatchNotification({
            id: this.id,
            title: this.title,
            body: this.body,
            icon: this.icon,
            tag: this.tag,
            silent: this.silent
          });
        }
      }

      close() {
        const closeEvent = new Event('close');
        this.dispatchEvent(closeEvent);
        if (typeof this.onclose === 'function') this.onclose(closeEvent);
        registry.delete(this.id);
      }
    }

    window.Notification = ProxyNotification;

    if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype) {
      window.ServiceWorkerRegistration.prototype.showNotification = function(title, options) {
        new ProxyNotification(title, options);
        return Promise.resolve();
      };
    }
  })();
`);
```

---

## 2. Notification Dispatch & Local Avatar Caching

- Renderer transcodes `blob:` images to base64 Data URLs.
- Main process hashes avatar data (`sha256`) and caches to `~/.config/whatsapp-gnome/cache/avatars/<hash>.png`.
- Notification click restores window, focuses WhatsApp, and forwards click event back to the `ProxyNotification` instance.

---

## 3. Unread Count Synchronization

- **Source of Truth**: `MutationObserver` on `document.title` checking `/^\((\d+)\+?\)\s*WhatsApp/i`.
- **GNOME Dash / Dock**: `app.setBadgeCount(count)` broadcasting via FreeDesktop Unity LauncherEntry D-Bus interface.
- **AppIndicator Tray**: Offscreen HTML5 Canvas generates dynamic 32x32 PNG with a red rounded pill badge (`99+` support) and updates tray via `tray.setImage()`.

import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type { AppSettings, InterceptedNotification } from '../common/types';

// ============================================================================
// 1. Context-Isolated Bridge API (Tier 1)
// ============================================================================
contextBridge.exposeInMainWorld('__gnomeDesktopBridge', {
  dispatchNotification: (data: InterceptedNotification) => {
    ipcRenderer.send('whatsapp:notification-dispatched', data);
  },
  onNotificationClick: (callback: (id: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string) => {
      callback(id);
    };
    ipcRenderer.on('whatsapp:notification-clicked', handler);
    return () => ipcRenderer.removeListener('whatsapp:notification-clicked', handler);
  },
  onNotificationClose: (callback: (id: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string) => {
      callback(id);
    };
    ipcRenderer.on('whatsapp:notification-closed', handler);
    return () => ipcRenderer.removeListener('whatsapp:notification-closed', handler);
  },
  updateBadgeCount: (count: number, trayDataUrl?: string) => {
    ipcRenderer.send('whatsapp:unread-count-changed', { count, trayDataUrl });
  },
  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke('app:get-settings');
  },
  updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke('app:update-settings', settings);
  },
  getAutostartStatus: () => {
    return ipcRenderer.invoke('autostart:get-status');
  },
  setAutostart: (options: { enabled: boolean; startHidden?: boolean; useSystemd?: boolean }) => {
    return ipcRenderer.invoke('autostart:set-status', options);
  },
});

// ============================================================================
// 2. Main-World Injection (Tier 2): Proxy Notification & ServiceWorker
// ============================================================================
webFrame.executeJavaScript(`
  (() => {
    const registry = new Map();

    if (window.__gnomeDesktopBridge) {
      window.__gnomeDesktopBridge.onNotificationClick((id) => {
        const notif = registry.get(id);
        if (notif) {
          const clickEvent = new Event('click');
          notif.dispatchEvent(clickEvent);
          if (typeof notif.onclick === 'function') {
            try {
              notif.onclick(clickEvent);
            } catch (err) {
              console.error('[GnomeBridge] Error in onclick:', err);
            }
          }
        }
      });

      window.__gnomeDesktopBridge.onNotificationClose((id) => {
        const notif = registry.get(id);
        if (notif) {
          const closeEvent = new Event('close');
          notif.dispatchEvent(closeEvent);
          if (typeof notif.onclose === 'function') {
            try {
              notif.onclose(closeEvent);
            } catch (err) {
              console.error('[GnomeBridge] Error in onclose:', err);
            }
          }
          registry.delete(id);
        }
      });
    }

    class ProxyNotification extends EventTarget {
      static get permission() {
        return 'granted';
      }

      static requestPermission(callback) {
        const p = Promise.resolve('granted');
        if (typeof callback === 'function') {
          p.then(callback);
        }
        return p;
      }

      static get maxActions() {
        return 2;
      }

      constructor(title, options = {}) {
        super();
        this.id = 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        this.title = String(title || '');
        this.body = String(options.body || '');
        this.icon = options.icon || '';
        this.tag = options.tag || '';
        this.silent = Boolean(options.silent);

        this.onclick = null;
        this.onclose = null;
        this.onerror = null;
        this.onshow = null;

        registry.set(this.id, this);

        // Transcode blob: avatar URLs to base64 Data URLs so main process can cache them
        if (this.icon && this.icon.startsWith('blob:')) {
          fetch(this.icon)
            .then((res) => res.blob())
            .then((blob) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                if (window.__gnomeDesktopBridge) {
                  window.__gnomeDesktopBridge.dispatchNotification({
                    id: this.id,
                    title: this.title,
                    body: this.body,
                    icon: reader.result,
                    tag: this.tag,
                    silent: this.silent,
                  });
                }
              };
              reader.readAsDataURL(blob);
            })
            .catch(() => {
              if (window.__gnomeDesktopBridge) {
                window.__gnomeDesktopBridge.dispatchNotification({
                  id: this.id,
                  title: this.title,
                  body: this.body,
                  icon: '',
                  tag: this.tag,
                  silent: this.silent,
                });
              }
            });
        } else if (window.__gnomeDesktopBridge) {
          window.__gnomeDesktopBridge.dispatchNotification({
            id: this.id,
            title: this.title,
            body: this.body,
            icon: this.icon,
            tag: this.tag,
            silent: this.silent,
          });
        }

        setTimeout(() => {
          const showEvent = new Event('show');
          this.dispatchEvent(showEvent);
          if (typeof this.onshow === 'function') {
            this.onshow(showEvent);
          }
        }, 0);
      }

      close() {
        const closeEvent = new Event('close');
        this.dispatchEvent(closeEvent);
        if (typeof this.onclose === 'function') {
          this.onclose(closeEvent);
        }
        registry.delete(this.id);
      }
    }

    // Shadow standard Web Notification
    window.Notification = ProxyNotification;

    // Shadow ServiceWorkerRegistration.prototype.showNotification
    if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype) {
      window.ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
        new ProxyNotification(title, options);
        return Promise.resolve();
      };
    }
  })();
`);

// ============================================================================
// 3. Unread Count Observer & Dynamic Canvas Badge Generator
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  let lastReportedCount = -1;

  function parseUnreadTitle(title: string): number {
    const match = title.match(/^\((\d+)\+?\)\s*WhatsApp/i);
    if (match) return parseInt(match[1], 10);
    if (title.startsWith('(•)')) return 1;
    return 0;
  }

  function renderTrayIconBadge(count: number): string {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // WhatsApp green circle
    ctx.fillStyle = '#25D366';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();

    // White phone glyph
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✆', size / 2, size / 2);

    if (count > 0) {
      const text = count > 99 ? '99+' : String(count);
      const pillWidth = text.length > 1 ? (text.length === 2 ? 16 : 22) : 13;
      const pillHeight = 13;
      const x = size - pillWidth;
      const y = 0;

      ctx.fillStyle = '#E53935'; // GNOME Adwaita red
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.roundRect(x, y, pillWidth, pillHeight, pillHeight / 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 8.5px sans-serif';
      ctx.fillText(text, x + pillWidth / 2, y + pillHeight / 2 + 0.5);
    }

    return canvas.toDataURL('image/png');
  }

  function reportUnreadCount(): void {
    const count = parseUnreadTitle(document.title);
    if (count !== lastReportedCount) {
      lastReportedCount = count;
      const trayDataUrl = renderTrayIconBadge(count);
      ipcRenderer.send('whatsapp:unread-count-changed', { count, trayDataUrl });
    }
  }

  const titleEl = document.querySelector('head > title');
  if (titleEl) {
    const observer = new MutationObserver(reportUnreadCount);
    observer.observe(titleEl, { subtree: true, characterData: true, childList: true });
  }

  // Fallback poller
  setInterval(reportUnreadCount, 3000);
});

// ============================================================================
// 4. MPRIS2 Media Playback Observer & Controller
// ============================================================================
document.addEventListener(
  'play',
  (event) => {
    const target = event.target as HTMLMediaElement;
    if (target && (target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) {
      ipcRenderer.send('media:playback-state', { status: 'Playing' });
    }
  },
  true
);

document.addEventListener(
  'pause',
  (event) => {
    const target = event.target as HTMLMediaElement;
    if (target && (target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) {
      ipcRenderer.send('media:playback-state', { status: 'Paused' });
    }
  },
  true
);

document.addEventListener(
  'ended',
  (event) => {
    const target = event.target as HTMLMediaElement;
    if (target && (target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) {
      ipcRenderer.send('media:playback-state', { status: 'Stopped' });
    }
  },
  true
);

ipcRenderer.on('media:toggle-play-pause', () => {
  const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>('audio, video'));
  const activeMedia = mediaElements.find((m) => !m.paused);
  if (activeMedia) {
    activeMedia.pause();
  } else if (mediaElements.length > 0) {
    activeMedia || mediaElements[mediaElements.length - 1].play().catch(() => {});
  } else {
    // Fallback: search for WhatsApp voice message play button
    const playBtn = document.querySelector(
      'button[aria-label*="Play"], span[data-icon="play-sound"]'
    ) as HTMLElement | null;
    if (playBtn) {
      playBtn.click();
    }
  }
});

ipcRenderer.on('media:stop', () => {
  const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>('audio, video'));
  for (const m of mediaElements) {
    m.pause();
    m.currentTime = 0;
  }
});


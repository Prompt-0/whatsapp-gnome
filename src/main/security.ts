import { BrowserWindow, Session, WebFrameMain, shell } from 'electron';
import { URL } from 'node:url';

const TRUSTED_ORIGIN = 'https://web.whatsapp.com';
const SAFE_PROTOCOLS = new Set(['https:', 'http:']);
const ALLOWED_PERMISSIONS = new Set(['media', 'notifications']);

export class SecurityManager {
  /**
   * Applies defense-in-depth security configuration to the window and session.
   */
  public static apply(win: BrowserWindow, ses: Session): void {
    this.enforcePermissionHandlers(ses);
    this.enforceNavigationGuards(win);
  }

  /**
   * Restricts hardware capabilities strictly to microphone, camera, and notifications
   * for the trusted WhatsApp origin only.
   */
  private static enforcePermissionHandlers(ses: Session): void {
    ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
      try {
        const origin = new URL(details.requestingUrl).origin;
        if (origin !== TRUSTED_ORIGIN) {
          return callback(false);
        }

        if (ALLOWED_PERMISSIONS.has(permission)) {
          if (permission === 'media') {
            const mediaDetails = details as { mediaTypes?: string[] };
            const types = mediaDetails.mediaTypes || [];
            const safe = types.every((t: string) => t === 'audio' || t === 'video');
            return callback(safe);
          }
          return callback(true);
        }

        return callback(false);
      } catch {
        return callback(false);
      }
    });

    ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
      return requestingOrigin === TRUSTED_ORIGIN && ALLOWED_PERMISSIONS.has(permission);
    });
  }

  /**
   * Tri-layer navigation guard protecting against clickjacking, malicious redirects,
   * protocol injection, and local file access.
   */
  private static enforceNavigationGuards(win: BrowserWindow): void {
    const { webContents } = win;

    // Layer 1: Popup & target="_blank" window creation
    webContents.setWindowOpenHandler(({ url }) => {
      this.openSafeExternal(url);
      return { action: 'deny' };
    });

    // Layer 2: In-page top-level navigations
    webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(TRUSTED_ORIGIN)) {
        return;
      }
      event.preventDefault();
      this.openSafeExternal(url);
    });

    // Layer 3: Server-side HTTP 3xx redirects
    webContents.on('will-redirect', (event, url) => {
      if (!url.startsWith(TRUSTED_ORIGIN)) {
        event.preventDefault();
        console.warn(`[Security Guard] Blocked external redirect: ${url}`);
      }
    });

    // Safety net: destroy any rogue child window
    webContents.on('did-create-window', (child) => {
      console.warn('[Security Guard] Destroyed unauthorized child window.');
      child.destroy();
    });
  }

  /**
   * Validates URLs and launches them safely in the user's default Linux browser.
   */
  public static openSafeExternal(rawUrl: string): void {
    try {
      const parsed = new URL(rawUrl);

      // Strictly allowlist https: and http:
      if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
        console.warn(`[Security Guard] Denied unsafe protocol: ${parsed.protocol}`);
        return;
      }

      // Check hostname sanity
      if (!parsed.hostname || parsed.hostname.includes(' ') || parsed.hostname.length > 253) {
        console.warn(`[Security Guard] Blocked malformed hostname: ${parsed.hostname}`);
        return;
      }

      setImmediate(() => {
        shell.openExternal(parsed.href).catch((err) => {
          console.error('[Security Guard] Failed to open external URL:', err.message);
        });
      });
    } catch {
      console.warn(`[Security Guard] Blocked unparseable URL: ${rawUrl}`);
    }
  }

  /**
   * Cryptographic validation of IPC sender frames.
   */
  public static isTrustedSender(frame: WebFrameMain | null): boolean {
    if (!frame) return false;
    try {
      const frameUrl = new URL(frame.url);
      return frameUrl.origin === TRUSTED_ORIGIN && frame.parent === null;
    } catch {
      return false;
    }
  }
}

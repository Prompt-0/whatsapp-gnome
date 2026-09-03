# Ticket T02: GNOME AppIndicator Tray, KStatusNotifierItem & Window Lifecycle Specification

## Executive Summary

1. **D-Bus Architecture**: Under GNOME Shell, system tray support is not built into the core compositor (`mutter`). It is provided by the canonical extension `AppIndicator and KStatusNotifierItem Support` (`appindicatorsupport@rgcjonas.gmail.com`). This extension owns the D-Bus bus name `org.kde.StatusNotifierWatcher` and consumes application tray items via `org.kde.StatusNotifierItem` and `com.canonical.dbusmenu`.
2. **Wayland Display Independence**: Wayland contains **no native tray protocol** (`wl_tray` does not exist). Tray integration on Linux Wayland is **100% out-of-band via the D-Bus Session Bus**. Native Wayland support with server-side/client-side decorations requires `--ozone-platform-hint=auto` and `--enable-features=WaylandWindowDecorations,UseOzonePlatform` appended before `app.whenReady()`.
3. **Singleton Tray Requirement**: To prevent duplicated tray icons and D-Bus zombie registrations (Electron upstream issue #40936), **never destroy and recreate `Tray` instances**. A single `Tray` instance must be retained for the process lifetime; all updates must use `tray.setImage()` and `tray.setContextMenu()`.
4. **Dynamic Badge Rendering**: Electron's `nativeImage` does not parse SVGs directly. Unread badges are dynamically rasterized to PNG buffers via an ultra-fast headless engine (`@resvg/resvg-js` or Chromium offscreen canvas) and cached using an in-memory `Map<string | number, NativeImage>` to eliminate memory churn and D-Bus signal thrashing.
5. **Window Lifecycle & Wayland Focus**: Closing the window is intercepted with `event.preventDefault(); window.hide();` conditioned on an explicit `isQuitting` flag. Single-instance restoration combines `window.restore()`, `window.show()`, `window.focus()`, and `window.flashFrame(true)` to bypass Wayland's strict focus-stealing prevention.

---

## 1. D-Bus Interface & GNOME Shell Tray Protocols

- `org.kde.StatusNotifierWatcher` (`/StatusNotifierWatcher`): Monitored on the session bus. Application registers by calling `RegisterStatusNotifierItem("/StatusNotifierItem")`.
- `org.kde.StatusNotifierItem` (`/StatusNotifierItem`): Implemented by Electron. Exports category (`"Communications"`), id (`"whatsapp-gnome"`), title (`"WhatsApp"`), status (`"Active"` or `"NeedsAttention"`), and `IconPixmap`.
- `com.canonical.dbusmenu` (`/MenuBar`): Renders context menu items via native GNOME Shell actors without rendering an X11/Wayland popup window.

---

## 2. Startup Flags & Wayland Compatibility

Applied before `app.whenReady()`:
```typescript
import { app } from 'electron';

export function configureLinuxPlatformFlags(): void {
  if (process.platform !== 'linux') return;
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations,UseOzonePlatform');
  app.setDesktopName('whatsapp-gnome.desktop');
}
```

---

## 3. Dynamic Tray Icon & Badge Generator

```typescript
import { nativeImage, NativeImage } from 'electron';
import { Resvg } from '@resvg/resvg-js';

export class TrayBadgeManager {
  private cache = new Map<string, NativeImage>();
  private baseIconSvg: string;

  constructor(baseIconSvg: string) {
    this.baseIconSvg = baseIconSvg;
    this.cache.set('0', this.rasterizeSvg(this.composeSvg(0)));
  }

  public getBadgeIcon(count: number): NativeImage {
    if (count <= 0) return this.cache.get('0')!;
    const key = count > 99 ? '99+' : count.toString();
    if (this.cache.has(key)) return this.cache.get(key)!;

    const renderedSvg = this.composeSvg(count);
    const image = this.rasterizeSvg(renderedSvg);
    this.cache.set(key, image);
    return image;
  }

  private composeSvg(count: number): string {
    if (count <= 0) return this.baseIconSvg;
    const displayCount = count > 99 ? '99+' : count.toString();
    const isMultiDigit = displayCount.length > 1;
    const badgeShape = isMultiDigit
      ? `<rect x="14" y="0" width="18" height="13" rx="6.5" fill="#EF4444" stroke="#FFFFFF" stroke-width="1.5"/>`
      : `<circle cx="23" cy="7" r="7" fill="#EF4444" stroke="#FFFFFF" stroke-width="1.5"/>`;

    const textX = '23';
    const textY = isMultiDigit ? '7.5' : '8';
    const fontSize = displayCount.length > 2 ? '7.5' : '9';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">
        <g id="base-icon">
          <circle cx="16" cy="16" r="14" fill="#25D366"/>
          <path fill="#FFFFFF" d="M16 4C9.4 4 4 9.4 4 16c0 2.3.7 4.5 1.9 6.4L4.5 28l5.8-1.4C12 27.5 14 28 16 28c6.6 0 12-5.4 12-12S22.6 4 16 4zm6.1 16.9c-.3.7-1.5 1.4-2.1 1.4-.6 0-1.3.3-4.3-1-3.6-1.5-5.9-5.2-6.1-5.4-.2-.3-1.5-2-1.5-3.8 0-1.8.9-2.7 1.3-3.1.3-.3.8-.5 1.2-.5.1 0 .3 0 .4.1.4 0 .6.1.8.6.3.8 1.1 2.6 1.2 2.8.1.2.1.4 0 .6-.1.2-.2.4-.4.6-.2.2-.4.4-.6.6-.2.2-.4.4-.2.8.5.8 1.3 2 2.5 3 1.5 1.3 2.7 1.8 3.1 2 .4.2.6.2.8-.1.3-.3 1.1-1.3 1.4-1.8.3-.5.6-.4 1-.2.4.1 2.6 1.2 3 1.4.4.2.7.4.8.5.1.4-.2 1.6-.5 2.3z"/>
        </g>
        <g id="badge-overlay">
          ${badgeShape}
          <text x="${textX}" y="${textY}" fill="#FFFFFF" font-family="Ubuntu, Inter, sans-serif" font-weight="bold" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">
            ${displayCount}
          </text>
        </g>
      </svg>
    `;
  }

  private rasterizeSvg(svgString: string): NativeImage {
    const resvg = new Resvg(svgString, { fitTo: { mode: 'width', value: 64 } });
    const pngBuffer = resvg.render().asPng();
    return nativeImage.createFromBuffer(pngBuffer, { scaleFactor: 2.0 });
  }
}
```

---

## 4. Window Lifecycle & Single Instance Lock

```typescript
import { app, BrowserWindow } from 'electron';

export class WindowLifecycleManager {
  private mainWindow: BrowserWindow | null = null;
  private isQuitting = false;

  constructor() {
    app.on('before-quit', () => { this.isQuitting = true; });
    process.on('SIGTERM', () => { this.isQuitting = true; app.quit(); });
    process.on('SIGINT', () => { this.isQuitting = true; app.quit(); });
  }

  public registerWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    this.mainWindow.on('close', (event: Electron.Event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });
  }

  public toggleWindow(): void {
    if (!this.mainWindow) return;
    if (this.mainWindow.isVisible()) {
      if (this.mainWindow.isFocused()) {
        this.mainWindow.hide();
      } else {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  public restoreAndFocus(): void {
    if (!this.mainWindow) return;
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
    this.mainWindow.flashFrame(true);
  }
}
```

---

## 5. Lessons Learned from Existing Wrappers

1. **`WAClient/WALC`**: Recreating `new Tray()` on settings change caused orphan D-Bus registrations and duplicate ghost icons on Linux. Solution: **Singleton `Tray` instance**.
2. **`eneshecan/whatsapp-for-linux`**: WebKitGTK user-agent sniffing and codec bugs caused frequent breakage. Solution: **Chromium in Electron provides 100% WhatsApp Web feature stability**.
3. **`rafatosta/zapzap`**: Flatpak sandbox required explicit `--talk-name=org.kde.StatusNotifierWatcher`.
4. **Wayland Focus Stealing**: Simple `focus()` fails silently from background processes; combining `restore()`, `show()`, `focus()`, and `flashFrame(true)` guarantees GNOME compositor alert/window raising.

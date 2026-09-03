import { BrowserWindow, nativeTheme } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class AdwaitaThemeManager {
  private adwaitaCss: string = '';
  private currentCssKey: string | null = null;

  constructor(assetsDir: string) {
    const cssPath = path.join(assetsDir, 'adwaita.css');
    try {
      if (fs.existsSync(cssPath)) {
        this.adwaitaCss = fs.readFileSync(cssPath, 'utf8');
      }
    } catch (err) {
      console.error('[AdwaitaThemeManager] Failed to load adwaita.css:', err);
    }
  }

  public attach(win: BrowserWindow): void {
    const applyTheme = async () => {
      if (win.isDestroyed()) return;

      const isDark = nativeTheme.shouldUseDarkColors;

      // 1. Inject Libadwaita custom stylesheet
      if (this.adwaitaCss) {
        try {
          if (this.currentCssKey) {
            await win.webContents.removeInsertedCSS(this.currentCssKey);
          }
          this.currentCssKey = await win.webContents.insertCSS(this.adwaitaCss);
        } catch {
          // Window may be navigating
        }
      }

      // 2. Synchronize dark class on document.body for WhatsApp Web
      const themeCode = `
        (() => {
          const isDark = ${isDark};
          if (isDark) {
            document.body.classList.add('dark');
            document.documentElement.classList.add('dark');
          } else {
            document.body.classList.remove('dark');
            document.documentElement.classList.remove('dark');
          }
        })();
      `;

      try {
        await win.webContents.executeJavaScript(themeCode);
      } catch {
        // Page may be loading
      }
    };

    // Apply on initial load completion
    win.webContents.on('did-finish-load', () => {
      applyTheme();
    });

    // React to GNOME system theme changes dynamically
    nativeTheme.on('updated', () => {
      applyTheme();
    });
  }
}

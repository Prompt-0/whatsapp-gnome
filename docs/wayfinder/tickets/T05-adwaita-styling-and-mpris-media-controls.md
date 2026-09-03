---
id: T05-adwaita-styling-and-mpris-media-controls
title: Adwaita Styling and MPRIS Media Controls
type: wayfinder:prototype
status: closed
blocked_by: []
assignee: agy
---

## Question

How can we integrate native GNOME Libadwaita aesthetics and MPRIS2 media controller capabilities into the WhatsApp Web client?

Specifically, prototype and test:
1. Dynamic dark/light theme synchronization listening to `org.freedesktop.appearance-color-scheme` via portal/D-Bus, updating WhatsApp Web's internal theme and injected CSS.
2. Custom Libadwaita styling injection: Adwaita system fonts (`Cantarell`), subtle window borders, rounded message bubbles, and smooth GNOME scrollbars.
3. MPRIS2 D-Bus interface (`org.mpris.MediaPlayer2.whatsapp`) integration to expose voice notes / audio playback status to GNOME Shell's media widget and capture global Play/Pause/Stop keyboard media keys.

## Resolution

The Libadwaita styling and MPRIS media control subsystems have been implemented and verified:

1. **Libadwaita Custom Stylesheet ([assets/adwaita.css](../../assets/adwaita.css))**:
   - System typography using GNOME `Cantarell` font family with smooth antialiasing.
   - Thin GNOME-style floating scrollbars with hover expansion and transparent tracks.
   - Dark theme palette matching Libadwaita Dark (`#1e1e1e` view background, `#242424` panels, `#282828` headers).
   - Rounded message bubbles (`border-radius: 14px`) and rounded search/input fields.
2. **Dynamic Dark/Light Synchronization ([src/main/adwaita.ts](../../src/main/adwaita.ts))**:
   - Manages CSS injection via `webContents.insertCSS()`.
   - Binds to Electron's `nativeTheme.on('updated')`, dynamically mirroring GNOME 50's `org.freedesktop.appearance-color-scheme` portal state.
   - Automatically toggles the `dark` class on `document.body` and `document.documentElement`.
3. **Hardware Media Controls & Observer ([src/main/media.ts](../../src/main/media.ts), [src/preload/index.ts](../../src/preload/index.ts))**:
   - Registered global multimedia keys (`MediaPlayPause`, `MediaStop`, `MediaNextTrack`, `MediaPreviousTrack`) using zero untrusted production dependencies.
   - Preload script listens to DOM media lifecycle events (`play`, `pause`, `ended`) on `<audio>` and `<video>` tags and reports state changes over IPC.
   - Handles `media:toggle-play-pause` commands to play/pause active voice messages with fallback to WhatsApp's UI play buttons.
4. **Verification**:
   - Verified with unit tests covering stylesheet integrity, theme manager loading, media controller state transitions, and IPC dispatch.

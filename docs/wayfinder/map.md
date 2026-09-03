# Wayfinder Map: WhatsApp Web Native GNOME Desktop Client

## Destination

A high-quality, battle-tested, secure, and feature-rich Linux desktop client built exclusively for GNOME 50 on pure Wayland wrapping WhatsApp Web. Engineered with hardened Chromium process sandboxing and context isolation, it strictly conforms to the XDG Base Directory Specification, delivering seamless background autostart on system reboot minimized to the AppIndicator / KStatusNotifierItem tray, rich native desktop notifications with unread counts and direct actions, MPRIS2 media key support, GNOME Libadwaita dark/light styling, and local session protection.

## Notes

- **Domain**: Linux Desktop (GNOME 50), Pure Wayland (`--ozone-platform=wayland`), XDG Base Directory Specification, AppIndicator / KStatusNotifierItem, XDG Portals, Electron Sandboxing, WhatsApp Web Client Architecture, MPRIS2 D-Bus, Secret Service / libsecret.
- **Relevant Skills**: `codebase-design`, `frontend-design`, `diagnosing-bugs`, `systematic-debugging`, `test-driven-development`.
- **Standing Preferences**:
  - **Pure Wayland Only**: Explicitly target GNOME 50 Wayland (`--ozone-platform=wayland`, `--enable-features=WaylandWindowDecorations`), eliminating legacy X11 / XWayland overhead.
  - **Strict XDG Base Directory Compliance**: Cleanly segregate filesystem paths:
    - `$XDG_CONFIG_HOME/whatsapp-gnome` (defaults to `~/.config/whatsapp-gnome`): user configuration and window state.
    - `$XDG_DATA_HOME/whatsapp-gnome` (defaults to `~/.local/share/whatsapp-gnome`): persistent session partition (`persist:whatsapp-session`), desktop launcher, icons.
    - `$XDG_CACHE_HOME/whatsapp-gnome` (defaults to `~/.cache/whatsapp-gnome`): avatar disk cache, HTTP cache, shader cache.
    - `$XDG_STATE_HOME/whatsapp-gnome` (defaults to `~/.local/state/whatsapp-gnome`): runtime logs.
  - **Security First**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, zero remote Node code execution, strict CSP, strict navigation guard, safe external link handler via `shell.openExternal`.
  - **Battle-Tested Provenance**: Adapt vetted, battle-tested implementations from established open-source clients (`eneshecan/whatsapp-for-linux`, `rafatosta/zapzap`, `WAClient/WALC`), rigorously auditing every line for security and memory safety.
  - **Deep GNOME Integration**: Native AppIndicator with badge counter, XDG desktop autostart, GNOME notification daemon integration, Libadwaita styling.
  - **Container Port Boundaries**: If any local server/port is ever spawned, strictly follow mapped port ranges (3000-3010, 5000-5010, 8000-8020).
  - **Refer by Name**: Refer to tickets by name, never bare numbers.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Security Hardening and Sandboxing Architecture](./tickets/T01-security-hardening-and-sandboxing-architecture.md): Zero-trust multi-layered sandboxing with `contextIsolation: true`, `sandbox: true`, Signal WebAssembly CSP header rewriting, tri-layer navigation guard with safe external URL dispatching, senderFrame IPC origin verification, and isolated session storage under `persist:whatsapp-session`.
- [AppIndicator Tray and Window Lifecycle](./tickets/T02-appindicator-tray-and-window-lifecycle.md): GNOME Shell AppIndicator/KStatusNotifierItem D-Bus integration, Wayland Ozone flags, singleton Tray instance to avoid zombie registrations, dynamic SVG/PNG unread badge overlays, and window hide-to-tray lifecycle with focus-stealing mitigation.
- [Rich GNOME Notifications and Unread Badge](./tickets/T03-rich-gnome-notifications-and-unread-badge.md): Dual-tier preload/main-world notification proxying, avatar blob transcoding and disk caching, in-place notification updates via FreeDesktop D-Bus, deep chat switching on click, and triple-layer unread badge synchronization across Dash-to-Dock, AppIndicator, and window title.
- [Core Application Scaffold and Sandbox Implementation](./tickets/T07-core-application-scaffold-and-sandbox-implementation.md): Scaffolded Electron 44 + TypeScript application with pure Wayland Ozone flags, SecurityManager, WindowController, TrayManager, and verified preload bridge.
- [Autostart and Background Startup](./tickets/T04-autostart-and-background-startup.md): Dual-mode autostart subsystem supporting standard XDG autostart `.desktop` entry with delay flag and `systemd --user` service unit, wired to `--hidden` launch flags and settings IPC.


## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

- **Audio/Video Call WebRTC Codec & PipeWire Device Selection**: Ensuring PipeWire microphone/camera streaming and screen sharing work flawlessly on GNOME Wayland sessions during WhatsApp calls.
- **Offline Network Reconnection Resilience**: Handling system sleep/suspend/resume events and network topology changes without stalling or requiring manual app reloads.
- **Multi-Account Profile Switching**: Architecting isolated session partitions if concurrent personal and work WhatsApp accounts are needed.
- **Packaging & Distribution Pipeline**: Creating Flatpak / AppImage / native RPM bundle for seamless system-level installation.

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->

- **Reverse Engineering WhatsApp Private Protocol**: Modifying WhatsApp's underlying WebSocket protocol or building a headless chatbot daemon (this wrapper embeds the official WhatsApp Web UI to eliminate account ban risks).
- **Multi-Platform Support (Windows/macOS)**: Cross-platform tailoring outside Linux GNOME desktop environment.

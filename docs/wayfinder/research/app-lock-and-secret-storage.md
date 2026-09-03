# Ticket T06: App Lock, PIN Protection & Secure Secret Storage Specification

## Executive Summary

1. **Process-Isolated Lock Screen Architecture (`WebContentsView`)**: In-page DOM overlays are fundamentally insecure—any renderer DevTools inspection, DOM deletion (`#lock-overlay.remove()`), CSS tampering, or web-app script crash bypasses the lock entirely and exposes decrypted WhatsApp Web chats. We architect the App Lock using Electron's modern `WebContentsView` primitive. The lock screen runs in a separate Chromium renderer process with an isolated V8 heap, loading local Adwaita HTML/CSS assets. When locked, the WhatsApp Web view is muted and detached from the window container, guaranteeing zero DOM tampering, zero GPU frame snooping, and zero background audio playback.
2. **Zero-Runtime-Dependency Philosophy**: Consistent with the project's strict `"dependencies": {}` supply-chain policy, we reject deprecated native C++ addons (`keytar`) and heavy native binaries (`@napi-rs/keyring`). Instead, we specify a **Two-Tier Hybrid Storage Engine**:
   - **Tier 1 (System Keyring)**: Standard FreeDesktop Secret Service API (`org.freedesktop.secrets`) via GNOME's native `secret-tool` CLI.
   - **Tier 2 (Graceful Offline Fallback)**: Authenticated AES-256-GCM encrypted vault file (`$XDG_CONFIG_HOME/whatsapp-gnome/vault.enc` or `~/.config/whatsapp-gnome/vault.enc`) managed purely by Node.js native `crypto`.
3. **Hardware-Bound, Memory-Hard Key Derivation (scrypt)**: Low-entropy 4-to-8 digit PINs are vulnerable to brute-force cracking if evaluated with standard SHA-256 or PBKDF2 on modern GPUs. We specify `crypto.scryptSync` with memory-hard parameters ($N = 32768, r = 8, p = 1$, requiring 32 MB RAM per attempt) combined with a dual-salt: 32 cryptographically secure random bytes hashed with the machine's immutable hardware identity (`/etc/machine-id`). This renders offline GPU cracking impossible without physical possession of the specific Linux workstation.
4. **Comprehensive System & Window Lifecycle Hooks**:
   - **System Sleep / Suspend**: Electron's `powerMonitor.on('suspend')` locks the application before `systemd-logind` suspends the kernel.
   - **GNOME Screen Shield**: `powerMonitor.on('lock-screen')` locks the app the instant GNOME Shell engages the desktop lock screen (`org.gnome.ScreenSaver`).
   - **Minimize to Tray**: Intercepting window close/hide events instantly engages the lock when minimized to the AppIndicator tray.
   - **Dual-Layer Inactivity Watchdog**: A configurable auto-lock timer combines OS-level idle tracking (`powerMonitor.getSystemIdleTime()` via Mutter D-Bus) with debounced in-app user activity heartbeats.
5. **Privacy-Preserving Notification Shielding**: Incoming WhatsApp notifications during a locked state are intercepted by a main-process middleware. Sender names, message text, and profile avatars are redacted into generic alerts (`"WhatsApp: New message received — Unlock to view"`), while maintaining unread badge counters on the GNOME Dash dock and AppIndicator tray. Clicks on locked notifications are enqueued and automatically replayed to WhatsApp Web once the correct PIN is provided.
6. **Anti-Brute-Force & Side-Channel Hardening**: Enforces an exponential backoff lockout policy (30s after 5 failed attempts; 5m after 10 attempts) persisted to disk, constant-time verification (`crypto.timingSafeEqual`), and zeroing of sensitive plaintext memory buffers.

---

## 1. Local App Lock Architecture & Anti-Tamper Defense

### 1.1 Architectural Vulnerabilities of In-DOM Overlays

Prior open-source wrappers (e.g., WALC, early WhatsApp Linux packages) implemented app locks by injecting an HTML `<div>` overlay directly into WhatsApp Web's DOM. In an Electron desktop environment, this introduces critical security vulnerabilities:

| Attack Vector | In-DOM Overlay Mechanism | Process-Isolated `WebContentsView` |
| :--- | :--- | :--- |
| **DevTools / DOM Deletion** | **Bypassed in 1 second**: `document.getElementById('lock-screen').remove()` or unchecking `display: none` in DevTools instantly restores full chat access. | **Immune**: Lock screen lives in a completely separate Chromium process and DOM tree; WhatsApp renderer cannot access or mutate it. |
| **CSS / Z-Index Tampering** | **Vulnerable**: Malicious extensions, user scripts, or XSS can set `#lock-screen { z-index: -99999 !important; pointer-events: none !important; }`. | **Immune**: Lock screen is rendered on an independent GPU surface layer composited by the main process. |
| **XSS / Content Hijacking** | **Critical**: An XSS on WhatsApp Web (e.g. CVE-2019-18426) can hook `input` events on the lock screen and exfiltrate the master PIN to remote command-and-control servers. | **Zero Exposure**: PIN entry occurs in an isolated local origin (`file://` or custom protocol) with context isolation and zero network access. |
| **Acoustic & Frame Leakage** | **Leaking**: In-DOM overlays leave WhatsApp Web active; incoming voice notes and audio calls continue to ring; desktop thumbnails in GNOME Overview capture live chats behind semi-transparent overlays. | **Zero Leakage**: WhatsApp Web view is explicitly audio-muted (`setAudioMuted(true)`) and removed from the window hierarchy, rendering only the blank Adwaita lock screen in GNOME Overview. |

### 1.2 `WebContentsView` View-Swapping Engine

In modern Electron (v30+ through v44+), `BrowserView` is deprecated in favor of `WebContentsView`. The main `BrowserWindow` acts as a host container with a root `contentView`. 

```
                                  +---------------------------------------+
                                  |         BrowserWindow (Host)          |
                                  |           (title: WhatsApp)           |
                                  +---------------------------------------+
                                                     |
                                   win.contentView.addChildView(...)
                                                     |
                 +-----------------------------------+-----------------------------------+
                 |                                                                       |
                 v                                                                       v
+---------------------------------+                                     +---------------------------------+
|   whatsAppView: WebContentsView |                                     |    lockView: WebContentsView    |
|---------------------------------|                                     |---------------------------------|
| - URL: web.whatsapp.com         |                                     | - URL: file://assets/lock/...   |
| - Partition: whatsapp-session   |          STATE TRANSITION           | - Partition: memory (ephemeral) |
| - Audio: Active / Unmuted       |  ================================>  | - Audio: Muted                  |
| - Sandbox: true                 |         appLock.lock()              | - Preload: lock-preload.js      |
| - Status: Detached / Hidden     |                                     | - Status: Attached & Focused    |
+---------------------------------+                                     +---------------------------------+
```

---

## 2. Key Derivation & Multi-Tier Credential Storage

### 2.1 Threat Model of Passcodes & PINs

Users typically configure a 4-to-6 digit PIN for quick screen unlocking. 
- **Entropy calculation**: A 4-digit PIN has only $10^4 = 10,000$ combinations (~13.3 bits of entropy). A 6-digit PIN has $1,000,000$ combinations (~19.9 bits).
- **Fast-Hash Vulnerability**: With standard SHA-256 or SHA-512, an attacker on a consumer workstation can compute $10^8$ hashes per second. A 4-digit PIN would be cracked in **0.1 milliseconds**; a 6-digit PIN in **10 milliseconds**.
- **PBKDF2 Vulnerability**: While PBKDF2 with 600,000 iterations slows down single-threaded CPUs, it is not memory-hard. Modern GPUs (e.g. RTX 4090) can test hundreds of thousands of candidates simultaneously in tiny on-chip registers.

### 2.2 Defensive Architecture: Memory-Hard `scrypt` with Machine Binding

To ensure resilience against offline attacks, we mandate `scrypt` (RFC 7914) combined with physical hardware machine binding:

1. **Memory-Hard Cost ($N=32768, r=8, p=1$)**: Requires exactly $32768 \times 8 \times 128 \text{ bytes} = 33,554,432 \text{ bytes}$ (32 MB) of RAM per candidate. A GPU with 16 GB VRAM can test at most ~500 candidate PINs simultaneously, reducing crack speeds by four orders of magnitude.
2. **Machine ID Binding**: `/etc/machine-id` (or fallback `/var/lib/dbus/machine-id`) is unique per Linux installation. Even if an attacker copies the vault file to an external cracking cluster, candidate verification fails completely without the target machine's hardware ID.

### 2.3 Tier 2: Graceful Encrypted Fallback Vault (`vault.enc`)

When GNOME Keyring is locked (e.g. autologin enabled without PAM unlock), headless, or running inside a container without D-Bus session access, the application falls back to `~/.config/whatsapp-gnome/vault.enc` using authenticated AES-256-GCM.

---

## 3. Auto-Lock & Idle Detection

Detection is split into two complementary layers:
1. **Global System Idle Detection (`powerMonitor.getSystemIdleTime()`)**: Queries Mutter's D-Bus interface (`org.gnome.Mutter.IdleMonitor`). Triggers when the user steps away from their computer entirely.
2. **In-App Activity Watchdog**: Preload tracks renderer input events (`pointerdown`, `keydown`) and sends throttled heartbeats (`whatsapp:user-activity`) at most once every 30 seconds. This allows auto-locking when WhatsApp is left unfocused or idle in the background while the user works in another window.

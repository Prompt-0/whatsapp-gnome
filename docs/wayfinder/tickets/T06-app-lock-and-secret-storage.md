---
id: T06-app-lock-and-secret-storage
title: App Lock and Secret Storage
type: wayfinder:research
status: closed
blocked_by: []
assignee: agy
---

## Question

How can we implement a tamper-resistant local App Lock and secure key storage for WhatsApp Web on GNOME Linux?

Specifically, investigate and specify:
1. Master PIN / Passcode screen overlay mechanism that intercepts window show/restore and blocks interaction until unlocked.
2. Inactivity/idle auto-lock timer integration.
3. Storage of password hash / encryption key using the FreeDesktop Secret Service API (`org.freedesktop.secrets` / GNOME Keyring / `libsecret` via keytar or `@napi-rs/keyring`).
4. Safe fallback behavior if GNOME Keyring is locked or unavailable.

## Resolution

A comprehensive security research investigation was conducted and documented in [docs/wayfinder/research/app-lock-and-secret-storage.md](../research/app-lock-and-secret-storage.md):

1. **Tamper-Resistant Process Isolation (`WebContentsView`)**:
   - Rejected in-DOM overlays due to trivial bypass via DevTools element deletion and CSS manipulation.
   - Designed a dual-view swapping engine: when locked, the WhatsApp Web view is audio-muted and detached from the window hierarchy, replaced by an isolated sandboxed `WebContentsView` loading local Adwaita lock assets.
2. **Two-Tier Zero-Dependency Secret Storage**:
   - **Tier 1 (GNOME Keyring)**: Interacts with `org.freedesktop.secrets` via native `secret-tool` CLI.
   - **Tier 2 (Encrypted Fallback)**: Authenticated AES-256-GCM encrypted vault (`~/.config/whatsapp-gnome/vault.enc`).
   - Uses memory-hard `crypto.scryptSync` ($N=32768, r=8, p=1$, 32 MB RAM) bound to `/etc/machine-id` to neutralize offline GPU brute-force cracking.
3. **Comprehensive Lifecycle & Idle Hooks**:
   - Automatic locking on system lock screen (`powerMonitor.on('lock-screen')`), system suspend/sleep (`powerMonitor.on('suspend')`), and tray minimize.
   - Dual-layer inactivity watchdog combining OS-level Mutter idle detection (`powerMonitor.getSystemIdleTime()`) and debounced in-app activity tracking.
4. **Privacy Shield for Notifications**:
   - Automatic redaction of contact names and message bodies while locked (`"WhatsApp: New message received — Unlock to view"`).
   - Notification clicks while locked queue the target chat to be opened immediately upon PIN unlock.

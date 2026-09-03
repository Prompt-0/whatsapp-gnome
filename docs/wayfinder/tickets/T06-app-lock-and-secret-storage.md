---
id: T06-app-lock-and-secret-storage
title: App Lock and Secret Storage
type: wayfinder:research
status: open
blocked_by: []
assignee: null
---

## Question

How can we implement a tamper-resistant local App Lock and secure key storage for WhatsApp Web on GNOME Linux?

Specifically, investigate and specify:
1. Master PIN / Passcode screen overlay mechanism that intercepts window show/restore and blocks interaction until unlocked.
2. Inactivity/idle auto-lock timer integration.
3. Storage of password hash / encryption key using the FreeDesktop Secret Service API (`org.freedesktop.secrets` / GNOME Keyring / `libsecret` via keytar or `@napi-rs/keyring`).
4. Safe fallback behavior if GNOME Keyring is locked or unavailable.

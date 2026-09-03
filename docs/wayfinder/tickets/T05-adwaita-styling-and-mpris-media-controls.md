---
id: T05-adwaita-styling-and-mpris-media-controls
title: Adwaita Styling and MPRIS Media Controls
type: wayfinder:prototype
status: open
blocked_by: []
assignee: null
---

## Question

How can we integrate native GNOME Libadwaita aesthetics and MPRIS2 media controller capabilities into the WhatsApp Web client?

Specifically, prototype and test:
1. Dynamic dark/light theme synchronization listening to `org.freedesktop.appearance-color-scheme` via portal/D-Bus, updating WhatsApp Web's internal theme and injected CSS.
2. Custom Libadwaita styling injection: Adwaita system fonts (`Cantarell`), subtle window borders, rounded message bubbles, and smooth GNOME scrollbars.
3. MPRIS2 D-Bus interface (`org.mpris.MediaPlayer2.whatsapp`) integration to expose voice notes / audio playback status to GNOME Shell's media widget and capture global Play/Pause/Stop keyboard media keys.

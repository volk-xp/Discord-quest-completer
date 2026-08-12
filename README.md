<p align="center">
  <h1 align="center">🔥 Discord Quest Completer</h1>
  <p align="center"><b>By Volk.xp</b></p>
</p>

A Windows desktop app for completing Discord Quests and simulating Rich Presence status — without downloading the actual games. Built with Tauri, Rust, and Vue.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Downloading the App](#downloading-the-app)
  - [Option A — Installer (.exe)](#option-a--installer-exe)
  - [Option B — Portable (.zip)](#option-b--portable-zip)
- [First Launch](#first-launch)
- [How to Complete a Discord Quest](#how-to-complete-a-discord-quest)
- [Using Favorites](#using-favorites)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Auto-Updates](#auto-updates)
- [Windows SmartScreen Warning](#windows-smartscreen-warning)
- [Troubleshooting](#troubleshooting)
- [Uninstalling](#uninstalling)
- [Disclaimer](#disclaimer)

---

## How It Works

Discord scans your PC for running processes and file paths that match its list of **verified, quest-eligible games**. It doesn't check whether the *real* game is running — only whether a process with the expected name exists in the expected folder.

This app takes advantage of that by:

1. **Fetching Discord's own list** of verified games (`detectable.json`), the same data Discord uses internally
2. **Creating a small dummy executable**, renamed and placed exactly where Discord expects the real game's `.exe` to be
3. **Launching that dummy process**, which Discord's client detects as "this game is running"
4. **Simulating Rich Presence** (the "Playing X" status under your name) via Discord's official RPC gateway, using the real game's App ID

No game files are downloaded, modified, or pirated — the dummy executable is a tiny native Windows program that does nothing except exist under the right name.

---

## Features

- 🔍 Search and browse Discord's full list of verified games
- ▶️ One-click quest-eligible game launching
- 📡 Rich Presence (RPC) status testing
- ⭐ Permanent Favorites — pinned games survive app restarts
- 📊 Live session timer and connection status
- 🔄 Automatic update checking
- ⌨️ Command palette (`Ctrl+K`) for quick navigation
- 📜 Play history log

---

## Downloading the App

Go to the **[Releases page](https://github.com/volk-xp/Discord-quest-completer-by-Volk/releases)** and pick one of two download methods.

### Option A — Installer (.exe)

Recommended for most users. Installs like any normal Windows application.

1. Download **`discord-quest-completer-setup.exe`** from the latest release
2. Run the installer and follow the prompts
3. Launch **Discord Quest Completer** from the Start Menu

This method also enables **automatic updates** — see [Auto-Updates](#auto-updates) below.

### Option B — Portable (.zip)

No installation — just extract and run. Good if you don't want anything added to your Start Menu or registry.

1. Download the `.zip` file from the latest release
2. Extract it to a folder **you have write/execute permissions in** (avoid `C:\Program Files\` or the root of `C:\`)
3. Run `discord-quest-completer.exe` inside the extracted folder

> ⚠️ The portable version does **not** auto-update. You'll need to manually download future releases.

---

## First Launch

On your first launch, a short onboarding screen introduces the app. WebView2 is required to run it — this comes pre-installed on Windows 11, but if you're on an older Windows 10 build, [download it here](https://developer.microsoft.com/en-us/microsoft-edge/webview2).

---

## How to Complete a Discord Quest

1. Open **Discord**, go to the **Quests** tab (gift icon in the bottom-left, or under the app launcher)
2. Find a quest that says **"Play [Game Name] for X minutes"**
3. Note the exact game name required
4. Open **Discord Quest Completer**
5. Use the search bar to find that exact game and add it to your list
6. Select the game, then click **Play** — this launches the dummy executable that Discord detects as the real game running
7. Leave both Discord and Discord Quest Completer open in the background for the full duration the quest requires
8. Check the Quests tab — progress should update automatically as time passes
9. Once complete, you can close the game from the app (Stop button) and claim your reward in Discord

> **Note:** Not all quests can be completed this way. Some require actual gameplay actions (not just "time played") or streaming, which this method doesn't support.

---

## Using Favorites

- Click the **☆** next to any game to pin it — it turns into **★** and moves to the Favorites tab
- Favorites persist **permanently** — they survive removing the game from your main list or fully restarting the app
- From the **Favorites** tab (star icon in the sidebar), click **Play** on any favorited game to launch it directly — no need to search for it again

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + K` | Open the command palette |

---

## Auto-Updates

If you installed via the `.exe` installer, the app checks for new versions automatically on launch. When an update is available:

1. A banner appears at the top of the window
2. Click **View** to see what changed
3. Click **Install & Restart** to download, verify, and apply the update automatically

Updates are cryptographically signed — the app will refuse to install anything that isn't verified as coming from this project.

---

## Windows SmartScreen Warning

Since this app isn't signed with a paid Microsoft-trusted certificate, Windows may show a **"Windows protected your PC"** warning on first launch. This is expected for small, independently-built software and does not mean the app is unsafe.

To proceed:
1. Click **More info**
2. Click **Run anyway**

If you'd like to verify the file yourself before running it, you can scan it with [VirusTotal](https://www.virustotal.com).

---

## Troubleshooting

**The game list won't load / shows an error**
Check your internet connection — the app needs to reach Discord's servers on first launch to fetch the verified games list.

**Discord isn't showing the game as "Playing"**
Make sure Discord's own **"Display current activity as a status message"** setting is enabled under *User Settings → Activity Privacy*.

**The app won't start / crashes immediately**
Make sure [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2) is installed.

---

## Uninstalling

**If installed via the .exe installer:**
Uninstall it like any normal Windows app — via *Settings → Apps* or the Start Menu.

**If using the portable .zip version:**
Just delete the extracted folder. Everything the app creates (dummy game files, settings) lives inside that same folder.

---

## Disclaimer

This tool is intended for **educational purposes and personal use only**. Please respect Discord's Terms of Service and game publishers' rights when using this application.

The creators and maintainers of this project are not liable for any damages, account actions, or other consequences that may arise from using this software. **Use at your own risk.**

This project is not affiliated with, endorsed by, or connected to Discord Inc. in any way.

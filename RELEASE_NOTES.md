## Launched games now close themselves

Launch a game through any of its platform executables and a countdown starts. Discord credits a quest after roughly 15 minutes of detected playtime, so the window is held open for **16 minutes** — a full minute of breathing room — and then closes on its own. No more leaving something running for an hour because you walked away.

- The big clock on the home screen counts down to zero, so you always know how much longer to wait.
- Every launched executable gets its **own independent countdown**, shown right next to it in the list. Run several at once and each one closes at its own time.
- You get a notification when a window closes itself, and it's written to your activity history like any other action.
- Stopping a game by hand still works exactly as before, and cancels that game's countdown.
- **Test RPC is deliberately unchanged** — it has no time limit and keeps running until you disconnect it yourself.

## A completely rebuilt interface

The app has been redesigned from the ground up: a darker, calmer control-panel look built around a single amber accent, with tighter spacing and clearer status indicators throughout. The sidebar, home screen, game list, executable rows, notifications, undo prompt, update banner, first-run walkthrough and command palette have all been reworked to match.

- **Real typefaces at last.** The app never used to specify a font and simply inherited whatever Windows handed it. Now headings, numbers and file paths each use a typeface picked for the job — all of them already included with Windows, so nothing is downloaded and nothing jumps around while the app loads.
- **No more accidental light mode.** The main screen used to turn washed-out and hard to read if Windows was set to a light theme. It now keeps a consistent dark look either way.
- **Live status you can actually see.** Running executables, connected Rich Presence and active countdowns are all called out clearly instead of blending into the page.

## Updates finally reach you

This is the important invisible fix. Every previous release was published in a form the built-in updater couldn't see, so "check for updates" came back empty even when a newer build existed. That's corrected as of this release. Because the problem was in how releases were published rather than in the app itself, existing installs should now be able to find this update on their own.

## Smaller fixes and polish

- The game list header now stays in place while you scroll instead of drifting away.
- Fixed a pair of empty divider lines that drew a hollow gap on the home screen when no game was selected.
- The stray lightning bolt above the logo is now a live indicator that lights up when Rich Presence is connected.
- The window title reads **Discord Quest Completer** in full instead of the abbreviated "Discord QC".
- Cleaner controls: remove buttons are now a compact ✕ with a tooltip, and field labels read as small uppercase headings.

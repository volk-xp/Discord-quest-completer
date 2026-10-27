# Release 25.10.9

## More reliable updates

- Check for signed updates at startup, every 15 minutes, after reconnecting, and when returning to the app.
- Add App updates to Settings with the installed version, a manual Check for updates button, and Install & restart.
- Display check and installation errors instead of silently hiding failures.
- Limit update-check requests to 15 seconds and prevent overlapping checks or installations.
- Clear stale pending updates after a failed check.

Includes the process ownership, native auto-stop, path containment, saved-data recovery, catalog validation, and updater security fixes from 25.10.8.

Updates remain signed with the existing updater key. Older installations check for this release when reopened; installations with a broken updater may require a one-time manual installation. Local game timers do not measure Discord quest progress.

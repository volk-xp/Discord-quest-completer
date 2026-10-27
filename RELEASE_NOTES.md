# Release 25.10.8

## Safer game helpers

- Validate catalog metadata and enforce game-folder containment in Rust, including executable paths and reparse points.
- Retain ownership of launched processes; Stop closes only helpers started by this app.
- Enforce the local 16-minute deadline in the native session manager, independently of displayed rows and view lifetimes.
- Clean up owned helpers on shutdown and unexpected parent termination.
- Preserve active session associations when games are removed and added again.

## Reliability and saved data

- Validate downloaded and bundled catalogs, limit response size, and fall back when a source fails.
- Preserve recoverable favorites and validate stored history.
- Reconcile Discord RPC connection status and cancellation with native state.
- Bound activity logs, isolate editable game rows from catalog metadata, and support Unicode helper paths.

## Updates and development

- Update the updater dependency and disable downgrades.
- Keep application, installer, tag, and update-manifest versions consistent.
- Correct the updater repository URL and accept the original legacy release tag.
- Add frontend and native regression coverage and reproducible Windows helper preparation.

Local countdowns do not measure or confirm Discord quest completion. Check progress and requirements in Discord.

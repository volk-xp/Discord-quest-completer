# Managed game path boundary

Catalog responses and saved favorites are validated and reconstructed from allowed
fields. Catalog `path`, `filename`, `segments`, and installation/running flags are
discarded. Both launch entry points derive display fields from the executable name.
Native commands receive the exact decimal application ID as a string and one
relative executable name; they no longer accept a directory or segment count.

Rust independently validates all components using Windows filename rules. Absolute
paths, traversal, alternate data streams, reserved device names, empty components,
wildcards, and trailing dots/spaces are rejected. Only `.exe` helpers are accepted.
Unsafe executable patterns in an otherwise valid catalog are omitted.

File operations are confined to `games/<app-id>/<app-version>/...` beside the application.
Directory handles are opened without following reparse points and held through
copying/spawning. Canonical containment is checked for descendants of the games
root. Symlinks and junctions within this managed hierarchy are rejected. The
application directory and bundled helper are trusted deployment inputs.

Creation writes to an exclusively created temporary file in the destination
directory, syncs it, and publishes it without replacing an existing destination.
`tempfile` provides temporary-file cleanup and publication without overwriting.
Failed copies never publish a partial helper. Before reusing or launching a helper,
its content must match the bundled helper. A read handle stays open through process
creation to prevent replacement or modification after verification.

## Existing installations

Saved favorites keep their local identity but lose stale running/installed flags.
Each application version installs its own helper copy. Legacy unversioned helpers,
earlier versions, and abandoned temporary files remain untouched. An update creates
the new version's copy without requiring removal of an old or interrupted copy;
rolling back can reuse the previous version's verified helper. An unfamiliar file
at the current version's destination is still refused. Old versions and abandoned
files are not automatically deleted. IDs previously rounded by JavaScript may
leave an unused old directory; new directories use the exact catalog ID.

## Regression checks

Frontend validation, component events, native command payloads, and error handling:

```powershell
pnpm test:paths
pnpm build
```

Use Windows with the Rust MSVC toolchain, Visual Studio C++ Build Tools and Windows
SDK; the filesystem tests require an NTFS temporary directory and Windows
PowerShell for junction fixtures. The application's build prerequisites and bundled
resources must be present:

```powershell
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

The tests cover valid paths, traversal, invalid IDs, junctions, hard links,
untrusted existing files, replacement protection, spawning a verified binary,
version upgrades and rollback, failed copies, and concurrent destination creation.

# Windows development and builds

Use Windows x64 with Node.js LTS, pnpm 8.15.3 (the version pinned in
`package.json`), Rust stable with the MSVC toolchain, Visual Studio C++ build
tools and WebView2 installed. Run commands from the repository root.

```powershell
pnpm install --frozen-lockfile
pnpm test:paths
pnpm tauri:dev
```

`tauri:dev` builds the Windows helper, creates `src-tauri/resources` if needed,
copies the helper there, and starts Vite and Tauri. No manual copy step or
template project is needed. Paths containing spaces are supported.

For a local production build:

```powershell
pnpm tauri:build
```

This uses the same helper preparation before building the frontend and Tauri
application. Local builds disable updater artifacts through
`src-tauri/tauri.check.conf.json`, so they do not need an updater signing key.
The release workflow retains its signing configuration.

For a development binary without installers:

```powershell
pnpm tauri:build --debug --no-bundle
```

The executable is `src-tauri/target/debug/discord-quest-completer.exe` for that
command; production output is under `src-tauri/target/release`. Tauri places
the helper in `data/src-win.exe` next to the app. `pnpm build` builds only the
frontend; `pnpm sync:runner` prepares only the helper. `pnpm build:all` remains
an alias for the local production build.

Helper builds use `src-win/target` and the explicit `x86_64-pc-windows-msvc`
target. Build or copy failures stop the dev/build hook before Tauri starts.

## Release versions

`package.json` is the application version source. Tauri reads its version
directly from that file. To prepare a release, increase `version` in
`package.json`, then run:

```powershell
pnpm version:sync
pnpm version:check
pnpm test:paths
```

Synchronization updates the application package in `src-tauri/Cargo.toml` and
`src-tauri/Cargo.lock` and refuses a version lower than existing app metadata.
Development and build hooks check that these versions agree.

The publish workflow checks all pages of GitHub releases before building and
again before creating the release. Its version must be strictly higher than
every existing stable release version, including drafts. Reused or decreasing
versions fail; run numbers and dates do not generate application versions.
Legacy `v`-prefixed version tags are supported. Unrecognized stable release
tags fail validation rather than silently bypassing the check.

The staged `version.txt` must match `package.json`. Release tags, artifact
names, `latest.json` and its installer URL all use that same version. Publishing
is serialized, and updater downgrades remain disabled.

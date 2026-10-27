# Dependency security audit — 2026-10-27

## Tauri remediation

The committed Rust lockfile contained `tauri 2.11.5`, which is in the affected range (`>=2.0.0, <=2.11.5`) of [GHSA-w28w-mhc8-qvjv](https://github.com/tauri-apps/tauri/security/advisories/GHSA-w28w-mhc8-qvjv). The advisory describes improper access control on the internal channel fetch command. The first patched version is `2.11.6`.

`src-tauri/Cargo.toml` now requires `2.11.6` or a compatible later release. `src-tauri/Cargo.lock` locks `2.11.6` with its registry checksum. The targeted Cargo update changed only the Tauri package entry.

**App-specific exploitability remains unverified.** Matching a published affected version does not establish a working exploit against this application. No exploit reproduction or claim of confirmed data exposure was made.

## Frontend audit

`pnpm audit --json` exited 1 and reported 45 advisory entries: 23 high, 18 moderate and 4 low; no critical findings. These counts are the audit tool’s reported entries, not a count of confirmed application exploits. Development dependencies are included. Multiple version ranges can produce entries for the same advisory.

| Package | Reported entries | Highest severity | Advisory links |
| --- | ---: | --- | --- |
| `@vue/server-renderer` | 1 | high | [GHSA-g2v6-rqmx-r4w6](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) |
| `brace-expansion` | 8 | high | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895), [GHSA-v6h2-p8h4-qcjw](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw) |
| `esbuild` | 1 | moderate | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |
| `lodash-es` | 3 | high | [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh), [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) |
| `minimatch` | 3 | high | [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74), [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26), [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj) |
| `nanoid` | 6 | high | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) |
| `postcss` | 4 | high | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| `rollup` | 1 | high | [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) |
| `source-map-js` | 1 | high | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| `vite` | 17 | high | [GHSA-356w-63v5-8wf4](https://github.com/advisories/GHSA-356w-63v5-8wf4), [GHSA-4r4m-qw57-chr8](https://github.com/advisories/GHSA-4r4m-qw57-chr8), [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [GHSA-859w-5945-r5v3](https://github.com/advisories/GHSA-859w-5945-r5v3), [GHSA-93m4-6634-74q7](https://github.com/advisories/GHSA-93m4-6634-74q7), [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff), [GHSA-g4jq-h2w9-997c](https://github.com/advisories/GHSA-g4jq-h2w9-997c), [GHSA-jqfw-vq24-v9c3](https://github.com/advisories/GHSA-jqfw-vq24-v9c3), [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583), [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw), [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-x574-m823-4x7w](https://github.com/advisories/GHSA-x574-m823-4x7w), [GHSA-xcj6-pq6g-qj4x](https://github.com/advisories/GHSA-xcj6-pq6g-qj4x) |

These additional findings remain open. This patch updates the identified Tauri vulnerability; it does not apply unrelated frontend upgrades or suppress audit findings.

## Rust lockfile audits

### `src-tauri/Cargo.lock`

17 vulnerability matches; 13 warnings.

RustSec database commit: `3279c99911354c400e1d41e47c7d60e39258b147`.

| Package | Version | Advisory | Patched versions |
| --- | --- | --- | --- |
| `h2` | `0.3.27` | [RUSTSEC-2026-0258](https://rustsec.org/advisories/RUSTSEC-2026-0258) | `>=0.4.16` |
| `h2` | `0.4.15` | [RUSTSEC-2026-0258](https://rustsec.org/advisories/RUSTSEC-2026-0258) | `>=0.4.16` |
| `quinn-proto` | `0.11.16` | [RUSTSEC-2026-0338](https://rustsec.org/advisories/RUSTSEC-2026-0338) | `>=0.11.18` |
| `quinn-proto` | `0.11.16` | [RUSTSEC-2026-0339](https://rustsec.org/advisories/RUSTSEC-2026-0339) | `>=0.11.17` |
| `quinn-proto` | `0.11.16` | [RUSTSEC-2026-0340](https://rustsec.org/advisories/RUSTSEC-2026-0340) | `>=0.11.18` |
| `quinn-proto` | `0.11.16` | [RUSTSEC-2026-0341](https://rustsec.org/advisories/RUSTSEC-2026-0341) | `>=0.11.17` |
| `quinn-proto` | `0.11.16` | [RUSTSEC-2026-0342](https://rustsec.org/advisories/RUSTSEC-2026-0342) | `>=0.11.17` |
| `rustls` | `0.23.43` | [RUSTSEC-2026-0285](https://rustsec.org/advisories/RUSTSEC-2026-0285) | `>=0.23.45` |
| `rustls` | `0.23.43` | [RUSTSEC-2026-0346](https://rustsec.org/advisories/RUSTSEC-2026-0346) | `>=0.23.46` |
| `rustls` | `0.23.43` | [RUSTSEC-2026-0348](https://rustsec.org/advisories/RUSTSEC-2026-0348) | `>=0.23.46` |
| `rustls` | `0.23.43` | [RUSTSEC-2026-0349](https://rustsec.org/advisories/RUSTSEC-2026-0349) | `>=0.23.46` |
| `rustls-webpki` | `0.103.13` | [RUSTSEC-2026-0382](https://rustsec.org/advisories/RUSTSEC-2026-0382) | `>=0.103.16, <0.104.0-alpha.1 OR >=0.104.0-alpha.8` |
| `webpki-root-certs` | `1.0.9` | [RUSTSEC-2026-0383](https://rustsec.org/advisories/RUSTSEC-2026-0383) | `>=1.0.10` |
| `webpki-roots` | `1.0.9` | [RUSTSEC-2026-0381](https://rustsec.org/advisories/RUSTSEC-2026-0381) | `>=1.0.10` |
| `zip` | `4.6.1` | [RUSTSEC-2026-0367](https://rustsec.org/advisories/RUSTSEC-2026-0367) | `>=9.0.0` |
| `zip` | `4.6.1` | [RUSTSEC-2026-0368](https://rustsec.org/advisories/RUSTSEC-2026-0368) | `>=9.0.0` |
| `zip` | `4.6.1` | [RUSTSEC-2026-0369](https://rustsec.org/advisories/RUSTSEC-2026-0369) | `>=9.0.0` |

Warnings (including unmaintained dependencies) remain unsuppressed:

- unmaintained: `proc-macro-error 1.0.4` ([RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370)), `rustls-pemfile 1.0.4` ([RUSTSEC-2025-0134](https://rustsec.org/advisories/RUSTSEC-2025-0134)), `unic-char-property 0.9.0` ([RUSTSEC-2025-0081](https://rustsec.org/advisories/RUSTSEC-2025-0081)), `unic-char-range 0.9.0` ([RUSTSEC-2025-0075](https://rustsec.org/advisories/RUSTSEC-2025-0075)), `unic-common 0.9.0` ([RUSTSEC-2025-0080](https://rustsec.org/advisories/RUSTSEC-2025-0080)), `unic-ucd-ident 0.9.0` ([RUSTSEC-2025-0100](https://rustsec.org/advisories/RUSTSEC-2025-0100)), `unic-ucd-version 0.9.0` ([RUSTSEC-2025-0098](https://rustsec.org/advisories/RUSTSEC-2025-0098)), `zbus_names 4.3.4` ([RUSTSEC-2026-0371](https://rustsec.org/advisories/RUSTSEC-2026-0371)), `zvariant 5.13.1` ([RUSTSEC-2026-0370](https://rustsec.org/advisories/RUSTSEC-2026-0370)), `zvariant_derive 5.13.1` ([RUSTSEC-2026-0372](https://rustsec.org/advisories/RUSTSEC-2026-0372))
- unsound: `glib 0.18.5` ([RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429)), `tokio 1.53.1` ([RUSTSEC-2026-0386](https://rustsec.org/advisories/RUSTSEC-2026-0386))
- yanked: `chacha20 0.10.1`

### `src-win/Cargo.lock`

0 vulnerability matches; 2 warnings.

Warnings (including unmaintained dependencies) remain unsuppressed:

- unmaintained: `proc-macro-error 1.0.4` ([RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370))
- unsound: `glib 0.18.5` ([RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429))

### `src-template/Cargo.lock`

6 vulnerability matches; 8 warnings.

| Package | Version | Advisory | Patched versions |
| --- | --- | --- | --- |
| `bytes` | `1.10.1` | [RUSTSEC-2026-0007](https://rustsec.org/advisories/RUSTSEC-2026-0007) | `>=1.11.1` |
| `quick-xml` | `0.30.0` | [RUSTSEC-2026-0194](https://rustsec.org/advisories/RUSTSEC-2026-0194) | `>=0.41.0` |
| `quick-xml` | `0.30.0` | [RUSTSEC-2026-0195](https://rustsec.org/advisories/RUSTSEC-2026-0195) | `>=0.41.0` |
| `quick-xml` | `0.37.4` | [RUSTSEC-2026-0194](https://rustsec.org/advisories/RUSTSEC-2026-0194) | `>=0.41.0` |
| `quick-xml` | `0.37.4` | [RUSTSEC-2026-0195](https://rustsec.org/advisories/RUSTSEC-2026-0195) | `>=0.41.0` |
| `webbrowser` | `1.0.4` | [RUSTSEC-2026-0257](https://rustsec.org/advisories/RUSTSEC-2026-0257) | `>=1.2.2` |

Warnings (including unmaintained dependencies) remain unsuppressed:

- unmaintained: `paste 1.0.15` ([RUSTSEC-2024-0436](https://rustsec.org/advisories/RUSTSEC-2024-0436)), `ttf-parser 0.25.1` ([RUSTSEC-2026-0192](https://rustsec.org/advisories/RUSTSEC-2026-0192)), `zbus_names 3.0.0` ([RUSTSEC-2026-0371](https://rustsec.org/advisories/RUSTSEC-2026-0371)), `zvariant 4.2.0` ([RUSTSEC-2026-0370](https://rustsec.org/advisories/RUSTSEC-2026-0370)), `zvariant_derive 4.2.0` ([RUSTSEC-2026-0372](https://rustsec.org/advisories/RUSTSEC-2026-0372))
- unsound: `event-listener 5.4.0` ([RUSTSEC-2026-0221](https://rustsec.org/advisories/RUSTSEC-2026-0221)), `memmap2 0.9.5` ([RUSTSEC-2026-0186](https://rustsec.org/advisories/RUSTSEC-2026-0186)), `rand 0.8.5` ([RUSTSEC-2026-0097](https://rustsec.org/advisories/RUSTSEC-2026-0097))

The security advisory scan completed, but the tool could not determine yanked status for numerous template dependencies missing from the local crates.io index. Its yanked-package check is therefore incomplete.

Rust audit results cover all entries in each lockfile, including dependencies for other platforms. Remaining matches need separate remediation and reachability assessment; this is not a clean audit.

## Verification and reproduction

```sh
cargo update --manifest-path src-tauri/Cargo.toml -p tauri --precise 2.11.6
cargo audit --file src-tauri/Cargo.lock
cargo audit --file src-win/Cargo.lock
cargo audit --file src-template/Cargo.lock
pnpm audit --json
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

The frontend regression suite (26 tests), Vue type check and Vite production build passed in a temporary copy using the locked frontend dependencies. The Rust compile check uses a temporary target directory and a process-local `TAURI_CONFIG` override with `bundle.resources=[]` because the generated `src-tauri/resources/src-win.exe` is absent. This verifies compilation, not packaging or a live Discord connection.

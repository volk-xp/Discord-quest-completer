# Owned helper processes

`run_background_process` retains the spawned child in a mutex-protected registry
and returns a session-local launch ID. On Windows the child owns its process
handle, so stopping does not rediscover a process by its PID or executable name.
Only verified helpers from the managed directory can enter the registry.

`stop_process` accepts only `launch_id`. Unknown and already-stopped IDs are harmless
no-ops. Termination uses the retained handle and waits for that child to exit before
removing it. Errors retain ownership for a retry. Duplicate launches of the same
canonical executable reuse its live child; exited children are reaped. Launch and
stop operations share one lock, and launch IDs are never reused during the app session.

The native registry assigns each child a local 16-minute deadline using a monotonic
clock. One backend sweep stops expired children independently of webview timers,
Home mounting, or renderer teardown. Duplicate launches retain the original
deadline. Failed deadline stops retain ownership, retry every five seconds, and are logged.
This timer does not read quest requirements or confirm quest completion.

The shared `use-play-sessions` manager owns frontend launch IDs, manual Stop,
reconciliation, history and countdown state. These are separate from catalog and
favorite records. Identity uses the application ID and normalized executable name,
so view-local random IDs cannot lose ownership. Native snapshots supply the actual
start and end timestamps; reclaiming a live helper does not restart its deadline.

Home cleanup removes view listeners and its RPC display clock, without clearing
helper sessions or cancelling their deadlines. A remounted consumer uses the same
manager. Late polls and stop responses cannot clear a replacement launch, and a
removed game row does not prevent its owned child from being stopped.

Normal application exit stops owned children and rejects further launches. Windows
helpers also belong to an unnamed Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
Only the application retains its non-inheritable job handle. Closing the final
handle, including when the app crashes or is forcibly terminated, terminates its
helpers. Unowned processes are not assigned to this job. Silent breakaway keeps
external processes started by a helper, such as a browser, outside the job; only
explicit helper launches are assigned.

The Windows launcher uses the job-list process-creation attribute so assignment
happens before a helper can run. A job setup or assignment failure fails launch
without leaving an unassigned helper. Arguments and paths use UTF-16, and helpers
inherit the application environment without inheriting handles or creating a console.
A restarted app does not claim or terminate previous processes by name.

## Checks

```powershell
pnpm test:paths
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

Native tests require Rust plus Microsoft C++ Build Tools and the Windows SDK.
They start harmless copies of their own test executable: one unowned process and
two registry-owned processes with the same executable name. Stopping one must leave
the other two running. Additional cases cover duplicate launch, failed spawn,
natural exit, stale/unknown IDs, shutdown and renderer-independent deadlines.
Job tests forcibly terminate an isolated owner, verify its helpers exit while an
unowned process survives, and check native argument quoting and working directories.
Ignored tests are child-process fixtures; the suite invokes them explicitly.
Do not run the suite with `--ignored`.

The normal `cargo test --manifest-path src-tauri/Cargo.toml` also includes these
tests when the full application's resources and build prerequisites are available.

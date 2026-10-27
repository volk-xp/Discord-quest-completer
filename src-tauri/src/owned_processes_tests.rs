use super::*;
use std::process::Stdio;
use std::time::{Duration, Instant};

// A real, harmless process fixture. It is only run by explicit child commands.
#[test]
#[ignore]
fn sleeper() {
    std::thread::sleep(Duration::from_secs(60));
}

fn sleeper_command() -> Command {
    let mut command = Command::new(std::env::current_exe().unwrap());
    // Strip the crate name: works both standalone and inside the Tauri crate.
    let test_name = format!("{}::sleeper", module_path!().split_once("::").unwrap().1);
    command
        .args(["--ignored", "--exact", &test_name])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
}

struct UnownedChild(std::process::Child);
impl Drop for UnownedChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
fn stop_leaves_unowned_and_other_owned_same_name_processes_alive() {
    // All three commands launch exactly the same test executable. One child
    // deliberately belongs to something other than the registry under test.
    let mut external = UnownedChild(sleeper_command().spawn().unwrap());
    let mut registry = OwnedProcesses::default();
    let first = registry
        .launch(Path::new("game-a/game.exe"), &mut sleeper_command())
        .unwrap();
    let second = registry
        .launch(Path::new("game-b/game.exe"), &mut sleeper_command())
        .unwrap();
    registry.stop(&first).unwrap();
    assert!(!registry.children.contains_key(&first));
    assert!(external.0.try_wait().unwrap().is_none());
    assert!(registry
        .children
        .get_mut(&second)
        .unwrap()
        .child
        .try_wait()
        .unwrap()
        .is_none());
    assert!(registry.shutdown().is_empty());
    assert!(external.0.try_wait().unwrap().is_none());
    assert!(registry
        .launch(Path::new("game-c/game.exe"), &mut sleeper_command())
        .is_err());
}

#[test]
fn stale_unknown_and_repeated_stop_ids_cannot_target_a_replacement() {
    let mut registry = OwnedProcesses::default();
    let path = Path::new("game.exe");
    let old = registry.launch(path, &mut sleeper_command()).unwrap();
    registry.stop(&old).unwrap();
    let new = registry.launch(path, &mut sleeper_command()).unwrap();
    assert_ne!(old, new);
    registry.stop(&old).unwrap();
    registry.stop("game.exe").unwrap();
    let pid = registry.children[&new].child.id().to_string();
    registry.stop(&pid).unwrap();
    assert!(registry
        .children
        .get_mut(&new)
        .unwrap()
        .child
        .try_wait()
        .unwrap()
        .is_none());
}

#[test]
fn repeated_launch_reuses_the_retained_child() {
    let mut registry = OwnedProcesses::default();
    let path = Path::new("game.exe");
    let first = registry.launch(path, &mut sleeper_command()).unwrap();
    let second = registry.launch(path, &mut sleeper_command()).unwrap();
    assert_eq!(first, second);
    assert_eq!(registry.children.len(), 1);
}

#[test]
fn failed_spawn_does_not_register_a_process() {
    let mut registry = OwnedProcesses::default();
    let missing = std::env::temp_dir()
        .join(format!("dqc-nonexistent-{}", std::process::id()))
        .join("missing.exe");
    assert!(registry
        .launch(&missing, &mut Command::new(&missing))
        .is_err());
    assert!(registry.children.is_empty());
}

#[test]
fn monitoring_reaps_closed_children_and_preserves_running_children() {
    let mut registry = OwnedProcesses::default();
    let closed = registry.launch(Path::new("closed.exe"), &mut sleeper_command()).unwrap();
    let running = registry.launch(Path::new("running.exe"), &mut sleeper_command()).unwrap();
    assert_eq!(registry.running_ids().unwrap().len(), 2);
    // Simulate a user closing the helper independently of stop().
    let child = &mut registry.children.get_mut(&closed).unwrap().child;
    child.kill().unwrap();
    child.wait().unwrap();
    assert_eq!(registry.running_ids().unwrap(), vec![running.clone()]);
    assert!(!registry.children.contains_key(&closed));
    assert_eq!(registry.running_ids().unwrap(), vec![running]);
    registry.stop(&closed).unwrap();
}

#[test]
fn deadlines_stop_children_without_any_renderer_or_view_callback() {
    let mut registry = OwnedProcesses::default();
    let first = registry.launch(Path::new("first.exe"), &mut sleeper_command()).unwrap();
    let second = registry.launch(Path::new("second.exe"), &mut sleeper_command()).unwrap();
    let deadline = registry.children[&first].deadline.unwrap();
    registry.children.get_mut(&second).unwrap().deadline = Some(deadline + Duration::from_secs(30));
    assert!(registry.expire(deadline).is_empty());
    assert!(!registry.children.contains_key(&first));
    assert!(registry.children.get_mut(&second).unwrap().child.try_wait().unwrap().is_none());
    let replacement = registry.launch(Path::new("first.exe"), &mut sleeper_command()).unwrap();
    assert_ne!(first, replacement);
    assert!(registry.expire(deadline).is_empty());
    assert!(registry.children.get_mut(&replacement).unwrap().child.try_wait().unwrap().is_none());
}

#[test]
fn repeated_launch_and_native_snapshots_preserve_the_original_deadline() {
    let mut registry = OwnedProcesses::default();
    let path = Path::new("game.exe");
    let id = registry.launch(path, &mut sleeper_command()).unwrap();
    let deadline = registry.children[&id].deadline;
    let before = registry.running_sessions().unwrap().pop().unwrap();
    assert_eq!(before.launch_id, id);
    assert_eq!(before.ends_at - before.started_at, AUTO_STOP.as_millis() as u64);
    assert_eq!(registry.launch(path, &mut sleeper_command()).unwrap(), id);
    assert_eq!(registry.children[&id].deadline, deadline);
    let after = registry.running_sessions().unwrap().pop().unwrap();
    assert_eq!(before.started_at, after.started_at);
    assert_eq!(before.ends_at, after.ends_at);
    assert!(!registry.is_shutting_down());
    assert!(registry.shutdown().is_empty());
    assert!(registry.is_shutting_down());
}

#[test]
fn failed_automatic_stops_retain_ownership_and_retry_after_a_bounded_delay() {
    let mut registry = OwnedProcesses::default();
    let id = registry.launch(Path::new("game.exe"), &mut sleeper_command()).unwrap();
    let deadline = registry.children[&id].deadline.unwrap();
    let ends_at = registry.children[&id].ends_at;
    let mut attempts = 0;
    let mut stop = |registry: &mut OwnedProcesses, launch_id: &str| {
        attempts += 1;
        if attempts <= 2 {
            Err(io::Error::other("temporary stop failure"))
        } else {
            registry.stop(launch_id)
        }
    };
    for attempt in 0..2 {
        let now = deadline + Duration::from_secs(attempt * 5);
        assert_eq!(registry.expire_with(now, &mut stop).len(), 1);
        let owned = &mut registry.children.get_mut(&id).unwrap();
        assert!(owned.child.try_wait().unwrap().is_none());
        assert_eq!(owned.ends_at, ends_at);
        assert_eq!(owned.deadline, Some(now + Duration::from_secs(5)));
        assert!(registry.expire_with(now, &mut stop).is_empty());
        assert!(registry.expire_with(now + Duration::from_millis(4999), &mut stop).is_empty());
    }
    assert!(registry.expire_with(deadline + Duration::from_secs(10), &mut stop).is_empty());
    assert_eq!(attempts, 3);
    assert!(!registry.children.contains_key(&id));
}

#[test]
fn a_child_that_exited_itself_can_be_stopped_and_relaunched() {
    let mut registry = OwnedProcesses::default();
    let path = Path::new("game.exe");
    let mut command = Command::new(std::env::current_exe().unwrap());
    command.arg("--list").stdout(Stdio::null());
    let old = registry.launch(path, &mut command).unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while registry
        .children
        .get_mut(&old)
        .unwrap()
        .child
        .try_wait()
        .unwrap()
        .is_none()
    {
        assert!(Instant::now() < deadline, "Test child did not exit");
        std::thread::sleep(Duration::from_millis(10));
    }
    registry.stop(&old).unwrap();
    let new = registry.launch(path, &mut sleeper_command()).unwrap();
    assert_ne!(old, new);
}

#[cfg(windows)]
mod job_tests {
    use super::*;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::Foundation::{WAIT_OBJECT_0, WAIT_TIMEOUT};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
    };

    struct ObservedChild(OwnedHandle);
    impl ObservedChild {
        fn open(pid: u32) -> Self {
            let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE | PROCESS_TERMINATE, 0, pid) };
            assert!(!handle.is_null(), "{}", io::Error::last_os_error());
            Self(unsafe { OwnedHandle::from_raw_handle(handle) })
        }
        fn wait(&self, milliseconds: u32) -> u32 {
            unsafe { WaitForSingleObject(self.0.as_raw_handle(), milliseconds) }
        }
    }
    impl Drop for ObservedChild {
        fn drop(&mut self) {
            unsafe {
                TerminateProcess(self.0.as_raw_handle(), 1);
                WaitForSingleObject(self.0.as_raw_handle(), 5000);
            }
        }
    }

    #[test]
    fn closing_the_job_kills_owned_helpers_without_registry_drop_or_affecting_unowned_children() {
        let mut external = UnownedChild(sleeper_command().spawn().unwrap());
        let mut registry = OwnedProcesses::default();
        let id = registry.launch(Path::new("game.exe"), &mut sleeper_command()).unwrap();
        let observed = ObservedChild::open(registry.children[&id].child.id());
        drop(registry.job.take().unwrap());
        assert_eq!(observed.wait(5000), WAIT_OBJECT_0);
        assert!(external.0.try_wait().unwrap().is_none());
    }

    #[test]
    #[ignore]
    fn job_owner() {
        let mut registry = OwnedProcesses::default();
        let id = registry.launch(Path::new("game.exe"), &mut sleeper_command()).unwrap();
        let external = UnownedChild(sleeper_command().spawn().unwrap());
        std::fs::write(std::env::var_os("DQC_JOB_TEST_STATE").unwrap(),
            format!("{} {}", registry.children[&id].child.id(), external.0.id())).unwrap();
        std::thread::sleep(Duration::from_secs(60));
    }

    #[test]
    fn forced_owner_termination_kills_helpers_and_does_not_inherit_the_job_handle() {
        let directory = tempfile::tempdir().unwrap();
        let state = directory.path().join("children.txt");
        let test_name = format!("{}::job_owner", module_path!().split_once("::").unwrap().1);
        let mut owner = UnownedChild(Command::new(std::env::current_exe().unwrap())
            .args(["--ignored", "--exact", &test_name])
            .env("DQC_JOB_TEST_STATE", &state)
            .stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap());
        let deadline = Instant::now() + Duration::from_secs(10);
        let pids = loop {
            if let Ok(text) = std::fs::read_to_string(&state) {
                let pids: Vec<_> = text.split_whitespace().filter_map(|pid| pid.parse::<u32>().ok()).collect();
                if pids.len() == 2 { break pids; }
            }
            assert!(owner.0.try_wait().unwrap().is_none(), "Owner exited before reporting its children");
            assert!(Instant::now() < deadline, "Owner did not report its children");
            std::thread::sleep(Duration::from_millis(10));
        };
        let owned = ObservedChild::open(pids[0]);
        let unowned = ObservedChild::open(pids[1]);
        assert_eq!(owned.wait(0), WAIT_TIMEOUT);
        owner.0.kill().unwrap();
        owner.0.wait().unwrap();
        assert_eq!(owned.wait(5000), WAIT_OBJECT_0);
        assert_eq!(unowned.wait(0), WAIT_TIMEOUT);
    }

    #[test]
    #[ignore]
    fn report_arguments() {
        let args: Vec<_> = std::env::args().collect();
        let output = args.iter().find_map(|arg| arg.strip_prefix("dqc-output=")).unwrap();
        std::fs::write(output, serde_json::to_vec(&serde_json::json!({
            "args": args, "directory": std::env::current_dir().unwrap(),
        })).unwrap()).unwrap();
    }

    #[test]
    fn native_creation_preserves_unicode_quoting_and_working_directory() {
        let directory = tempfile::Builder::new().prefix("dqc job arguments ").tempdir().unwrap();
        let state = directory.path().join("arguments.json");
        let test_name = format!("{}::report_arguments", module_path!().split_once("::").unwrap().1);
        let values = ["日本語 🎮", "say \"hello\"", "trailing\\", "", "backslash\\\"quote"];
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.args(["--ignored", "--exact", &test_name])
            .arg(format!("dqc-output={}", state.display()))
            .args(values).current_dir(directory.path());
        let mut registry = OwnedProcesses::default();
        let id = registry.launch(Path::new("arguments.exe"), &mut command).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while registry.children.get_mut(&id).unwrap().child.try_wait().unwrap().is_none() {
            assert!(Instant::now() < deadline, "Argument fixture did not exit");
            std::thread::sleep(Duration::from_millis(10));
        }
        let report: serde_json::Value = serde_json::from_slice(&std::fs::read(&state).unwrap()).unwrap();
        let args = report["args"].as_array().unwrap();
        assert_eq!(&args[args.len() - values.len()..], serde_json::json!(values).as_array().unwrap());
        assert_eq!(std::fs::canonicalize(report["directory"].as_str().unwrap()).unwrap(),
            std::fs::canonicalize(directory.path()).unwrap());
    }

    #[test]
    #[ignore]
    fn helper_with_external_child() {
        let output = std::env::args().find_map(|arg|
            arg.strip_prefix("dqc-output=").map(PathBuf::from)).unwrap();
        let external = UnownedChild(sleeper_command().spawn().unwrap());
        std::fs::write(output, external.0.id().to_string()).unwrap();
        std::thread::sleep(Duration::from_secs(60));
    }

    #[test]
    fn helper_launched_external_processes_are_not_captured_by_the_job() {
        let directory = tempfile::tempdir().unwrap();
        let state = directory.path().join("external.txt");
        let test_name = format!("{}::helper_with_external_child", module_path!().split_once("::").unwrap().1);
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.args(["--ignored", "--exact", &test_name]).arg(format!("dqc-output={}", state.display()));
        let mut registry = OwnedProcesses::default();
        let id = registry.launch(Path::new("helper.exe"), &mut command).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        let pid = loop {
            if let Ok(text) = std::fs::read_to_string(&state) {
                if let Ok(pid) = text.parse() { break pid; }
            }
            assert!(Instant::now() < deadline, "Helper did not report its external process");
            std::thread::sleep(Duration::from_millis(10));
        };
        let owned = ObservedChild::open(registry.children[&id].child.id());
        let external = ObservedChild::open(pid);
        drop(registry.job.take().unwrap());
        assert_eq!(owned.wait(5000), WAIT_OBJECT_0);
        assert_eq!(external.wait(0), WAIT_TIMEOUT);
    }
}

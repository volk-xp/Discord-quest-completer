use super::*;

#[test]
fn accepts_relative_windows_paths_and_exact_ids() {
    for path in [
        "game.exe",
        "bin/game.exe",
        "bin\\game.EXE",
        "Game Folder/日本語.exe",
    ] {
        assert!(
            validated_parts("18446744073709551615", path).is_ok(),
            "{path}"
        );
    }
}

#[test]
fn rejects_invalid_ids_before_touching_files() {
    for id in [
        "",
        "0",
        "01",
        "-1",
        "+1",
        "1.0",
        "../1",
        "18446744073709551616",
    ] {
        assert!(validated_parts(id, "game.exe").is_err(), "{id}");
    }
}

#[test]
fn rejects_windows_path_escapes_and_aliases() {
    for path in [
        "",
        ".",
        "..",
        "../game.exe",
        "bin/../../game.exe",
        "bin/../game.exe",
        "bin\\..\\game.exe",
        "/game.exe",
        "\\game.exe",
        "C:\\game.exe",
        "C:game.exe",
        "\\\\server\\share\\game.exe",
        "\\\\?\\C:\\game.exe",
        "bin//game.exe",
        "bin\\\\game.exe",
        "bin/./game.exe",
        "bin /game.exe",
        "bin./game.exe",
        "game.exe ",
        "game.exe.",
        "game.exe:payload",
        "game.exe:payload.exe",
        "CON.exe",
        "aux.txt/game.exe",
        "LPT¹.exe",
        "COM1 /game.exe",
        "NUL/game.exe",
        "CONIN$.exe",
        "bin/*/game.exe",
        "ga?me.exe",
        "bad\0.exe",
        "bad\u{1f}.exe",
        "bad\u{7f}.exe",
        "bad|name.exe",
        "game.bat",
    ] {
        assert!(validated_parts("123", path).is_err(), "{path:?}");
    }
    assert!(validated_parts("123", &format!("{}.exe", "a".repeat(256))).is_err());
    assert!(validated_parts("123", &format!("{}game.exe", "bin/".repeat(1024))).is_err());
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "dqc-path-test-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            fs::write(path.join("helper.exe"), b"fixture helper content").unwrap();
            Self(path)
        }
        fn helper(&self) -> PathBuf {
            self.0.join("helper.exe")
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn installs_nested_helper_and_reuses_only_identical_content() {
        let fixture = Fixture::new();
        let target =
            ManagedGamePath::prepare(&fixture.0, "123456789012345678", "bin/game.exe", "1.0.0", true)
                .unwrap();
        assert!(target
            .path()
            .starts_with(fs::canonicalize(fixture.0.join("games")).unwrap()));
        target.install(&fixture.helper()).unwrap();
        target.install(&fixture.helper()).unwrap();
        assert_eq!(fs::read(target.path()).unwrap(), b"fixture helper content");
        assert!(target.verified_file(&fixture.helper()).is_ok());
    }

    #[test]
    fn upgrades_use_new_locations_without_changing_legacy_or_previous_helpers() {
        let fixture = Fixture::new();
        let legacy = fixture.0.join("games/123/bin/game.exe");
        fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        fs::write(&legacy, b"interrupted legacy copy").unwrap();
        let old = ManagedGamePath::prepare(&fixture.0, "123", "bin/game.exe", "1.0.0", true).unwrap();
        old.install(&fixture.helper()).unwrap();
        let updated_resource = fixture.0.join("updated.exe");
        fs::write(&updated_resource, b"updated helper content").unwrap();
        let updated = ManagedGamePath::prepare(&fixture.0, "123", "bin/game.exe", "2.0.0", true).unwrap();
        updated.install(&updated_resource).unwrap();
        assert_ne!(old.path(), updated.path());
        assert_eq!(fs::read(&legacy).unwrap(), b"interrupted legacy copy");
        assert_eq!(fs::read(old.path()).unwrap(), b"fixture helper content");
        assert_eq!(fs::read(updated.path()).unwrap(), b"updated helper content");
        let launch = ManagedGamePath::prepare(&fixture.0, "123", "bin/game.exe", "2.0.0", false).unwrap();
        assert_eq!(launch.path(), updated.path());
        assert!(launch.verified_file(&updated_resource).is_ok());
        old.install(&fixture.helper()).unwrap();
    }

    #[test]
    fn invalid_versions_are_rejected_before_creating_directories() {
        let fixture = Fixture::new();
        for version in ["", ".", "..", "../outside", "1.0.0/child", "1.0.0\\child", "C:bad", "CON"] {
            assert!(ManagedGamePath::prepare(&fixture.0, "123", "game.exe", version, true).is_err());
        }
        assert!(!fixture.0.join("games").exists());
    }

    #[test]
    fn failed_copy_never_publishes_a_partial_helper_and_retry_succeeds() {
        struct FailedRead;
        impl Read for FailedRead {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("interrupted copy"))
            }
        }
        let fixture = Fixture::new();
        let target = ManagedGamePath::prepare(&fixture.0, "123", "game.exe", "1.0.0", true).unwrap();
        let mut source = io::Cursor::new(b"partial helper").chain(FailedRead);
        assert!(target.install_from(&fixture.helper(), &mut source).is_err());
        assert!(!target.path().exists());
        assert_eq!(fs::read_dir(target.path().parent().unwrap()).unwrap().count(), 0);
        target.install(&fixture.helper()).unwrap();
        assert!(target.verified_file(&fixture.helper()).is_ok());
    }

    #[test]
    fn abandoned_temporary_files_do_not_block_installation_or_get_overwritten() {
        let fixture = Fixture::new();
        let target = ManagedGamePath::prepare(&fixture.0, "123", "game.exe", "1.0.0", true).unwrap();
        let abandoned = target.path().parent().unwrap().join(".tmp-interrupted");
        fs::write(&abandoned, b"partial helper").unwrap();
        target.install(&fixture.helper()).unwrap();
        assert_eq!(fs::read(&abandoned).unwrap(), b"partial helper");
        assert!(target.verified_file(&fixture.helper()).is_ok());
        assert_eq!(fs::read_dir(target.path().parent().unwrap()).unwrap().count(), 2);
    }

    #[test]
    fn a_destination_created_during_copy_is_never_overwritten() {
        struct ConcurrentFile {
            path: PathBuf,
            source: io::Cursor<Vec<u8>>,
            created: bool,
        }
        impl Read for ConcurrentFile {
            fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
                if !self.created {
                    fs::write(&self.path, b"unfamiliar file")?;
                    self.created = true;
                }
                self.source.read(buffer)
            }
        }
        let fixture = Fixture::new();
        let target = ManagedGamePath::prepare(&fixture.0, "123", "game.exe", "1.0.0", true).unwrap();
        let mut source = ConcurrentFile {
            path: target.path().to_owned(),
            source: io::Cursor::new(fs::read(fixture.helper()).unwrap()),
            created: false,
        };
        assert!(target.install_from(&fixture.helper(), &mut source).is_err());
        assert_eq!(fs::read(target.path()).unwrap(), b"unfamiliar file");
        assert_eq!(fs::read_dir(target.path().parent().unwrap()).unwrap().count(), 1);
    }

    #[test]
    fn traversal_has_no_filesystem_side_effects_and_launch_does_not_create_dirs() {
        let fixture = Fixture::new();
        assert!(ManagedGamePath::prepare(&fixture.0, "123", "../outside.exe", "1.0.0", true).is_err());
        assert!(ManagedGamePath::prepare(&fixture.0, "../123", "game.exe", "1.0.0", true).is_err());
        assert!(!fixture.0.join("games").exists());
        assert!(ManagedGamePath::prepare(&fixture.0, "123", "game.exe", "1.0.0", false).is_err());
        assert!(!fixture.0.join("games").exists());
    }

    #[test]
    fn existing_untrusted_file_is_never_overwritten_or_verified() {
        let fixture = Fixture::new();
        let target = ManagedGamePath::prepare(&fixture.0, "123", "game.exe", "1.0.0", true).unwrap();
        fs::write(target.path(), b"user data").unwrap();
        assert!(target.install(&fixture.helper()).is_err());
        assert!(target.verified_file(&fixture.helper()).is_err());
        assert_eq!(fs::read(target.path()).unwrap(), b"user data");
    }

    #[test]
    fn hard_link_cannot_overwrite_outside_file() {
        let fixture = Fixture::new();
        let outside = fixture.0.join("outside.exe");
        fs::write(&outside, b"outside user data").unwrap();
        let target = ManagedGamePath::prepare(&fixture.0, "123", "game.exe", "1.0.0", true).unwrap();
        fs::hard_link(&outside, target.path()).unwrap();
        assert!(target.install(&fixture.helper()).is_err());
        assert!(target.verified_file(&fixture.helper()).is_err());
        assert_eq!(fs::read(outside).unwrap(), b"outside user data");
    }

    #[test]
    fn directory_and_executable_cannot_be_replaced_while_guarded() {
        let fixture = Fixture::new();
        let target = ManagedGamePath::prepare(&fixture.0, "123", "bin/game.exe", "1.0.0", true).unwrap();
        target.install(&fixture.helper()).unwrap();
        let verified = target.verified_file(&fixture.helper()).unwrap();
        assert!(fs::rename(target.path().parent().unwrap(), fixture.0.join("moved")).is_err());
        assert!(fs::write(target.path(), b"replacement").is_err());
        assert!(fs::remove_file(target.path()).is_err());
        drop(verified);
    }

    #[test]
    fn verified_executable_can_still_be_spawned() {
        let fixture = Fixture::new();
        // This test binary is a real executable; --list exits without running tests.
        let helper = std::env::current_exe().unwrap();
        let target = ManagedGamePath::prepare(&fixture.0, "123", "game.exe", "1.0.0", true).unwrap();
        target.install(&helper).unwrap();
        let _verified = target.verified_file(&helper).unwrap();
        let status = std::process::Command::new(target.path())
            .arg("--list")
            .stdout(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
    }

    fn junction(link: &Path, destination: &Path) {
        // Junctions need no developer mode or administrator privileges on NTFS.
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command",
                "$ErrorActionPreference = 'Stop'; New-Item -ItemType Junction -Path $env:DQC_TEST_LINK -Target $env:DQC_TEST_TARGET | Out-Null"])
            .env("DQC_TEST_LINK", link).env("DQC_TEST_TARGET", destination)
            .output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn rejects_games_root_and_nested_junctions() {
        for relative in ["games", "games/123", "games/123/1.0.0", "games/123/1.0.0/bin"] {
            let fixture = Fixture::new();
            let outside = fixture.0.join("outside");
            fs::create_dir(&outside).unwrap();
            let link = fixture.0.join(relative);
            fs::create_dir_all(link.parent().unwrap()).unwrap();
            junction(&link, &outside);
            let create = ManagedGamePath::prepare(&fixture.0, "123", "bin/game.exe", "1.0.0", true);
            let launch = ManagedGamePath::prepare(&fixture.0, "123", "bin/game.exe", "1.0.0", false);
            // Remove the junction explicitly before fixture cleanup, even on failure.
            fs::remove_dir(&link).unwrap();
            assert!(create.is_err(), "create followed {relative}");
            assert!(launch.is_err(), "launch followed {relative}");
            assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
        }
    }
}

//! The native boundary for untrusted catalog paths. No caller-selected absolute
//! paths or derived path fields are accepted. This application is Windows-only.
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

fn validate_component(part: &str) -> io::Result<()> {
    let stem = part
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end()
        .to_uppercase();
    let reserved = matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|prefix| {
        stem.strip_prefix(*prefix).is_some_and(|suffix| {
            matches!(
                suffix,
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    });
    if part.is_empty()
        || part == "."
        || part == ".."
        || part.encode_utf16().count() > 255
        || part.ends_with(['.', ' '])
        || reserved
        || part
            .chars()
            .any(|c| c <= '\u{1f}' || c == '\u{7f}' || "<>:\"|?*/\\".contains(c))
    {
        return Err(invalid("Invalid Windows path component"));
    }
    Ok(())
}

fn validated_parts<'a>(app_id: &str, executable: &'a str) -> io::Result<Vec<&'a str>> {
    if app_id.is_empty()
        || app_id.starts_with('0')
        || !app_id.bytes().all(|b| b.is_ascii_digit())
        || app_id.parse::<u64>().is_err()
    {
        return Err(invalid("Invalid application ID"));
    }
    if executable.encode_utf16().count() > 4096 {
        return Err(invalid("Executable path is too long"));
    }
    let parts: Vec<_> = executable.split(['/', '\\']).collect();
    for part in &parts {
        validate_component(part)?;
    }
    if !parts
        .last()
        .unwrap_or(&"")
        .to_ascii_lowercase()
        .ends_with(".exe")
    {
        return Err(invalid("Only Windows .exe helpers are supported"));
    }
    Ok(parts)
}

#[cfg(windows)]
fn reject_reparse(metadata: &fs::Metadata) -> io::Result<()> {
    use std::os::windows::fs::MetadataExt;
    if metadata.file_attributes() & 0x400 != 0 {
        // FILE_ATTRIBUTE_REPARSE_POINT
        return Err(invalid(
            "Symlinks, junctions and reparse points are not allowed",
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn locked_directory(path: &Path) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    let file = OpenOptions::new()
        .access_mode(0x80) // FILE_READ_ATTRIBUTES
        .share_mode(0x1) // FILE_SHARE_READ: prevent replacement/reparse changes
        .custom_flags(0x02000000 | 0x00200000) // BACKUP_SEMANTICS | OPEN_REPARSE_POINT
        .open(path)?;
    let metadata = file.metadata()?;
    reject_reparse(&metadata)?;
    if !metadata.is_dir() {
        return Err(invalid("Expected a managed directory"));
    }
    Ok(file)
}

#[cfg(windows)]
fn locked_file(path: &Path) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    let file = OpenOptions::new()
        .read(true)
        .share_mode(0x1)
        .custom_flags(0x00200000)
        .open(path)?;
    let metadata = file.metadata()?;
    reject_reparse(&metadata)?;
    if !metadata.is_file() {
        return Err(invalid("Expected a regular helper file"));
    }
    Ok(file)
}

#[cfg(not(windows))]
fn locked_directory(_: &Path) -> io::Result<File> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Helper launch is supported only on Windows",
    ))
}
#[cfg(not(windows))]
fn locked_file(_: &Path) -> io::Result<File> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Helper launch is supported only on Windows",
    ))
}

pub struct ManagedGamePath {
    path: PathBuf,
    // Keep every checked directory open until copying or spawning has finished.
    // A canonicalize/check followed by dropping handles permits junction races.
    _directories: Vec<File>,
}

impl ManagedGamePath {
    pub fn prepare(base: &Path, app_id: &str, executable: &str, version: &str, create: bool) -> io::Result<Self> {
        let parts = validated_parts(app_id, executable)?;
        validate_component(version)?;
        let mut current = fs::canonicalize(base)?;
        let mut directories = vec![locked_directory(&current)?];
        let mut game_root: Option<PathBuf> = None;
        for part in std::iter::once("games")
            .chain(std::iter::once(app_id))
            .chain(std::iter::once(version))
            .chain(parts[..parts.len() - 1].iter().copied())
        {
            current.push(part);
            if create {
                match fs::create_dir(&current) {
                    Ok(()) => (),
                    Err(e) if e.kind() == io::ErrorKind::AlreadyExists => (),
                    Err(e) => return Err(e),
                }
            }
            directories.push(locked_directory(&current)?);
            current = fs::canonicalize(&current)?;
            if let Some(root) = &game_root {
                if !current.starts_with(root) {
                    return Err(invalid("Path escaped managed games directory"));
                }
            } else {
                game_root = Some(current.clone());
            }
        }
        current.push(parts.last().unwrap());
        Ok(Self {
            path: current,
            _directories: directories,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn install(&self, resource: &Path) -> io::Result<()> {
        let mut source = locked_file(resource)?;
        self.install_from(resource, &mut source)
    }

    fn install_from(&self, resource: &Path, source: &mut impl Read) -> io::Result<()> {
        match self.verified_file(resource) {
            Ok(_) => return Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => (),
            Err(e) => return Err(e),
        }
        let parent = self.path.parent().ok_or_else(|| invalid("Missing game directory"))?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        io::copy(source, temporary.as_file_mut())?;
        temporary.as_file_mut().sync_all()?;
        // Publish a complete file without replacing a destination created concurrently.
        match temporary.persist_noclobber(&self.path) {
            Ok(file) => drop(file),
            Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => (),
            Err(e) => return Err(e.error),
        }
        self.verified_file(resource).map(|_| ())
    }

    pub fn verified_file(&self, resource: &Path) -> io::Result<File> {
        let mut source = locked_file(resource)?;
        let mut target = locked_file(&self.path)?;
        if source.metadata()?.len() != target.metadata()?.len()
            || !same_contents(&mut source, &mut target)?
        {
            return Err(invalid("Managed executable differs from bundled helper; refusing to overwrite an unfamiliar file"));
        }
        // Keep this handle open through spawn to prevent a verified file being
        // swapped or modified between verification and process creation.
        Ok(target)
    }
}

fn same_contents(a: &mut File, b: &mut File) -> io::Result<bool> {
    let mut left = [0; 65536];
    let mut right = [0; 65536];
    loop {
        let count = a.read(&mut left)?;
        if count == 0 {
            return Ok(b.read(&mut right[..1])? == 0);
        }
        b.read_exact(&mut right[..count])?;
        if left[..count] != right[..count] {
            return Ok(false);
        }
    }
}

#[cfg(test)]
#[path = "game_paths_tests.rs"]
mod tests;

use std::io;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::process::Command;
use windows_sys::Win32::Foundation::{WAIT_OBJECT_0, WAIT_TIMEOUT};
use windows_sys::Win32::System::JobObjects::{
    CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK,
};
use windows_sys::Win32::System::Threading::{
    CreateProcessW, DeleteProcThreadAttributeList, InitializeProcThreadAttributeList,
    TerminateProcess, UpdateProcThreadAttribute, WaitForSingleObject, CREATE_NO_WINDOW,
    EXTENDED_STARTUPINFO_PRESENT, INFINITE, PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_JOB_LIST,
    STARTUPINFOEXW,
};

pub(super) struct ProcessJob(OwnedHandle);

impl ProcessJob {
    pub(super) fn new() -> io::Result<Self> {
        unsafe {
            // An unnamed job with no security attributes has no inheritable handle.
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() { return Err(io::Error::last_os_error()); }
            let job = Self(OwnedHandle::from_raw_handle(handle));
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            // Browser launches from a helper are not app-owned helpers.
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;
            if SetInformationJobObject(
                job.0.as_raw_handle(), JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _, std::mem::size_of_val(&limits) as u32,
            ) == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(job)
        }
    }

    pub(super) fn spawn(&self, command: &Command) -> io::Result<JobChild> {
        // Callers launch verified GUI helpers (or quiet native test fixtures).
        if command.get_envs().next().is_some() {
            return Err(io::Error::new(io::ErrorKind::Unsupported, "Helpers inherit the application environment"));
        }
        let program = wide(command.get_program())?;
        let directory = command.get_current_dir().map(|path| wide(path.as_os_str())).transpose()?;
        let mut command_line = Vec::new();
        for argument in std::iter::once(command.get_program()).chain(command.get_args()) {
            if !command_line.is_empty() { command_line.push(b' ' as u16); }
            quote_argument(&mut command_line, argument)?;
        }
        command_line.push(0);
        unsafe {
            let mut bytes = 0;
            InitializeProcThreadAttributeList(std::ptr::null_mut(), 1, 0, &mut bytes);
            if bytes == 0 { return Err(io::Error::last_os_error()); }
            let mut storage = vec![0usize; bytes.div_ceil(std::mem::size_of::<usize>())];
            let pointer = storage.as_mut_ptr().cast();
            if InitializeProcThreadAttributeList(pointer, 1, 0, &mut bytes) == 0 {
                return Err(io::Error::last_os_error());
            }
            let attributes = Attributes(storage);
            let mut job_handle = self.0.as_raw_handle();
            if UpdateProcThreadAttribute(pointer, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST as usize,
                std::ptr::from_mut(&mut job_handle).cast(), std::mem::size_of_val(&job_handle),
                std::ptr::null_mut(), std::ptr::null_mut()) == 0 {
                return Err(io::Error::last_os_error());
            }
            let mut startup: STARTUPINFOEXW = std::mem::zeroed();
            startup.StartupInfo.cb = std::mem::size_of_val(&startup) as u32;
            startup.lpAttributeList = pointer;
            let mut process: PROCESS_INFORMATION = std::mem::zeroed();
            // Windows assigns the job before running the child, or fails creation.
            let created = CreateProcessW(program.as_ptr(), command_line.as_mut_ptr(),
                std::ptr::null(), std::ptr::null(), 0,
                EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, std::ptr::null(),
                directory.as_ref().map_or(std::ptr::null(), |value| value.as_ptr()),
                &startup.StartupInfo, &mut process);
            if created == 0 { return Err(io::Error::last_os_error()); }
            drop(attributes);
            drop(OwnedHandle::from_raw_handle(process.hThread));
            Ok(JobChild(OwnedHandle::from_raw_handle(process.hProcess)))
        }
    }
}

struct Attributes(Vec<usize>);
impl Drop for Attributes {
    fn drop(&mut self) {
        unsafe { DeleteProcThreadAttributeList(self.0.as_mut_ptr().cast()); }
    }
}

fn wide(value: &OsStr) -> io::Result<Vec<u16>> {
    let mut value: Vec<_> = value.encode_wide().collect();
    if value.contains(&0) { return Err(io::Error::new(io::ErrorKind::InvalidInput, "Embedded null in process argument")); }
    value.push(0);
    Ok(value)
}

fn quote_argument(output: &mut Vec<u16>, value: &OsStr) -> io::Result<()> {
    output.push(b'"' as u16);
    let mut backslashes = 0;
    let value = wide(value)?;
    for &character in &value[..value.len() - 1] {
        if character == b'\\' as u16 {
            backslashes += 1;
            continue;
        }
        let count = if character == b'"' as u16 { backslashes * 2 + 1 } else { backslashes };
        output.extend(std::iter::repeat_n(b'\\' as u16, count));
        output.push(character);
        backslashes = 0;
    }
    output.extend(std::iter::repeat_n(b'\\' as u16, backslashes * 2));
    output.push(b'"' as u16);
    Ok(())
}

pub(super) struct JobChild(OwnedHandle);
impl JobChild {
    #[cfg(test)]
    pub(super) fn id(&self) -> u32 {
        unsafe { windows_sys::Win32::System::Threading::GetProcessId(self.0.as_raw_handle()) }
    }
    pub(super) fn try_wait(&mut self) -> io::Result<Option<()>> {
        match unsafe { WaitForSingleObject(self.0.as_raw_handle(), 0) } {
            WAIT_OBJECT_0 => Ok(Some(())),
            WAIT_TIMEOUT => Ok(None),
            _ => Err(io::Error::last_os_error()),
        }
    }
    pub(super) fn kill(&mut self) -> io::Result<()> {
        if unsafe { TerminateProcess(self.0.as_raw_handle(), 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
    pub(super) fn wait(&mut self) -> io::Result<()> {
        if unsafe { WaitForSingleObject(self.0.as_raw_handle(), INFINITE) } != WAIT_OBJECT_0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::System::Threading::CreateEventW;

    #[test]
    fn invalid_job_handle_fails_process_creation() {
        let event = unsafe { CreateEventW(std::ptr::null(), 0, 0, std::ptr::null()) };
        assert!(!event.is_null());
        let job = ProcessJob(unsafe { OwnedHandle::from_raw_handle(event) });
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.arg("--list");
        assert!(job.spawn(&command).is_err());
    }
}

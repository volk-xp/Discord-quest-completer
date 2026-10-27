//! Only children spawned here can be stopped. IDs are session-local tokens,
//! never OS PIDs or executable names. On Windows each child retains its process HANDLE.
use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(not(windows))]
use std::process::Child;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[cfg(windows)]
#[path = "process_job.rs"]
mod process_job;
#[cfg(windows)]
use process_job::JobChild as Child;

pub const AUTO_STOP: Duration = Duration::from_secs(16 * 60);
const STOP_RETRY_DELAY: Duration = Duration::from_secs(5);

struct OwnedProcess {
    path: PathBuf,
    child: Child,
    deadline: Option<Instant>,
    started_at: u64,
    ends_at: u64,
}

pub struct ProcessSession {
    pub launch_id: String,
    pub started_at: u64,
    pub ends_at: u64,
}

#[derive(Default)]
pub struct OwnedProcesses {
    next_id: u64,
    shutting_down: bool,
    children: HashMap<String, OwnedProcess>,
    #[cfg(windows)]
    job: Option<process_job::ProcessJob>,
}

impl OwnedProcesses {
    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down
    }

    pub fn expire(&mut self, now: Instant) -> Vec<String> {
        self.expire_with(now, Self::stop)
    }

    fn expire_with(&mut self, now: Instant, mut stop: impl FnMut(&mut Self, &str) -> io::Result<()>) -> Vec<String> {
        let expired: Vec<_> = self.children.iter()
            .filter(|(_, owned)| owned.deadline.is_some_and(|deadline| deadline <= now))
            .map(|(id, _)| id.clone()).collect();
        expired.into_iter().filter_map(|id| {
            // Keep failed stops eligible for retry without retrying every monitor tick.
            self.children.get_mut(&id).unwrap().deadline = Some(now + STOP_RETRY_DELAY);
            stop(self, &id).err().map(|error| format!("{id}: {error}"))
        }).collect()
    }

    pub fn running_sessions(&mut self) -> io::Result<Vec<ProcessSession>> {
        Ok(self.running_ids()?.into_iter().map(|id| {
            let owned = &self.children[&id];
            ProcessSession { launch_id: id, started_at: owned.started_at, ends_at: owned.ends_at }
        }).collect())
    }

    pub fn running_ids(&mut self) -> io::Result<Vec<String>> {
        let mut running = Vec::new();
        let mut exited = Vec::new();
        for (id, owned) in &mut self.children {
            if owned.child.try_wait()?.is_some() {
                exited.push(id.clone());
            } else {
                running.push(id.clone());
            }
        }
        for id in exited {
            self.children.remove(&id);
        }
        Ok(running)
    }

    // Call under the same mutex as stop(), including spawn, so simultaneous
    // requests cannot overwrite or lose a retained handle.
    pub fn launch(&mut self, path: &Path, command: &mut Command) -> io::Result<String> {
        if self.shutting_down {
            return Err(io::Error::other("Application is shutting down"));
        }
        self.children
            .retain(|_, owned| !matches!(owned.child.try_wait(), Ok(Some(_))));
        if let Some((id, _)) = self.children.iter().find(|(_, owned)| owned.path == path) {
            return Ok(id.clone());
        }
        let next_id = self
            .next_id
            .checked_add(1)
            .ok_or_else(|| io::Error::other("Launch ID space exhausted"))?;
        #[cfg(windows)]
        if self.job.is_none() {
            self.job = Some(process_job::ProcessJob::new()?);
        }
        #[cfg(windows)]
        let child = self.job.as_ref().unwrap().spawn(command)?;
        #[cfg(not(windows))]
        let child = command.spawn()?;
        let started_at = SystemTime::now().duration_since(UNIX_EPOCH)
            .unwrap_or_default().as_millis() as u64;
        self.next_id = next_id;
        let id = format!("launch-{next_id}");
        self.children.insert(
            id.clone(),
            OwnedProcess {
                path: path.to_owned(),
                child,
                deadline: Some(Instant::now() + AUTO_STOP),
                started_at,
                ends_at: started_at + AUTO_STOP.as_millis() as u64,
            },
        );
        Ok(id)
    }

    pub fn stop(&mut self, id: &str) -> io::Result<()> {
        let Some(owned) = self.children.get_mut(id) else {
            // Repeated stops and expired timers are safe, including after exit.
            return Ok(());
        };
        stop_child(&mut owned.child)?;
        // Keep the handle if termination or waiting fails, allowing a retry.
        self.children.remove(id);
        Ok(())
    }

    pub fn shutdown(&mut self) -> Vec<String> {
        self.shutting_down = true;
        let ids: Vec<_> = self.children.keys().cloned().collect();
        ids.into_iter()
            .filter_map(|id| self.stop(&id).err().map(|e| format!("{id}: {e}")))
            .collect()
    }
}

fn stop_child(child: &mut Child) -> io::Result<()> {
    if child.try_wait()?.is_none() {
        if let Err(error) = child.kill() {
            // The child may have exited between try_wait and kill. Never look
            // up a PID or fall back to a name-based kill in this race.
            if child.try_wait()?.is_none() {
                return Err(error);
            }
        }
    }
    child.wait()?;
    Ok(())
}

impl Drop for OwnedProcesses {
    fn drop(&mut self) {
        for error in self.shutdown() {
            eprintln!("Failed to stop owned helper: {error}");
        }
    }
}

#[cfg(test)]
#[path = "owned_processes_tests.rs"]
mod tests;

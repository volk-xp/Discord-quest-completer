use once_cell::sync::Lazy;
use serde::Serialize;
use std::{collections::HashMap, future::Future, sync::Mutex, time::{Duration, Instant}};
use tokio::sync::watch;

pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, Serialize)]
pub struct RequestError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
}

impl RequestError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), status: None }
    }
    pub fn cancelled() -> Self {
        Self::new("cancelled", "Request cancelled")
    }
}

struct Request {
    cancel: watch::Sender<bool>,
    started: bool,
    created: Instant,
}

#[derive(Default)]
struct Registry {
    next_id: u64,
    requests: HashMap<String, Request>,
}

static REQUESTS: Lazy<Mutex<Registry>> = Lazy::new(|| Mutex::new(Registry::default()));

// Registration is acknowledged before work starts, so cancellation cannot race
// ahead of the backend creating its cancellation handle.
pub fn register() -> Result<String, RequestError> {
    let mut registry = REQUESTS.lock().map_err(|_| RequestError::new("unavailable", "Request registry unavailable"))?;
    registry.requests.retain(|_, request| request.started || request.created.elapsed() < REQUEST_TIMEOUT);
    if registry.requests.len() >= 64 {
        return Err(RequestError::new("unavailable", "Too many active requests"));
    }
    registry.next_id = registry.next_id.checked_add(1)
        .ok_or_else(|| RequestError::new("unavailable", "Request ID space exhausted"))?;
    let id = format!("request-{}", registry.next_id);
    let (cancel, _) = watch::channel(false);
    registry.requests.insert(id.clone(), Request { cancel, started: false, created: Instant::now() });
    Ok(id)
}

pub fn cancel(id: &str) -> Result<(), RequestError> {
    let request = REQUESTS.lock().map_err(|_| RequestError::new("unavailable", "Request registry unavailable"))?
        .requests.remove(id);
    if let Some(request) = request {
        let _ = request.cancel.send(true);
    }
    Ok(())
}

struct Lease(String);
impl Drop for Lease {
    fn drop(&mut self) {
        REQUESTS.lock().unwrap_or_else(|error| error.into_inner()).requests.remove(&self.0);
    }
}

pub async fn run<T>(id: &str, work: impl Future<Output = Result<T, RequestError>>) -> Result<T, RequestError> {
    run_for(id, REQUEST_TIMEOUT, work).await
}

async fn run_for<T>(id: &str, limit: Duration, work: impl Future<Output = Result<T, RequestError>>) -> Result<T, RequestError> {
    let mut cancellation = {
        let mut registry = REQUESTS.lock().map_err(|_| RequestError::new("unavailable", "Request registry unavailable"))?;
        let request = registry.requests.get_mut(id).ok_or_else(RequestError::cancelled)?;
        if request.started {
            return Err(RequestError::new("invalid_input", "Request already started"));
        }
        request.started = true;
        request.cancel.subscribe()
    };
    let _lease = Lease(id.to_owned());
    tokio::select! {
        biased;
        _ = cancellation.changed() => Err(RequestError::cancelled()),
        result = tokio::time::timeout(limit, work) => {
            result.map_err(|_| RequestError::new("timeout", "Request timed out"))?
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{atomic::{AtomicBool, Ordering}, Arc};

    fn block_on<T>(work: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(work)
    }

    struct Dropped(Arc<AtomicBool>);
    impl Drop for Dropped {
        fn drop(&mut self) { self.0.store(true, Ordering::SeqCst); }
    }

    #[test]
    fn cancellation_before_start_cannot_be_lost() {
        let id = register().unwrap();
        cancel(&id).unwrap();
        let result = block_on(run(&id, async { Ok(()) }));
        assert_eq!(result.unwrap_err().code, "cancelled");
    }

    #[test]
    fn cancellation_drops_in_flight_work_and_releases_its_slot() {
        block_on(async {
            let id = register().unwrap();
            let dropped = Arc::new(AtomicBool::new(false));
            let guard = Dropped(dropped.clone());
            let work = async move { let _guard = guard; std::future::pending::<Result<(), RequestError>>().await };
            let request = run(&id, work);
            tokio::pin!(request);
            tokio::select! {
                _ = &mut request => panic!("Request finished before cancellation"),
                _ = tokio::task::yield_now() => {}
            }
            cancel(&id).unwrap();
            assert_eq!(request.await.unwrap_err().code, "cancelled");
            assert!(dropped.load(Ordering::SeqCst));
            assert!(!REQUESTS.lock().unwrap().requests.contains_key(&id));
        });
    }

    #[test]
    fn timeout_drops_work_and_returns_a_structured_error() {
        block_on(async {
            let id = register().unwrap();
            let dropped = Arc::new(AtomicBool::new(false));
            let guard = Dropped(dropped.clone());
            let work = async move { let _guard = guard; std::future::pending::<Result<(), RequestError>>().await };
            let result = run_for(&id, Duration::from_millis(5), work).await;
            assert_eq!(result.unwrap_err().code, "timeout");
            assert!(dropped.load(Ordering::SeqCst));
            assert!(!REQUESTS.lock().unwrap().requests.contains_key(&id));
        });
    }
}

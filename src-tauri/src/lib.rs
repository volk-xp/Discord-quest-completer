// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use once_cell::sync::OnceCell;
use std::env;
use std::sync::Mutex;
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use window_vibrancy::{apply_acrylic, apply_mica};

mod rpc;
mod requests;
use requests::RequestError;
mod runner;
mod game_paths;
mod owned_processes;
#[cfg(test)]
mod catalog_fetch_tests;

struct RpcConnection {
    request_id: String,
    request_token: String,
    client: rpc::Client,
}

#[derive(Default)]
struct RpcState {
    pending: Option<String>,
    connection: Option<RpcConnection>,
}

static DISCORD_CLIENT: OnceCell<Mutex<RpcState>> = OnceCell::new();

fn get_discord_client() -> &'static Mutex<RpcState> {
    DISCORD_CLIENT.get_or_init(|| Mutex::new(RpcState::default()))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command(rename_all = "snake_case")]
async fn create_fake_game(
    handle: tauri::AppHandle,
    executable_name: &str,
    app_id: &str,
) -> Result<String, String> {
    let exe_path = env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Cannot locate application directory")?;
    let resource_path = handle
        .path()
        .resolve("data/src-win.exe", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let target = game_paths::ManagedGamePath::prepare(exe_dir, app_id, executable_name, env!("CARGO_PKG_VERSION"), true)
        .map_err(|e| format!("Unsafe or unavailable game path: {e}"))?;
    target.install(&resource_path).map_err(|e| format!("Failed to create helper: {e}"))?;
    Ok(format!("Dummy executable ready: {:?}", target.path()))
}

#[tauri::command(rename_all = "snake_case")]
async fn run_background_process(
    handle: tauri::AppHandle,
    processes: tauri::State<'_, Mutex<owned_processes::OwnedProcesses>>,
    name: &str,
    executable_name: &str,
    app_id: &str,
) -> Result<String, String> {
    let exe_path = env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Cannot locate application directory")?;
    let resource_path = handle.path().resolve("data/src-win.exe", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let target = game_paths::ManagedGamePath::prepare(exe_dir, app_id, executable_name, env!("CARGO_PKG_VERSION"), false)
        .map_err(|e| format!("Unsafe or unavailable game path: {e}"))?;
    let _verified_file = target.verified_file(&resource_path)
        .map_err(|e| format!("Refusing to launch unverified helper: {e}"))?;
    let process_path = std::fs::canonicalize(target.path()).map_err(|e| e.to_string())?;
    let mut command = std::process::Command::new(target.path());
    command.args(["--title", name])
        .current_dir(target.path().parent().ok_or("Missing game directory")?);
    let mut registry = processes.lock().map_err(|_| "Process registry is unavailable")?;
    registry.launch(&process_path, &mut command)
        .map_err(|e| format!("Failed to start process: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
async fn stop_process(
    processes: tauri::State<'_, Mutex<owned_processes::OwnedProcesses>>,
    launch_id: &str,
) -> Result<(), String> {
    let mut registry = processes.lock().map_err(|_| "Process registry is unavailable")?;
    registry.stop(launch_id)
        .map_err(|e| format!("Failed to stop owned process: {e}"))
}

#[tauri::command]
fn running_processes(
    processes: tauri::State<'_, Mutex<owned_processes::OwnedProcesses>>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut registry = processes.lock().map_err(|_| "Process registry is unavailable")?;
    registry.running_sessions().map(|sessions| sessions.into_iter().map(|session| serde_json::json!({
        "launch_id": session.launch_id,
        "started_at": session.started_at,
        "ends_at": session.ends_at,
    })).collect()).map_err(|e| format!("Failed to check owned processes: {e}"))
}

#[tauri::command]
fn start_request() -> Result<String, RequestError> {
    requests::register()
}

#[tauri::command(rename_all = "snake_case")]
fn cancel_request(request_token: String) -> Result<(), RequestError> {
    requests::cancel(&request_token)?;
    let previous = {
        let mut state = get_discord_client().lock()
            .map_err(|_| RequestError::new("unavailable", "RPC state unavailable"))?;
        if state.pending.as_deref() == Some(request_token.as_str()) { state.pending = None; }
        if state.connection.as_ref().is_some_and(|connection| connection.request_token == request_token) {
            state.connection.take()
        } else { None }
    };
    // Covers cancellation racing with a completed RPC whose IPC response is late.
    drop(previous);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
async fn rpc_connection_id(request_token: String) -> Result<Option<String>, RequestError> {
    requests::run(&request_token, async {
        let state = get_discord_client().lock()
            .map_err(|_| RequestError::new("unavailable", "RPC state unavailable"))?;
        Ok(state.connection.as_ref().map(|connection| connection.request_id.clone()))
    }).await
}

// Locks only protect ownership changes; no SDK or network wait holds this lock.
#[tauri::command(rename_all = "snake_case")]
async fn connect_to_discord_rpc_3(
    handle: AppHandle,
    activity_json: String,
    action: String,
    request_id: String,
    request_token: String,
) -> Result<(), RequestError> {
    let result = requests::run(&request_token, async {
        if action != "connect" && action != "disconnect" {
            return Err(RequestError::new("invalid_input", "Unknown RPC action"));
        }
        let activity = if action == "connect" { Some(runner::create_activity(activity_json)?) } else { None };
        let (pending, previous) = {
            let mut state = get_discord_client().lock()
                .map_err(|_| RequestError::new("unavailable", "RPC state unavailable"))?;
            let pending = state.pending.take();
            if action == "connect" { state.pending = Some(request_token.clone()); }
            (pending, state.connection.take())
        };
        if let Some(pending) = pending { requests::cancel(&pending)?; }
        if let Some(previous) = previous { previous.client.disconnect().await?; }
        let Some(activity) = activity else { return Ok(()); };
        let client = runner::set_activity(activity).await?;
        let mut user = client.wheel.user();
        {
            let mut state = get_discord_client().lock()
                .map_err(|_| RequestError::new("unavailable", "RPC state unavailable"))?;
            if state.pending.as_deref() != Some(request_token.as_str()) {
                return Err(RequestError::cancelled());
            }
            state.pending = None;
            state.connection = Some(RpcConnection { request_id: request_id.clone(), request_token: request_token.clone(), client });
        }
        tauri::async_runtime::spawn(async move {
            let error = loop {
                let error = match &*user.0.borrow_and_update() {
                    rpc::ds::wheel::UserState::Connected(_) => None,
                    rpc::ds::wheel::UserState::Disconnected(error) => Some(error.to_string()),
                };
                if let Some(error) = error { break RequestError::new("rpc", error); }
                if user.0.changed().await.is_err() {
                    break RequestError::new("rpc", "Discord connection closed");
                }
            };
            let previous = {
                let mut state = get_discord_client().lock().unwrap_or_else(|error| error.into_inner());
                if state.connection.as_ref().is_some_and(|connection| connection.request_id == request_id) {
                    state.connection.take()
                } else { None }
            };
            if let Some(previous) = previous { let _ = previous.client.disconnect().await; }
            let _ = handle.emit("client_disconnected", serde_json::json!({ "request_id": request_id, "error": error }));
        });
        Ok(())
    }).await;
    if let Ok(mut state) = get_discord_client().lock() {
        if state.pending.as_deref() == Some(request_token.as_str()) { state.pending = None; }
    }
    result
}

const MAX_CATALOG_BODY_BYTES: usize = 16 * 1024 * 1024;

async fn fetch_game_catalog(url: &str, request_token: &str) -> Result<serde_json::Value, RequestError> {
    requests::run(request_token, async {
        let client = tauri_plugin_http::reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(5))
            .timeout(std::time::Duration::from_secs(15))
            .build().map_err(|error| RequestError::new("network", error.to_string()))?;
        let mut response = client.get(url).send().await
            .map_err(|error| RequestError::new(if error.is_timeout() { "timeout" } else { "network" }, error.to_string()))?;
        if !response.status().is_success() {
            return Err(RequestError { code: "http", message: format!("Game catalog HTTP error: {}", response.status()), status: Some(response.status().as_u16()) });
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await
            .map_err(|error| RequestError::new(if error.is_timeout() { "timeout" } else { "network" }, error.to_string()))? {
            // Count decoded bytes, including responses without Content-Length.
            if chunk.len() > MAX_CATALOG_BODY_BYTES - body.len() {
                return Err(RequestError::new("too_large", "Game catalog exceeds the 16 MiB limit"));
            }
            body.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&body).map_err(|error| RequestError::new("parse", format!("Invalid game catalog JSON: {error}")))
    }).await
}

#[tauri::command(rename_all = "snake_case")]
async fn fetch_gamelist_gh_mirror(request_token: String) -> Result<serde_json::Value, RequestError> {
    fetch_game_catalog("https://markterence.github.io/discord-quest-completer/detectable.json", &request_token).await
}

#[tauri::command(rename_all = "snake_case")]
async fn fetch_gamelist_from_discord(request_token: String) -> Result<serde_json::Value, RequestError> {
    fetch_game_catalog("https://discord.com/api/applications/detectable", &request_token).await
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(owned_processes::OwnedProcesses::default()))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            create_fake_game,
            stop_process,
            running_processes,
            connect_to_discord_rpc_3,
            rpc_connection_id,
            start_request,
            cancel_request,
            run_background_process,
            fetch_gamelist_gh_mirror,
            fetch_gamelist_from_discord
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
                loop {
                    tick.tick().await;
                    let state = handle.state::<Mutex<owned_processes::OwnedProcesses>>();
                    let mut processes = state.lock().unwrap_or_else(|error| error.into_inner());
                    if processes.is_shutting_down() { break; }
                    for error in processes.expire(std::time::Instant::now()) {
                        eprintln!("Failed to auto-stop owned helper: {error}");
                    }
                }
            });
            let window = app
                .get_webview_window("main")
                .expect("main window should exist");

            // Acrylic blurs whatever is directly behind the window on screen —
            // including other overlapping app windows, not just the desktop.
            // Mica (tried as a fallback) only ever blurs the desktop wallpaper,
            // so it's not useful when the app overlaps other windows.
            if apply_acrylic(&window, Some((13, 13, 13, 120))).is_err() {
                let _ = apply_mica(&window, None);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<Mutex<owned_processes::OwnedProcesses>>();
                // Recover a poisoned registry for best-effort shutdown cleanup.
                let mut processes = state.lock().unwrap_or_else(|e| e.into_inner());
                for error in processes.shutdown() {
                    eprintln!("Failed to stop owned helper on exit: {error}");
                }
            }
        });
}

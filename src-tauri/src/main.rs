#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod jobs;
mod local;
mod storage;
mod transfer;
#[cfg(feature = "ui-test")]
mod ui_test;

use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{ipc::Channel, Emitter, Manager};

#[derive(Default)]
struct Browsers([AtomicU64; 2]);

#[tauri::command]
async fn list_folder(
    app: tauri::AppHandle,
    pane: usize,
    generation: u64,
    target: storage::Target,
    updates: Channel<storage::Listing>,
) -> Result<(), String> {
    let browsers = app.state::<Browsers>();
    let counter = browsers.0.get(pane).ok_or("Invalid pane")?;
    counter.fetch_max(generation, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<storage::Storage>().list(target, &mut |batch| {
            app.state::<Browsers>().0[pane].load(Ordering::SeqCst) == generation
                && updates.send(batch).is_ok()
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_file(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<storage::Storage>().open(&id))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn frontend_ready(window: tauri::WebviewWindow, report: Option<serde_json::Value>) {
    if std::env::args_os().any(|arg| arg == "--smoke-test") {
        window.app_handle().exit(0);
    }
    #[cfg(feature = "ui-test")]
    ui_test::drive(&window, report);
    #[cfg(not(feature = "ui-test"))]
    let _ = report;
}

fn main() {
    let provider: storage::Storage = std::sync::Arc::new(local::LocalStorage);
    tauri::Builder::default()
        .manage(provider.clone())
        .manage(Browsers::default())
        .manage(jobs::Queue::new(provider))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<jobs::Queue>().busy() {
                    api.prevent_close();
                    let _ = window.emit("queue-needs-attention", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            frontend_ready,
            list_folder,
            open_file,
            jobs::start_job,
            jobs::job_list,
            jobs::job_report,
            jobs::cancel_job,
            jobs::answer_conflict
        ])
        .run(tauri::generate_context!())
        .expect("could not start SC Commander");
}

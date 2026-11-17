#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod jobs;
mod local;
mod places;
mod storage;
mod transfer;
#[cfg(feature = "ui-test")]
mod ui_test;
mod updates;

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
async fn quick_places() -> Result<Vec<places::Place>, String> {
    tauri::async_runtime::spawn_blocking(places::list)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn quick_place_label(id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || places::label(&id))
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

#[cfg(target_os = "macos")]
fn macos_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind};

    let menu = Menu::default(app)?;
    // The default File and Window menus both claim Cmd+W.
    for item in menu.items()? {
        let MenuItemKind::Submenu(submenu) = item else {
            continue;
        };
        for (index, item) in submenu.items()?.into_iter().enumerate() {
            if let MenuItemKind::Predefined(item) = item {
                if item.text()? != "Close" {
                    continue;
                }
                let close = MenuItem::with_id(
                    app,
                    "close-window",
                    "Close Window",
                    true,
                    Some("Cmd+Shift+W"),
                )?;
                submenu.remove(&item)?;
                submenu.insert(&close, index)?;
            }
        }
    }
    Ok(menu)
}

fn main() {
    let provider: storage::Storage = std::sync::Arc::new(local::LocalStorage);
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.menu(macos_menu).on_menu_event(|app, event| {
        if event.id() == "close-window" {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.close();
            }
        }
    });
    builder
        .setup(|app| {
            if app.config().plugins.0.contains_key("updater") {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        })
        .manage(provider.clone())
        .manage(Browsers::default())
        .manage(jobs::Queue::new(provider))
        .manage(updates::PendingUpdate::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let queue = window.state::<jobs::Queue>();
                if queue.installing_update() {
                    api.prevent_close();
                } else if queue.busy() {
                    api.prevent_close();
                    let _ = window.emit("queue-needs-attention", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            frontend_ready,
            list_folder,
            quick_places,
            quick_place_label,
            open_file,
            updates::check_update,
            updates::install_update,
            jobs::start_job,
            jobs::job_list,
            jobs::job_report,
            jobs::cancel_job,
            jobs::answer_conflict
        ])
        .run(tauri::generate_context!())
        .expect("could not start SC Commander");
}

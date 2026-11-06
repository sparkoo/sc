#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn frontend_ready(app: tauri::AppHandle) {
    if std::env::args_os().any(|arg| arg == "--smoke-test") {
        app.exit(0);
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![frontend_ready])
        .run(tauri::generate_context!())
        .expect("could not start SC Commander");
}

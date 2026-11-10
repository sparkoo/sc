//! Compiled only into the UI acceptance-test binary.
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::Manager;

static STARTED: AtomicBool = AtomicBool::new(false);

pub fn drive(window: &tauri::WebviewWindow, report: Option<serde_json::Value>) {
    if !std::env::args_os().any(|arg| arg == "--ui-test") {
        return;
    }
    let root = PathBuf::from(std::env::var_os("SC_UI_FIXTURE").expect("missing fixture"));
    assert!(root.join(".sc-ui-fixture").is_file());
    if let Some(result) = report {
        std::fs::write(
            root.join("result.json"),
            serde_json::to_vec(&result).unwrap(),
        )
        .unwrap();
        window
            .app_handle()
            .exit(if result["ok"] == true { 0 } else { 1 });
    } else if !STARTED.swap(true, Ordering::SeqCst) {
        let locations = serde_json::json!({
            "home": dunce::canonicalize(dirs::home_dir().expect("missing home")).expect("resolve home"),
            "source": root.join("source"), "target": root.join("target"), "large": root.join("large"),
            "count": std::env::var("SC_UI_ENTRIES").unwrap().parse::<u32>().unwrap(),
        });
        window
            .eval(format!(
                "({})({locations})",
                include_str!("../../tests/desktop.js")
            ))
            .unwrap();
    }
}

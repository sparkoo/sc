use crate::jobs::Queue;
use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Error, Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<String>, String> {
    if !app.config().plugins.0.contains_key("updater") {
        return Ok(None);
    }

    // The Linux updater replaces the running AppImage. Package-managed
    // installations and local binaries do not have an AppImage to replace.
    #[cfg(target_os = "linux")]
    if app.env().appimage.is_none() {
        return Ok(None);
    }

    let builder = app.updater_builder().timeout(Duration::from_secs(15));
    #[cfg(windows)]
    let builder = builder.restart_after_install(true).on_before_exit(|| {
        // Keep the window usable if Windows rejects the installer launch.
        // The updater exits the process once the installer launches.
    });
    let updater = match builder.build() {
        Ok(updater) => updater,
        Err(Error::EmptyEndpoints) => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let update = updater.check().await.map_err(|error| error.to_string())?;
    let version = update.as_ref().map(|update| update.version.clone());
    *app.state::<PendingUpdate>().0.lock().unwrap() = update;
    Ok(version)
}

#[tauri::command]
pub async fn install_update(app: AppHandle, version: String) -> Result<bool, String> {
    let mut update = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .unwrap()
        .as_ref()
        .filter(|update| update.version == version)
        .cloned()
        .ok_or("Check for updates again before installing")?;
    let queue = app.state::<Queue>();
    let Some(_reservation) = queue.reserve_for_update()? else {
        return Ok(false);
    };

    update.timeout = Some(Duration::from_secs(300));
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;

    // The Windows installer exits this process and relaunches the installed app.
    app.restart();
}

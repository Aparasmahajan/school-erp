// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// The Windows app is a thin shell: it shows the same web UI (built with
/// `vite build --mode desktop`) and talks to the same API over HTTPS. No data and no
/// Google credentials live on the laptop.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while starting School ERP");
}

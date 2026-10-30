// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager, LogicalSize};

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

// 切换窗口模式：兼具独立多 Webview 窗口切换与单窗口原生动态缩放（对齐 AGENTS.md 5.1 领域错误规范）
#[tauri::command]
fn toggle_floating_mode(app: AppHandle, to_floating: bool) -> Result<(), AppError> {
    // 优先：如果配置了独立的 floating-pill 窗口
    if let (Some(main_window), Some(pill_window)) = (
        app.get_webview_window("main"),
        app.get_webview_window("floating-pill"),
    ) {
        if to_floating {
            let _ = main_window.hide();
            let _ = pill_window.show();
            let _ = pill_window.set_focus();
        } else {
            let _ = pill_window.hide();
            let _ = main_window.show();
            let _ = main_window.set_focus();
        }
        return Ok(());
    }

    // 备用：单窗口动态变形模式
    if let Some(main_window) = app.get_webview_window("main") {
        if to_floating {
            let _ = main_window.set_size(LogicalSize::new(300.0, 42.0));
            let _ = main_window.set_decorations(false);
            let _ = main_window.set_always_on_top(true);
        } else {
            let _ = main_window.set_size(LogicalSize::new(1200.0, 800.0));
            let _ = main_window.set_decorations(true);
            let _ = main_window.set_always_on_top(false);
        }
        return Ok(());
    }

    Err(AppError {
        code: "WINDOW_NOT_FOUND".into(),
        message: "未找到目标窗口实例".into(),
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![toggle_floating_mode])
        .run(tauri::generate_context!())
        .expect("运行听序 Tauri 客户端异常");
}

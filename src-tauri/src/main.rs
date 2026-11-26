// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager, LogicalSize, Emitter};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tingxu_desktop::media::system_audio::SystemAudioCapture;
use tingxu_desktop::media::recording_commands::*;

const GLOBAL_QUICK_RECORD_SHORTCUT: &str = "CommandOrControl+Alt+R";

fn format_tray_status(status: &str, elapsed_label: Option<&str>) -> (String, String) {
    match status {
        "RECORDING" => {
            let timer = elapsed_label.unwrap_or("00:00");
            (
                format!(" ● {timer}"),
                format!("听序 — 正在录制会议 ({timer})"),
            )
        }
        "PAUSED" => {
            let timer = elapsed_label.unwrap_or("00:00");
            (
                format!(" ⏸ {timer}"),
                format!("听序 — 会议录音已暂停 ({timer})"),
            )
        }
        _ => (String::new(), "听序 — AI 会议助手".to_string()),
    }
}

#[derive(Clone)]
struct AudioCaptureState(Arc<Mutex<SystemAudioCapture>>);

#[derive(Clone, Default)]
struct AppExitState(Arc<AtomicBool>);

fn should_allow_window_close(exiting: bool) -> bool {
    exiting
}

fn apply_floating_mode(main_window: &tauri::WebviewWindow, to_floating: bool) {
    if to_floating {
        // 切换为桌面极简置顶悬浮胶囊：先解除 900x600 最小约束，再调整尺寸与原生置顶，并禁用系统矩形阴影防止四角透黑/透白
        let _ = main_window.set_min_size(None::<LogicalSize<f64>>);
        let _ = main_window.set_resizable(false);
        let _ = main_window.set_decorations(false);
        let _ = main_window.set_always_on_top(true);
        let _ = main_window.set_shadow(false);
        let _ = main_window.set_background_color(Some(tauri::utils::config::Color(0, 0, 0, 0)));
        let _ = main_window.set_size(LogicalSize::new(360.0, 44.0));
    } else {
        // 恢复主工作台：恢复最小约束、可调节尺寸、保持无边框沉浸外观（由前端自定义窗口控制接管）、居中展现与原生窗口阴影
        let _ = main_window.set_min_size(Some(LogicalSize::new(900.0, 600.0)));
        let _ = main_window.set_resizable(true);
        let _ = main_window.set_decorations(false);
        let _ = main_window.set_always_on_top(false);
        let _ = main_window.set_shadow(true);
        let _ = main_window.set_background_color(Some(tauri::utils::config::Color(0, 0, 0, 0)));
        let _ = main_window.set_size(LogicalSize::new(1200.0, 800.0));
        let _ = main_window.center();
    }
}

fn show_and_focus_main_window(app: &AppHandle) {
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.unminimize();
        let _ = main_window.set_focus();
    }
}

fn stop_audio_capture_gracefully(app: &AppHandle) {
    if let Some(audio_state) = app.try_state::<AudioCaptureState>() {
        if let Ok(mut capture) = audio_state.0.lock() {
            let _ = capture.stop();
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

// 切换窗口模式：单窗口无缝形态变换（Single Window Morphing），保证音频流与内存状态永不断流
#[tauri::command]
fn toggle_floating_mode(app: AppHandle, to_floating: bool) -> Result<(), AppError> {
    if let Some(main_window) = app.get_webview_window("main") {
        apply_floating_mode(&main_window, to_floating);
        let _ = main_window.show();
        return Ok(());
    }

    Err(AppError {
        code: "WINDOW_NOT_FOUND".into(),
        message: "未找到目标窗口实例".into(),
    })
}

// 后台托盘检测到会议时，将隐藏窗口切换为 42px 置顶悬浮胶囊并浮现（不强抢主窗口焦点）
#[tauri::command]
fn reveal_floating_pill(app: AppHandle) -> Result<(), AppError> {
    if let Some(main_window) = app.get_webview_window("main") {
        apply_floating_mode(&main_window, true);
        let _ = main_window.show();
    }
    Ok(())
}

// 原生窗口拖拽命令：由 Rust 端直接调用 AppKit/Cocoa performWindowDragWithEvent，规避前端插件权限限制
#[tauri::command]
fn drag_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.start_dragging();
    }
    Ok(())
}

// 原生窗口最小化命令
#[tauri::command]
fn minimize_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.minimize();
    }
    Ok(())
}

// 原生窗口最大化/还原切换命令（供无边框窗口双击标题栏调用）
#[tauri::command]
fn toggle_maximize_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(main_window) = app.get_webview_window("main") {
        let is_maximized = main_window.is_maximized().unwrap_or(false);
        if is_maximized {
            let _ = main_window.unmaximize();
        } else {
            let _ = main_window.maximize();
        }
    }
    Ok(())
}

// 原生窗口关闭命令：隐藏主窗口到系统托盘常驻，不退出进程
#[tauri::command]
fn close_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.hide();
    }
    Ok(())
}

// 真正退出应用命令（供 Cmd+Q 或托盘菜单「退出听序」调用）
#[tauri::command]
fn quit_app(
    app: AppHandle,
    exit_state: tauri::State<'_, AppExitState>,
) -> Result<(), AppError> {
    exit_state.0.store(true, Ordering::SeqCst);
    stop_audio_capture_gracefully(&app);
    app.exit(0);
    Ok(())
}

// 同步会议录音状态到顶部菜单栏托盘（macOS 显示实时红点计时，全平台更新悬停提示）
#[tauri::command]
fn update_tray_recording_state(
    app: AppHandle,
    status: String,
    elapsed_label: Option<String>,
) -> Result<(), AppError> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let (title, tooltip) = format_tray_status(&status, elapsed_label.as_deref());
        #[cfg(target_os = "macos")]
        {
            let _ = tray.set_title(Some(title));
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = title;
        }
        let _ = tray.set_tooltip(Some(tooltip));
    }
    Ok(())
}

#[tauri::command]
fn set_floating_pill_visible(app: AppHandle, visible: bool) -> Result<(), AppError> {
    if let Some(pill_window) = app.get_webview_window("floating-pill") {
        if visible {
            let _ = pill_window.show();
        } else {
            let _ = pill_window.hide();
        }
        return Ok(());
    }
    Ok(())
}

#[tauri::command]
fn check_running_meeting_apps() -> Result<Vec<tingxu_desktop::media::meeting_detector::DetectedMeetingApp>, AppError> {
    Ok(tingxu_desktop::media::meeting_detector::scan_running_meeting_apps())
}

#[tauri::command]
fn check_local_asr_model(model_id: Option<String>) -> Result<tingxu_desktop::asr::local_model::LocalModelStatus, AppError> {
    let id = model_id.unwrap_or_default();
    Ok(tingxu_desktop::asr::local_model::inspect_local_asr_model(&id))
}

#[tauri::command]
fn download_local_asr_model(model_id: Option<String>) -> Result<tingxu_desktop::asr::local_model::LocalModelStatus, AppError> {
    let id = model_id.unwrap_or_default();
    tingxu_desktop::asr::local_model::prepare_local_asr_model(&id).map_err(|e| AppError {
        code: "MODEL_PREPARE_ERROR".into(),
        message: e,
    })
}

#[tauri::command]
async fn probe_local_asr_endpoint(
    endpoint: String,
    model: Option<String>,
    api_key: Option<String>,
) -> Result<tingxu_desktop::asr::local_model::LocalAsrProbeResult, AppError> {
    Ok(tingxu_desktop::asr::local_model::probe_local_asr_http_endpoint(
        &endpoint,
        model.as_deref(),
        api_key.as_deref(),
    ).await)
}

#[tauri::command]
async fn proxy_post_local_asr(
    endpoint: String,
    wav_base64: String,
    model: Option<String>,
    api_key: Option<String>,
    prompt: Option<String>,
) -> Result<String, AppError> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&wav_base64)
        .map_err(|e| AppError {
            code: "BASE64_DECODE_ERROR".into(),
            message: e.to_string(),
        })?;

    tingxu_desktop::asr::local_model::proxy_post_asr_audio(
        &endpoint,
        bytes,
        model.as_deref(),
        api_key.as_deref(),
        prompt.as_deref(),
    ).await.map_err(|e| AppError {
        code: "LOCAL_ASR_REQUEST_ERROR".into(),
        message: e,
    })
}

// 本地 192 维声纹嵌入提取命令（音频流不出本机，严格遵守 Local-First 隐私铁律）
#[tauri::command]
fn speaker_embed(samples: Vec<f32>, sample_rate: u32) -> Result<Vec<f32>, AppError> {
    tingxu_desktop::speaker::extract_speaker_embedding(&samples, sample_rate).map_err(|e| AppError {
        code: format!("{:?}", e.code),
        message: e.message,
    })
}

// 启动 macOS 原生免驱动系统/Teams 会议音频内录
#[tauri::command]
fn start_system_audio_capture(
    app: AppHandle,
    state: tauri::State<'_, AudioCaptureState>,
) -> Result<(), AppError> {
    let mut capture = state.0.lock().map_err(|e| AppError {
        code: "LOCK_ERROR".into(),
        message: format!("获取音频锁失败: {e}"),
    })?;

    if capture.is_running() {
        return Ok(());
    }

    let app_handle = app.clone();
    capture
        .start(move |pcm_bytes: Vec<u8>| {
            use base64::engine::general_purpose::STANDARD;
            use base64::Engine;
            let b64 = STANDARD.encode(&pcm_bytes);
            let _ = app_handle.emit("tingxu://system-audio-chunk", b64);
        })
        .map_err(|e| AppError {
            code: format!("{:?}", e.code),
            message: e.message,
        })
}

// 停止 macOS 原生系统音频内录
#[tauri::command]
fn stop_system_audio_capture(
    state: tauri::State<'_, AudioCaptureState>,
) -> Result<(), AppError> {
    let mut capture = state.0.lock().map_err(|e| AppError {
        code: "LOCK_ERROR".into(),
        message: format!("获取音频锁失败: {e}"),
    })?;

    capture.stop().map_err(|e| AppError {
        code: format!("{:?}", e.code),
        message: e.message,
    })
}

// 查询当前系统音频内录是否正在运行
#[tauri::command]
fn is_system_audio_active(
    state: tauri::State<'_, AudioCaptureState>,
) -> Result<bool, AppError> {
    let capture = state.0.lock().map_err(|e| AppError {
        code: "LOCK_ERROR".into(),
        message: format!("获取音频锁失败: {e}"),
    })?;

    Ok(capture.is_running())
}

// 查询 macOS 屏幕与系统音频录制权限状态（不触发系统弹窗）
#[tauri::command]
fn check_system_audio_permission(
    state: tauri::State<'_, AudioCaptureState>,
) -> Result<tingxu_desktop::media::system_audio::SystemAudioPermissionStatus, AppError> {
    let capture = state.0.lock().map_err(|e| AppError {
        code: "LOCK_ERROR".into(),
        message: format!("获取音频锁失败: {e}"),
    })?;

    Ok(capture.check_permission())
}

// 一键跳转到 macOS「屏幕与系统音频录制」系统设置面板
#[tauri::command]
fn open_system_audio_permission_settings() -> Result<(), AppError> {
    tingxu_desktop::media::system_audio::open_system_audio_settings().map_err(|e| AppError {
        code: format!("{:?}", e.code),
        message: e.message,
    })
}

fn main() {
    let audio_state = AudioCaptureState(Arc::new(Mutex::new(SystemAudioCapture::new())));
    let exit_state = AppExitState::default();

    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        show_and_focus_main_window(app);
                        let _ = app.emit("tingxu://tray-quick-start-meeting", ());
                    }
                })
                .build(),
        )
        .manage(audio_state)
        .manage(exit_state)
        .manage(LocalMedia::default())
        .register_uri_scheme_protocol("tingxu-media", |ctx, request| {
            use tingxu_desktop::media::playback::read_range;
            let state = ctx.app_handle().state::<LocalMedia>();
            let result = state.store.lock().ok().and_then(|store| {
                let token = request.uri().path().strip_prefix('/')?;
                let path = store.as_ref()?.leased_path(token).ok()?;
                read_range(&path, request.headers().get("Range").and_then(|v|v.to_str().ok())).ok()
            });
            let mut response = tauri::http::Response::new(Vec::new());
            response.headers_mut().insert("Cache-Control", tauri::http::HeaderValue::from_static("no-store"));
            if let Some(part) = result {
                *response.status_mut() = tauri::http::StatusCode::PARTIAL_CONTENT;
                let headers=response.headers_mut();
                headers.insert("Content-Type",tauri::http::HeaderValue::from_static("audio/wav"));
                headers.insert("Accept-Ranges",tauri::http::HeaderValue::from_static("bytes"));
                if let Ok(value)=format!("bytes {}-{}/{}",part.start,part.end,part.total).parse(){headers.insert("Content-Range",value);}
                if let Ok(value)=part.bytes.len().to_string().parse(){headers.insert("Content-Length",value);}
                *response.body_mut()=part.bytes;
            } else { *response.status_mut()=tauri::http::StatusCode::RANGE_NOT_SATISFIABLE; }
            response
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let exiting = window
                    .app_handle()
                    .state::<AppExitState>()
                    .0
                    .load(Ordering::SeqCst);
                if window.label() == "main" && !should_allow_window_close(exiting) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                // 确保 Webview 与 Window 底层物理完全透明，杜绝 macOS 下圆角边缘露出直角白底
                let _ = main_window.set_background_color(Some(tauri::utils::config::Color(0, 0, 0, 0)));
            }

            // 为系统托盘绑定原生菜单：支持一键秒开录制、唤起悬浮胶囊、显示主窗口与真正退出
            if let Some(tray) = app.tray_by_id("main-tray") {
                #[cfg(target_os = "macos")]
                let quick_record_label = "🎙️ 快速开始会议录制 (⌥⌘R)";
                #[cfg(not(target_os = "macos"))]
                let quick_record_label = "🎙️ 快速开始会议录制 (Ctrl+Alt+R)";

                let quick_record = MenuItem::with_id(
                    app,
                    "tray_quick_record",
                    quick_record_label,
                    true,
                    None::<&str>,
                )?;
                let floating_pill = MenuItem::with_id(
                    app,
                    "tray_floating_pill",
                    "💊 打开桌面悬浮胶囊",
                    true,
                    None::<&str>,
                )?;
                let show_main = MenuItem::with_id(
                    app,
                    "tray_show_main",
                    "显示听序主窗口",
                    true,
                    None::<&str>,
                )?;
                let separator = PredefinedMenuItem::separator(app)?;
                let quit_item = MenuItem::with_id(
                    app,
                    "tray_quit",
                    "退出听序",
                    true,
                    Some("CmdOrCtrl+Q"),
                )?;

                let tray_menu = Menu::with_items(
                    app,
                    &[&quick_record, &floating_pill, &show_main, &separator, &quit_item],
                )?;

                let _ = tray.set_menu(Some(tray_menu));
                let _ = tray.set_show_menu_on_left_click(true);
                tray.on_menu_event(|app, event| match event.id.as_ref() {
                    "tray_quick_record" => {
                        show_and_focus_main_window(app);
                        let _ = app.emit("tingxu://tray-quick-start-meeting", ());
                    }
                    "tray_floating_pill" => {
                        if let Some(main_window) = app.get_webview_window("main") {
                            apply_floating_mode(&main_window, true);
                            let _ = main_window.show();
                        }
                        let _ = app.emit("tingxu://tray-open-floating-pill", ());
                    }
                    "tray_show_main" => {
                        if let Some(main_window) = app.get_webview_window("main") {
                            apply_floating_mode(&main_window, false);
                            let _ = main_window.show();
                            let _ = main_window.unminimize();
                            let _ = main_window.set_focus();
                        }
                        let _ = app.emit("tingxu://tray-show-workbench", ());
                    }
                    "tray_quit" => {
                        app.state::<AppExitState>().0.store(true, Ordering::SeqCst);
                        stop_audio_capture_gracefully(app);
                        app.exit(0);
                    }
                    _ => {}
                });
            }

            // 注册系统级全局快捷开录热键（macOS: ⌥⌘R / Windows: Ctrl+Alt+R），若被占用则优雅降级不阻断启动
            if let Err(err) = app.global_shortcut().register(GLOBAL_QUICK_RECORD_SHORTCUT) {
                eprintln!("[Tingxu] 注册系统级全局快捷键 {GLOBAL_QUICK_RECORD_SHORTCUT} 失败（可能被其他软件占用）: {err}");
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
                let mut last_detected_app_id: Option<String> = None;
                loop {
                    interval.tick().await;
                    let active_app = tingxu_desktop::media::meeting_detector::detect_active_meeting_app();
                    let current_id = active_app.as_ref().map(|a| a.app_id.clone());

                    // 状态产生变迁（0 -> 1 入会，或 1 -> 0 散会）时发射事件，杜绝高频无效唤醒
                    if current_id != last_detected_app_id {
                        last_detected_app_id = current_id;
                        let _ = handle.emit("meeting_app_detected", active_app);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_floating_mode,
            reveal_floating_pill,
            drag_window,
            minimize_window,
            toggle_maximize_window,
            close_window,
            quit_app,
            update_tray_recording_state,
            set_floating_pill_visible,
            check_running_meeting_apps,
            check_local_asr_model,
            download_local_asr_model,
            probe_local_asr_endpoint,
            proxy_post_local_asr,
            speaker_embed,
            start_system_audio_capture,
            stop_system_audio_capture,
            is_system_audio_active,
            check_system_audio_permission,
            open_system_audio_permission_settings,
            bind_recording_identity, bind_standalone_recording_identity, clear_recording_identity, start_local_recording,
            append_local_recording, checkpoint_local_recording, finish_local_recording,
            open_local_recording, release_local_recording, delete_local_recording,
            get_recording_storage_usage, prune_local_recordings
        ])
        .build(tauri::generate_context!())
        .expect("构建听序 Tauri 客户端异常");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            show_and_focus_main_window(app_handle);
        }
        tauri::RunEvent::ExitRequested { .. } => {
            app_handle
                .state::<AppExitState>()
                .0
                .store(true, Ordering::SeqCst);
            stop_audio_capture_gracefully(app_handle);
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::{format_tray_status, should_allow_window_close};

    #[test]
    fn test_window_close_hides_to_tray_unless_explicitly_exiting() {
        assert!(!should_allow_window_close(false));
        assert!(should_allow_window_close(true));
    }

    #[test]
    fn test_format_tray_status_reflects_recording_and_idle_states() {
        let (title, tooltip) = format_tray_status("RECORDING", Some("03:45"));
        assert_eq!(title, " ● 03:45");
        assert!(tooltip.contains("03:45"));

        let (paused_title, _) = format_tray_status("PAUSED", Some("03:45"));
        assert_eq!(paused_title, " ⏸ 03:45");

        let (idle_title, idle_tooltip) = format_tray_status("IDLE", None);
        assert!(idle_title.is_empty());
        assert_eq!(idle_tooltip, "听序 — AI 会议助手");
    }
}

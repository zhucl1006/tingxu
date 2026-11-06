// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager, LogicalSize, Emitter};
use std::sync::{Arc, Mutex};
use tingxu_desktop::media::system_audio::SystemAudioCapture;
use tingxu_desktop::media::recording_commands::*;

#[derive(Clone)]
struct AudioCaptureState(Arc<Mutex<SystemAudioCapture>>);

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

// 切换窗口模式：单窗口无缝形态变换（Single Window Morphing），保证音频流与内存状态永不断流
#[tauri::command]
fn toggle_floating_mode(app: AppHandle, to_floating: bool) -> Result<(), AppError> {
    if let Some(main_window) = app.get_webview_window("main") {
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
        return Ok(());
    }

    Err(AppError {
        code: "WINDOW_NOT_FOUND".into(),
        message: "未找到目标窗口实例".into(),
    })
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

// 原生窗口关闭或隐藏命令
#[tauri::command]
fn close_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.close();
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

fn main() {
    let audio_state = AudioCaptureState(Arc::new(Mutex::new(SystemAudioCapture::new())));

    tauri::Builder::default()
        .manage(audio_state)
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
        .on_tray_icon_event(|app, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                // 确保 Webview 与 Window 底层物理完全透明，杜绝 macOS 下圆角边缘露出直角白底
                let _ = main_window.set_background_color(Some(tauri::utils::config::Color(0, 0, 0, 0)));
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
            drag_window,
            minimize_window,
            close_window,
            set_floating_pill_visible,
            check_running_meeting_apps,
            check_local_asr_model,
            speaker_embed,
            start_system_audio_capture,
            stop_system_audio_capture,
            is_system_audio_active,
            bind_recording_identity, clear_recording_identity, start_local_recording,
            append_local_recording, checkpoint_local_recording, finish_local_recording,
            open_local_recording, release_local_recording, delete_local_recording,
            get_recording_storage_usage, prune_local_recordings
        ])
        .run(tauri::generate_context!())
        .expect("运行听序 Tauri 客户端异常");
}

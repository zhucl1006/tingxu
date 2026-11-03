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
        .invoke_handler(tauri::generate_handler![
            toggle_floating_mode,
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

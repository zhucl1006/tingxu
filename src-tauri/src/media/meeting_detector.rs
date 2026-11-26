use serde::{Deserialize, Serialize};
use sysinfo::{ProcessRefreshKind, RefreshKind, System};

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DetectedMeetingApp {
    pub app_name: String,
    pub app_id: String,
    pub process_name: String,
}

/// 支持的会议应用预设匹配规则表
const MEETING_APP_RULES: &[(&str, &str, &[&str])] = &[
    (
        "Microsoft Teams",
        "teams",
        &["teams", "ms-teams", "msteams", "microsoft teams"],
    ),
    (
        "腾讯会议",
        "tencent_meeting",
        &["tencentmeeting", "wemeetapp", "wemeet"],
    ),
    (
        "Zoom",
        "zoom",
        &["zoom.us", "zoom"],
    ),
    (
        "飞书",
        "feishu",
        &["feishu", "lark"],
    ),
    (
        "钉钉",
        "dingtalk",
        &["dingtalk"],
    ),
    (
        "企业微信",
        "wecom",
        &["wxwork", "wecom", "企业微信"],
    ),
    (
        "Webex",
        "webex",
        &["webex", "ciscowebex"],
    ),
    (
        "FaceTime",
        "facetime",
        &["facetime"],
    ),
    (
        "Google Meet",
        "google_meet",
        &["google meet"],
    ),
    (
        "微信通话",
        "wechat",
        &["wechat"],
    ),
];

pub fn match_meeting_app_name(raw_name: &str) -> Option<(&'static str, &'static str)> {
    let lower = raw_name.trim().to_lowercase();
    for (display_name, id, aliases) in MEETING_APP_RULES {
        for alias in *aliases {
            if lower == *alias
                || lower.starts_with(&format!("{alias}."))
                || lower.starts_with(&format!("{alias}-"))
                || lower.starts_with(&format!("{alias}_"))
                || lower.starts_with(&format!("{alias} "))
                || lower.contains(&format!("/{alias}"))
                || lower.contains(&format!("\\{alias}"))
            {
                return Some((*display_name, *id));
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyDataSize(
        in_object_id: u32,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const std::ffi::c_void,
        out_data_size: *mut u32,
    ) -> i32;

    fn AudioObjectGetPropertyData(
        in_object_id: u32,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const std::ffi::c_void,
        io_data_size: *mut u32,
        out_data: *mut std::ffi::c_void,
    ) -> i32;
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct AudioObjectPropertyAddress {
    m_selector: u32,
    m_scope: u32,
    m_element: u32,
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct AudioBufferHeader {
    m_number_channels: u32,
    m_data_byte_size: u32,
    m_data: *mut std::ffi::c_void,
}

#[cfg(target_os = "macos")]
const K_AUDIO_OBJECT_SYSTEM_OBJECT: u32 = 1;
#[cfg(target_os = "macos")]
const K_AUDIO_HARDWARE_PROPERTY_DEVICES: u32 = 1684370979; // 'dev#'
#[cfg(target_os = "macos")]
const K_AUDIO_HARDWARE_PROPERTY_DEFAULT_INPUT_DEVICE: u32 = 1682533920; // 'dIn '
#[cfg(target_os = "macos")]
const K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL: u32 = 1735159650; // 'glob'
#[cfg(target_os = "macos")]
const K_AUDIO_DEVICE_PROPERTY_SCOPE_INPUT: u32 = 1768845428; // 'inpt'
#[cfg(target_os = "macos")]
const K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN: u32 = 0;
#[cfg(target_os = "macos")]
const K_AUDIO_DEVICE_PROPERTY_DEVICE_IS_RUNNING_SOMEWHERE: u32 = 1735356005; // 'gone'
#[cfg(target_os = "macos")]
const K_AUDIO_DEVICE_PROPERTY_STREAM_CONFIGURATION: u32 = 1936482681; // 'slay'

#[cfg(target_os = "macos")]
unsafe fn is_audio_device_running(device_id: u32) -> bool {
    let mut is_running: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let run_addr = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_DEVICE_IS_RUNNING_SOMEWHERE,
        m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };
    let status = AudioObjectGetPropertyData(
        device_id,
        &run_addr,
        0,
        std::ptr::null(),
        &mut size,
        &mut is_running as *mut u32 as *mut std::ffi::c_void,
    );
    status == 0 && is_running != 0
}

#[cfg(target_os = "macos")]
unsafe fn device_has_input_channels(device_id: u32) -> bool {
    let addr = AudioObjectPropertyAddress {
        m_selector: K_AUDIO_DEVICE_PROPERTY_STREAM_CONFIGURATION,
        m_scope: K_AUDIO_DEVICE_PROPERTY_SCOPE_INPUT,
        m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };
    let mut data_size: u32 = 0;
    let status = AudioObjectGetPropertyDataSize(
        device_id,
        &addr,
        0,
        std::ptr::null(),
        &mut data_size,
    );
    if status != 0 || data_size < std::mem::size_of::<u32>() as u32 {
        return false;
    }

    let mut raw = vec![0u8; data_size as usize];
    let status = AudioObjectGetPropertyData(
        device_id,
        &addr,
        0,
        std::ptr::null(),
        &mut data_size,
        raw.as_mut_ptr() as *mut std::ffi::c_void,
    );
    if status != 0 || raw.len() < std::mem::size_of::<u32>() {
        return false;
    }

    let num_buffers = u32::from_ne_bytes([raw[0], raw[1], raw[2], raw[3]]) as usize;
    if num_buffers == 0 {
        return false;
    }
    // AudioBufferList: u32 mNumberBuffers + padding(4 on 64-bit) + [AudioBuffer]
    let header_offset = std::mem::align_of::<AudioBufferHeader>();
    let buf_size = std::mem::size_of::<AudioBufferHeader>();
    for i in 0..num_buffers {
        let offset = header_offset + i * buf_size;
        if offset + std::mem::size_of::<u32>() <= raw.len() {
            let channels = u32::from_ne_bytes([
                raw[offset],
                raw[offset + 1],
                raw[offset + 2],
                raw[offset + 3],
            ]);
            if channels > 0 {
                return true;
            }
        }
    }
    false
}

/// 检测 macOS 任意麦克风输入设备（含默认麦、AirPods、外接 USB 麦）当前是否处于活跃采集状态
#[cfg(target_os = "macos")]
pub fn is_system_microphone_active() -> bool {
    unsafe {
        // 1. 快速路径：先查系统默认输入设备
        let mut default_input_device: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        let default_addr = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_INPUT_DEVICE,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };
        let status = AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &default_addr,
            0,
            std::ptr::null(),
            &mut size,
            &mut default_input_device as *mut u32 as *mut std::ffi::c_void,
        );
        if status == 0 && default_input_device != 0 && is_audio_device_running(default_input_device) {
            return true;
        }

        // 2. 全量兜底：扫描所有具备输入声道的音频设备，防止会议软件选用非默认耳机麦时漏检
        let devices_addr = AudioObjectPropertyAddress {
            m_selector: K_AUDIO_HARDWARE_PROPERTY_DEVICES,
            m_scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            m_element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
        };
        let mut devices_size: u32 = 0;
        let status = AudioObjectGetPropertyDataSize(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &devices_addr,
            0,
            std::ptr::null(),
            &mut devices_size,
        );
        if status != 0 || devices_size == 0 {
            return false;
        }

        let count = devices_size as usize / std::mem::size_of::<u32>();
        let mut device_ids = vec![0u32; count];
        let status = AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &devices_addr,
            0,
            std::ptr::null(),
            &mut devices_size,
            device_ids.as_mut_ptr() as *mut std::ffi::c_void,
        );
        if status != 0 {
            return false;
        }

        device_ids.into_iter().any(|dev_id| {
            dev_id != 0
                && dev_id != default_input_device
                && device_has_input_channels(dev_id)
                && is_audio_device_running(dev_id)
        })
    }
}

#[cfg(not(target_os = "macos"))]
pub fn is_system_microphone_active() -> bool {
    false
}

/// 检测当前活跃且正在占用麦克风开会的会议软件 (Plan 1: CoreAudio 边沿触发 + 进程过滤)
pub fn detect_active_meeting_app() -> Option<DetectedMeetingApp> {
    // 1. 如果麦克风未激活，绝不虚假报警（即使后台常驻 Teams/钉钉）
    if !is_system_microphone_active() {
        return None;
    }

    // 2. 麦克风已激活，获取当前运行的会议应用列表
    let running = scan_running_meeting_apps();
    running.into_iter().next()
}

pub fn scan_running_meeting_apps() -> Vec<DetectedMeetingApp> {
    let mut system = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::new()),
    );
    system.refresh_processes();

    let mut detected: Vec<DetectedMeetingApp> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for (_, process) in system.processes() {
        let process_name = process.name();
        if let Some((app_name, app_id)) = match_meeting_app_name(process_name) {
            if seen_ids.insert(app_id.to_string()) {
                detected.push(DetectedMeetingApp {
                    app_name: app_name.to_string(),
                    app_id: app_id.to_string(),
                    process_name: process_name.to_string(),
                });
            }
        }
    }

    detected
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_match_meeting_app_name() {
        assert_eq!(
            match_meeting_app_name("Teams"),
            Some(("Microsoft Teams", "teams"))
        );
        assert_eq!(
            match_meeting_app_name("Microsoft Teams"),
            Some(("Microsoft Teams", "teams"))
        );
        assert_eq!(
            match_meeting_app_name("Microsoft Teams WebView Helper"),
            Some(("Microsoft Teams", "teams"))
        );
        assert_eq!(
            match_meeting_app_name("ms-teams.exe"),
            Some(("Microsoft Teams", "teams"))
        );
        assert_eq!(
            match_meeting_app_name("msteams"),
            Some(("Microsoft Teams", "teams"))
        );
        assert_eq!(
            match_meeting_app_name("TencentMeeting"),
            Some(("腾讯会议", "tencent_meeting"))
        );
        assert_eq!(
            match_meeting_app_name("wemeetapp.exe"),
            Some(("腾讯会议", "tencent_meeting"))
        );
        assert_eq!(
            match_meeting_app_name("zoom.us"),
            Some(("Zoom", "zoom"))
        );
        assert_eq!(
            match_meeting_app_name("Feishu"),
            Some(("飞书", "feishu"))
        );
        assert_eq!(
            match_meeting_app_name("DingTalk"),
            Some(("钉钉", "dingtalk"))
        );
        assert_eq!(
            match_meeting_app_name("WXWork"),
            Some(("企业微信", "wecom"))
        );
        assert_eq!(
            match_meeting_app_name("Webex"),
            Some(("Webex", "webex"))
        );
        assert_eq!(
            match_meeting_app_name("FaceTime"),
            Some(("FaceTime", "facetime"))
        );
        assert_eq!(
            match_meeting_app_name("WeChat"),
            Some(("微信通话", "wechat"))
        );

        // 负例
        assert_eq!(match_meeting_app_name("chrome"), None);
        assert_eq!(match_meeting_app_name("slack"), None);
        assert_eq!(match_meeting_app_name("code"), None);
    }

    #[test]
    fn test_scan_running_meeting_apps_safety() {
        // 验证调用 scan 逻辑不崩溃且输出无重复 ID
        let detected = scan_running_meeting_apps();
        let mut ids = std::collections::HashSet::new();
        for app in detected {
            assert!(ids.insert(app.app_id));
        }
    }

    #[test]
    fn test_system_microphone_check_safety() {
        // 验证 CoreAudio HAL 系统默认麦克风活跃性探测不崩溃
        let _active = is_system_microphone_active();
    }

    #[test]
    fn test_detect_active_meeting_app_safety() {
        // 验证边沿复合探测函数运行安全
        let _detected = detect_active_meeting_app();
    }
}

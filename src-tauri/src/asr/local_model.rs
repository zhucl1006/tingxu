use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelStatus {
    pub model_id: String,
    pub name: String,
    pub exists: bool,
    pub size_bytes: u64,
    pub path: Option<String>,
    pub is_ready: bool,
    pub description: String,
}

pub const SENSEVOICE_MODEL_ID: &str = "sensevoice-small-int8";
pub const SENSEVOICE_MODEL_NAME: &str = "SenseVoice-Small INT8";

/// 获取听序本地模型存储沙箱目录 (~/.tingxu/models/)
pub fn get_local_models_dir() -> PathBuf {
    let base_dir = dirs_base().unwrap_or_else(|| PathBuf::from("./data/models"));
    base_dir.join(".tingxu").join("models")
}

fn dirs_base() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

/// 检查本地离线 ASR 模型状态
pub fn inspect_local_asr_model(model_id: &str) -> LocalModelStatus {
    let target_id = if model_id.is_empty() {
        SENSEVOICE_MODEL_ID
    } else {
        model_id
    };

    let models_dir = get_local_models_dir();
    let model_folder = models_dir.join(target_id);
    let onnx_file = model_folder.join("model.onnx");

    if onnx_file.exists() {
        let metadata = fs::metadata(&onnx_file).ok();
        let size = metadata.map(|m| m.len()).unwrap_or(0);
        let is_ready = size > 1024 * 1024; // 大于 1MB 视为就绪

        LocalModelStatus {
            model_id: target_id.to_string(),
            name: SENSEVOICE_MODEL_NAME.to_string(),
            exists: true,
            size_bytes: size,
            path: Some(onnx_file.to_string_lossy().to_string()),
            is_ready,
            description: "阿里通义实验室开源多语言语音大模型，纯本地推理免网络".into(),
        }
    } else {
        LocalModelStatus {
            model_id: target_id.to_string(),
            name: SENSEVOICE_MODEL_NAME.to_string(),
            exists: false,
            size_bytes: 0,
            path: None,
            is_ready: false,
            description: "未检测到本地模型文件，可在连接网络时按需下载或使用本地独立端点".into(),
        }
    }
}

/// 确保模型目录就绪
pub fn ensure_models_dir() -> std::io::Result<PathBuf> {
    let dir = get_local_models_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inspect_nonexistent_model() {
        let status = inspect_local_asr_model("nonexistent-test-model-xyz");
        assert_eq!(status.exists, false);
        assert_eq!(status.is_ready, false);
        assert_eq!(status.size_bytes, 0);
        assert!(status.path.is_none());
    }

    #[test]
    fn test_get_local_models_dir_structure() {
        let path = get_local_models_dir();
        assert!(path.to_string_lossy().contains(".tingxu"));
        assert!(path.to_string_lossy().contains("models"));
    }
}

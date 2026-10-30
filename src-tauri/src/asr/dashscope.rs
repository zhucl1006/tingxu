use crate::error::TingxuError;
use crate::media::device::TrackType;
use serde_json::Value;

pub struct DashScopeParser;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedAsrResult {
    pub text: String,
    pub track: TrackType,
    pub is_final: bool,
    pub duration_ms: u64,
}

impl DashScopeParser {
    pub fn parse_event(raw_json: &str, track: TrackType) -> Result<ParsedAsrResult, TingxuError> {
        let v: Value = serde_json::from_str(raw_json)
            .map_err(|e| TingxuError::resample_failed(format!("DashScope JSON 解析失败: {}", e)))?;

        let event = v["header"]["event"].as_str().unwrap_or("");
        let sentence_text = v["payload"]["output"]["sentence"]["text"]
            .as_str()
            .unwrap_or("");
        let duration_ms = v["payload"]["usage"]["duration"].as_u64().unwrap_or(0);
        let is_final = event == "result-generated" || event == "task-finished";

        Ok(ParsedAsrResult {
            text: sentence_text.to_string(),
            track,
            is_final,
            duration_ms,
        })
    }
}

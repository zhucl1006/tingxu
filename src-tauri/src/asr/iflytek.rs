use crate::error::TingxuError;
use crate::media::device::TrackType;
use serde_json::Value;

pub struct IflytekParser;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IflytekParsedResult {
    pub text: String,
    pub track: TrackType,
    pub is_final: bool,
}

impl IflytekParser {
    pub fn parse_event(raw_json: &str, track: TrackType) -> Result<IflytekParsedResult, TingxuError> {
        let v: Value = serde_json::from_str(raw_json)
            .map_err(|e| TingxuError::resample_failed(format!("iFlytek JSON 解析失败: {}", e)))?;

        let code = v["code"].as_i64().unwrap_or(-1);
        if code != 0 {
            let msg = v["message"].as_str().unwrap_or("未知错误");
            return Err(TingxuError::resample_failed(format!("iFlytek 错误码 {}: {}", code, msg)));
        }

        let is_final = v["data"]["result"]["ls"].as_bool().unwrap_or(false);
        let mut full_text = String::new();

        if let Some(ws_list) = v["data"]["result"]["ws"].as_array() {
            for ws_item in ws_list {
                if let Some(cw_list) = ws_item["cw"].as_array() {
                    for cw_item in cw_list {
                        if let Some(word) = cw_item["w"].as_str() {
                            full_text.push_str(word);
                        }
                    }
                }
            }
        }

        Ok(IflytekParsedResult {
            text: full_text,
            track,
            is_final,
        })
    }
}

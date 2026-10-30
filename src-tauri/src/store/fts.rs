use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchResult {
    pub segment_id: String,
    pub meeting_id: String,
    pub title: String,
    pub start_time: i64,
    pub highlighted_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AudioSyncInfo {
    pub slice_index: u64,
    pub offset_in_slice_bytes: u64,
}

use crate::error::TingxuError;
use crate::media::device::TrackType;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsrFrame {
    pub track: TrackType,
    pub timestamp_ms: u64,
    pub payload: Vec<u8>,
}

impl AsrFrame {
    pub fn new(track: TrackType, timestamp_ms: u64, payload: Vec<u8>) -> Self {
        Self {
            track,
            timestamp_ms,
            payload,
        }
    }

    pub fn speaker_label(&self) -> &'static str {
        match self.track {
            TrackType::Mic => "我方 (麦克风)",
            TrackType::System => "远端 (系统扬声器)",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TranscriptEvent {
    pub id: String,
    pub track: TrackType,
    pub speaker: String,
    pub text: String,
    pub is_final: bool,
    pub timestamp: String,
}

#[async_trait]
pub trait AsrEngine: Send + Sync {
    async fn send_frame(&mut self, frame: AsrFrame) -> Result<(), TingxuError>;
    async fn close(&mut self) -> Result<(), TingxuError>;
}

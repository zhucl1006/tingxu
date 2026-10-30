use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub enum ErrorCode {
    DeviceNotFound,
    DevicePermissionDenied,
    RingBufferOverflow,
    ResampleFailed,
    DiskIoError,
    SliceCorrupted,
    WindowNotFound,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct TingxuError {
    pub code: ErrorCode,
    pub message: String,
}

impl TingxuError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn device_not_found(msg: impl Into<String>) -> Self {
        Self::new(ErrorCode::DeviceNotFound, msg)
    }

    pub fn permission_denied(msg: impl Into<String>) -> Self {
        Self::new(ErrorCode::DevicePermissionDenied, msg)
    }

    pub fn buffer_overflow(msg: impl Into<String>) -> Self {
        Self::new(ErrorCode::RingBufferOverflow, msg)
    }

    pub fn resample_failed(msg: impl Into<String>) -> Self {
        Self::new(ErrorCode::ResampleFailed, msg)
    }

    pub fn disk_io(msg: impl ToString) -> Self {
        Self::new(ErrorCode::DiskIoError, msg.to_string())
    }

    pub fn slice_corrupted(msg: impl Into<String>) -> Self {
        Self::new(ErrorCode::SliceCorrupted, msg)
    }
}

impl fmt::Display for TingxuError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{:?}] {}", self.code, self.message)
    }
}

impl std::error::Error for TingxuError {}

impl From<std::io::Error> for TingxuError {
    fn from(err: std::io::Error) -> Self {
        Self::disk_io(err.to_string())
    }
}

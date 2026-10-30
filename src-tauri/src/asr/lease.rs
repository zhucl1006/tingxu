use crate::asr::engine::AsrFrame;
use crate::error::{ErrorCode, TingxuError};
use std::time::{Duration, Instant};

pub struct AsrLeaseManager {
    lease_duration: Duration,
    lease_start: Instant,
    is_force_expired: bool,
    used_seconds: u64,
}

impl AsrLeaseManager {
    pub fn new(valid_duration_seconds: u64) -> Self {
        Self {
            lease_duration: Duration::from_secs(valid_duration_seconds),
            lease_start: Instant::now(),
            is_force_expired: false,
            used_seconds: 0,
        }
    }

    pub fn is_lease_valid(&self) -> bool {
        if self.is_force_expired {
            return false;
        }
        self.lease_start.elapsed() < self.lease_duration
    }

    pub fn record_consumption(&mut self, seconds: u64) {
        self.used_seconds += seconds;
    }

    pub fn used_seconds(&self) -> u64 {
        self.used_seconds
    }

    pub fn expire_now(&mut self) {
        self.is_force_expired = true;
    }

    pub fn renew_lease(&mut self, additional_seconds: u64) {
        self.is_force_expired = false;
        self.lease_start = Instant::now();
        self.lease_duration = Duration::from_secs(additional_seconds);
    }

    pub fn check_can_push_frame(&self, _frame: &AsrFrame) -> Result<(), TingxuError> {
        if !self.is_lease_valid() {
            return Err(TingxuError::new(
                ErrorCode::DevicePermissionDenied,
                "ASR 租约已过期或额度耗尽，已停止向云端推流（本地物理录音不受影响）",
            ));
        }
        Ok(())
    }

    /// 指数退避重连时延计算：1s, 2s, 4s, 8s, 16s (max 16s)
    pub fn get_reconnect_delay_ms(&self, retry_count: u32) -> u64 {
        let base = 1000u64;
        let count = retry_count.max(1);
        let factor = 1u64 << (count - 1).min(4);
        base * factor
    }
}

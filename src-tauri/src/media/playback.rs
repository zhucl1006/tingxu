use crate::error::TingxuError;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};
pub struct MediaRange {
    pub start: u64,
    pub end: u64,
    pub total: u64,
    pub bytes: Vec<u8>,
}
/// 每次读取有界；即使客户端请求整场录音，也不将整个 WAV 载入内存。
pub fn read_range(path: &Path, range: Option<&str>) -> Result<MediaRange, TingxuError> {
    let mut file = File::open(path)?;
    let total = file.metadata()?.len();
    if total == 0 {
        return Err(TingxuError::slice_corrupted("空录音"));
    }
    let invalid = || TingxuError::slice_corrupted("无效的媒体范围");
    let (start, requested_end) = if let Some(r) = range {
        let (a, b) = r
            .strip_prefix("bytes=")
            .ok_or_else(invalid)?
            .split_once('-')
            .ok_or_else(invalid)?;
        if a.is_empty() {
            let suffix = b.parse::<u64>().map_err(|_| invalid())?;
            if suffix == 0 {
                return Err(invalid());
            }
            (total.saturating_sub(suffix), total - 1)
        } else {
            (
                a.parse::<u64>().map_err(|_| invalid())?,
                if b.is_empty() {
                    total - 1
                } else {
                    b.parse::<u64>().map_err(|_| invalid())?
                },
            )
        }
    } else {
        (0, total - 1)
    };
    if start >= total || requested_end < start {
        return Err(invalid());
    }
    // 每次读取有界：即使客户端请求整场录音，也不将整个 WAV 载入内存（不超过 256KB 契约边界）
    let end = requested_end
        .min(total - 1)
        .min(start.saturating_add(262143));
    file.seek(SeekFrom::Start(start))?;
    let mut bytes = vec![0; (end - start + 1) as usize];
    file.read_exact(&mut bytes)?;
    Ok(MediaRange {
        start,
        end,
        total,
        bytes,
    })
}

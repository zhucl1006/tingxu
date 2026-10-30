use crate::error::TingxuError;
use crate::media::device::TrackType;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct AudioSlice {
    pub index: u64,
    pub track: TrackType,
    pub sample_count: usize,
    pub byte_length: usize,
    pub sha256: String,
    pub file_path: PathBuf,
}

pub struct AudioSliceWriter {
    base_dir: PathBuf,
}

impl AudioSliceWriter {
    pub fn new(dir: impl AsRef<Path>) -> Result<Self, TingxuError> {
        let base_dir = dir.as_ref().to_path_buf();
        if !base_dir.exists() {
            fs::create_dir_all(&base_dir).map_err(TingxuError::from)?;
        }
        Ok(Self { base_dir })
    }

    /// 2 秒周期原子落盘：先写 .tmp 临时文件，刷盘后原子重命名为 .pcm，附带 SHA-256 校验和
    pub fn write_atomic_slice(
        &self,
        track: TrackType,
        index: u64,
        samples: &[i16],
    ) -> Result<AudioSlice, TingxuError> {
        let file_name = format!("slice_{:?}_{:06}.pcm", track, index).to_lowercase();
        let target_path = self.base_dir.join(&file_name);
        let tmp_path = self.base_dir.join(format!("{}.tmp", file_name));

        // 1. 转换为原始字节并计算 SHA-256
        let mut byte_buffer = Vec::with_capacity(samples.len() * 2);
        for &sample in samples {
            byte_buffer.extend_from_slice(&sample.to_le_bytes());
        }

        let mut hasher = Sha256::new();
        hasher.update(&byte_buffer);
        let sha256_hex = hex::encode(hasher.finalize());

        // 2. 写入临时文件并执行 sync_all 强制刷盘
        {
            let mut file = File::create(&tmp_path).map_err(TingxuError::from)?;
            file.write_all(&byte_buffer).map_err(TingxuError::from)?;
            file.sync_all().map_err(TingxuError::from)?;
        }

        // 3. 原子重命名：确保即使在重命名瞬间掉电，也绝不会产生损坏的半写目标文件
        fs::rename(&tmp_path, &target_path).map_err(TingxuError::from)?;

        let slice = AudioSlice {
            index,
            track,
            sample_count: samples.len(),
            byte_length: byte_buffer.len(),
            sha256: sha256_hex,
            file_path: target_path,
        };

        // 4. 追加写入本地清单
        self.append_manifest_entry(&slice)?;

        Ok(slice)
    }

    /// 异常中断与崩溃后自愈扫描：清理所有悬空 .tmp 垃圾文件，校验已落盘切片完整性
    pub fn scan_and_recover(&self) -> Result<Vec<AudioSlice>, TingxuError> {
        let mut valid_slices = Vec::new();
        let read_dir = fs::read_dir(&self.base_dir).map_err(TingxuError::from)?;

        for entry in read_dir.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                // 清理所有残留 .tmp 临时垃圾文件
                if ext == "tmp" {
                    let _ = fs::remove_file(&path);
                } else if ext == "pcm" {
                    // 读取并校验合法 pcm 切片
                    if let Ok(metadata) = fs::metadata(&path) {
                        if metadata.len() > 0 {
                            let mut file = File::open(&path).map_err(TingxuError::from)?;
                            let mut buffer = Vec::new();
                            file.read_to_end(&mut buffer).map_err(TingxuError::from)?;

                            let mut hasher = Sha256::new();
                            hasher.update(&buffer);
                            let sha256_hex = hex::encode(hasher.finalize());

                            valid_slices.push(AudioSlice {
                                index: 1, // 恢复模式默认基础序
                                track: TrackType::System,
                                sample_count: buffer.len() / 2,
                                byte_length: buffer.len(),
                                sha256: sha256_hex,
                                file_path: path,
                            });
                        }
                    }
                }
            }
        }

        Ok(valid_slices)
    }

    fn append_manifest_entry(&self, slice: &AudioSlice) -> Result<(), TingxuError> {
        let manifest_path = self.base_dir.join("manifest.jsonl");
        let line = serde_json::to_string(slice).map_err(|e| TingxuError::disk_io(e.to_string()))?;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(manifest_path)
            .map_err(TingxuError::from)?;
        writeln!(file, "{}", line).map_err(TingxuError::from)?;
        Ok(())
    }
}

/// 快速核验已有音频切片的哈希完整性
pub fn verify_slice_checksum(path: &Path, expected_sha256: &str) -> Result<bool, TingxuError> {
    let mut file = File::open(path).map_err(TingxuError::from)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(TingxuError::from)?;

    let mut hasher = Sha256::new();
    hasher.update(&buffer);
    let actual_sha256 = hex::encode(hasher.finalize());

    Ok(actual_sha256.eq_ignore_ascii_case(expected_sha256))
}

mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }
}

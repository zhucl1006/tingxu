use crate::error::TingxuError;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[cfg(target_os = "macos")]
use screencapturekit::cm::CMSampleBufferDataBufferExt;
#[cfg(target_os = "macos")]
use screencapturekit::prelude::*;

/// 浮点 PCM 到 16-bit 线性 PCM 的标准化转换器
/// CoreMedia ScreenCaptureKit 音频常以 32-bit Float 交付，ASR 引擎需要标准 16-bit 小端 PCM
pub fn normalize_audio_to_pcm16(raw: &[u8]) -> Vec<u8> {
    if raw.is_empty() {
        return Vec::new();
    }
    if raw.len() % 4 == 0 {
        let floats: Vec<f32> = raw
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();

        // 采样探测：Float32 PCM 样本值域几乎都在 [-1.5, 1.5]
        let looks_like_float = floats.iter().take(20).all(|&s| s.abs() <= 2.0);
        if looks_like_float {
            let mut out = Vec::with_capacity(floats.len() * 2);
            for s in floats {
                let clamped = s.max(-1.0).min(1.0);
                let pcm16 = if clamped < 0.0 {
                    (clamped * 32768.0) as i16
                } else {
                    (clamped * 32767.0) as i16
                };
                out.extend_from_slice(&pcm16.to_le_bytes());
            }
            return out;
        }
    }
    raw.to_vec()
}

pub struct SystemAudioCapture {
    running: Arc<AtomicBool>,
    #[cfg(target_os = "macos")]
    stream: Option<SCStream>,
}

#[cfg(target_os = "macos")]
struct AudioStreamHandler<F: Fn(Vec<u8>) + Send + Sync + 'static> {
    on_audio: Arc<F>,
    running: Arc<AtomicBool>,
}

#[cfg(target_os = "macos")]
impl<F: Fn(Vec<u8>) + Send + Sync + 'static> SCStreamOutputTrait for AudioStreamHandler<F> {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, output_type: SCStreamOutputType) {
        if !self.running.load(Ordering::Relaxed) {
            return;
        }
        if output_type == SCStreamOutputType::Audio {
            if let Some(block_buffer) = sample.data_buffer_local() {
                let len = block_buffer.data_length();
                if len > 0 {
                    if let Some(raw_bytes) = block_buffer.copy_data_bytes(0, len) {
                        let pcm16 = normalize_audio_to_pcm16(&raw_bytes);
                        if !pcm16.is_empty() {
                            (self.on_audio)(pcm16);
                        }
                    }
                }
            }
        }
    }
}

impl Default for SystemAudioCapture {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemAudioCapture {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            #[cfg(target_os = "macos")]
            stream: None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// 启动 macOS 原生免驱系统音频内录
    /// 无论用户是否佩戴 AirPods，均直接从系统音频合成器提取 Teams 对方纯数字原声
    pub fn start<F>(&mut self, on_audio_chunk: F) -> Result<(), TingxuError>
    where
        F: Fn(Vec<u8>) + Send + Sync + 'static,
    {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        #[cfg(target_os = "macos")]
        {
            let content = SCShareableContent::get().map_err(|e| {
                TingxuError::permission_denied(format!(
                    "未获得屏幕与系统音频录制权限，或获取内容源异常: {e}"
                ))
            })?;

            let display = content.displays().into_iter().next().ok_or_else(|| {
                TingxuError::device_not_found("未检测到系统活跃显示与音频输出端点")
            })?;

            let filter = SCContentFilter::create()
                .with_display(&display)
                .with_excluding_windows(&[])
                .build()
                .map_err(|e| TingxuError::device_not_found(format!("创建音频捕获过滤器失败: {e}")))?;

            let config = SCStreamConfiguration::new()
                .with_width(64)
                .with_height(64)
                .with_captures_audio(true)
                .with_sample_rate(16000)
                .with_channel_count(1);

            let mut stream = SCStream::new(&filter, &config).map_err(|e| {
                TingxuError::permission_denied(format!("初始化 ScreenCaptureKit 音频流失败: {e}"))
            })?;

            let handler = AudioStreamHandler {
                on_audio: Arc::new(on_audio_chunk),
                running: self.running.clone(),
            };

            stream
                .add_output_handler(handler, SCStreamOutputType::Audio)
                .map_err(|e| TingxuError::permission_denied(format!("挂载音频输出处理器失败: {e}")))?;

            stream.start_capture().map_err(|e| {
                TingxuError::permission_denied(format!(
                    "启动系统音频内录捕获失败（请确认已在 macOS 设置中授权听序录制权限）: {e}"
                ))
            })?;

            self.stream = Some(stream);
            self.running.store(true, Ordering::SeqCst);
            Ok(())
        }

        #[cfg(not(target_os = "macos"))]
        {
            // Windows / Linux 环境占位兼容
            self.running.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    pub fn stop(&mut self) -> Result<(), TingxuError> {
        self.running.store(false, Ordering::SeqCst);
        #[cfg(target_os = "macos")]
        {
            if let Some(stream) = self.stream.take() {
                let _ = stream.stop_capture();
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_audio_to_pcm16_float() {
        // 构造一个 Float32 样本数组: [0.0, 1.0, -1.0, 0.5]
        let samples: [f32; 4] = [0.0, 1.0, -1.0, 0.5];
        let mut raw_bytes = Vec::new();
        for s in samples {
            raw_bytes.extend_from_slice(&s.to_le_bytes());
        }

        let pcm16 = normalize_audio_to_pcm16(&raw_bytes);
        assert_eq!(pcm16.len(), 8); // 4 samples * 2 bytes

        let s0 = i16::from_le_bytes([pcm16[0], pcm16[1]]);
        let s1 = i16::from_le_bytes([pcm16[2], pcm16[3]]);
        let s2 = i16::from_le_bytes([pcm16[4], pcm16[5]]);
        let s3 = i16::from_le_bytes([pcm16[6], pcm16[7]]);

        assert_eq!(s0, 0);
        assert_eq!(s1, 32767);
        assert_eq!(s2, -32768);
        assert_eq!(s3, 16383);
    }

    #[test]
    fn test_system_audio_capture_lifecycle() {
        let capture = SystemAudioCapture::new();
        assert!(!capture.is_running());
    }
}

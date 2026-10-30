use crate::error::TingxuError;

/// 高性能线性重采样与声道下混器
/// 支持从任意采样率（如 48kHz, 44.1kHz）与声道数（单声道/立体声）标准化为 16kHz 16-bit 单声道线性 PCM
pub struct PcmResampler {
    input_sample_rate: u32,
    output_sample_rate: u32,
    channels: u16,
}

impl PcmResampler {
    pub fn new(input_sample_rate: u32, output_sample_rate: u32, channels: u16) -> Self {
        Self {
            input_sample_rate,
            output_sample_rate,
            channels: channels.max(1),
        }
    }

    /// 将输入的 f32 浮点交错样本转换并重采样为 16kHz 16-bit 单声道 i16 样本
    pub fn process_f32_to_i16(&mut self, input: &[f32]) -> Result<Vec<i16>, TingxuError> {
        if input.is_empty() {
            return Ok(Vec::new());
        }

        let num_channels = self.channels as usize;
        let total_frames = input.len() / num_channels;
        if total_frames == 0 {
            return Err(TingxuError::resample_failed("输入样本数据不足一帧"));
        }

        // 1. 声道下混：多声道均值下混为单声道
        let mut mono_samples = Vec::with_capacity(total_frames);
        for frame_idx in 0..total_frames {
            let start = frame_idx * num_channels;
            let mut sum = 0.0f32;
            for ch in 0..num_channels {
                sum += input[start + ch];
            }
            mono_samples.push(sum / (num_channels as f32));
        }

        // 2. 采样率转换 (Resampling)
        let ratio = self.input_sample_rate as f64 / self.output_sample_rate as f64;
        let output_frames = ((total_frames as f64) / ratio).floor() as usize;
        let mut output = Vec::with_capacity(output_frames);

        for out_idx in 0..output_frames {
            let in_pos = out_idx as f64 * ratio;
            let in_idx = in_pos.floor() as usize;
            let frac = (in_pos - in_idx as f64) as f32;

            let sample = if in_idx + 1 < total_frames {
                // 线性插值
                mono_samples[in_idx] * (1.0 - frac) + mono_samples[in_idx + 1] * frac
            } else if in_idx < total_frames {
                mono_samples[in_idx]
            } else {
                0.0
            };

            // 3. 量化为 16-bit 整数并做软抗削波限制
            let clamped = sample.clamp(-1.0, 1.0);
            let pcm16 = (clamped * 32767.0).round() as i16;
            output.push(pcm16);
        }

        Ok(output)
    }
}

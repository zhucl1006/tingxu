use crate::error::TingxuError;
use serde::{Deserialize, Serialize};
use std::f32::consts::PI;

pub const SPEAKER_EMBEDDING_DIM: usize = 192;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MeetingSpeakerRecord {
    pub meeting_id: String,
    pub local_speaker_id: String,
    pub display_name: String,
    pub color_index: i32,
    pub confidence: f64,
    pub first_seen_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpeakerProfileMetadata {
    pub profile_id: String,
    pub account_id: String,
    pub display_name: String,
    pub embedding_dim: i32,
    pub model_id: String,
    pub model_version: String,
    pub sample_duration_ms: i64,
    pub consent_at: i64,
    pub created_at: i64,
    pub last_matched_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpeakerMatchHit {
    pub profile_id: String,
    pub display_name: String,
    pub score: f64,
    pub margin: f64,
}

fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0_f32.powf(mel / 2595.0) - 1.0)
}

fn goertzel_power(frame: &[f32], freq_hz: f32, sample_rate: u32) -> f32 {
    let n = frame.len();
    if n == 0 {
        return 0.0;
    }
    let k = ((n as f32) * freq_hz / (sample_rate as f32)).round();
    let w = 2.0 * PI * k / (n as f32);
    let coeff = 2.0 * w.cos();
    let mut q1 = 0.0_f32;
    let mut q2 = 0.0_f32;
    let denom = (n.saturating_sub(1)).max(1) as f32;

    for (i, &sample) in frame.iter().enumerate() {
        let win = 0.54 - 0.46 * (2.0 * PI * (i as f32) / denom).cos();
        let q0 = coeff * q1 - q2 + sample * win;
        q2 = q1;
        q1 = q0;
    }
    let power = q1 * q1 + q2 * q2 - q1 * q2 * coeff;
    (power / (n as f32)).max(0.0)
}

fn normalize_sub_vector(values: &[f32], weight: f32) -> Vec<f32> {
    if values.is_empty() {
        return Vec::new();
    }
    let mean = values.iter().sum::<f32>() / (values.len() as f32);
    let var_sum: f32 = values.iter().map(|v| (v - mean) * (v - mean)).sum();
    let std = (var_sum / (values.len() as f32)).sqrt();
    if std < 1e-9 {
        return vec![0.0; values.len()];
    }
    values.iter().map(|v| ((v - mean) / std) * weight).collect()
}

pub fn l2_normalize(vec: &[f32]) -> Vec<f32> {
    let sum_sq: f32 = vec.iter().map(|v| v * v).sum();
    let norm = sum_sq.sqrt();
    if norm < 1e-12 {
        let mut fallback = vec![0.0; vec.len()];
        if !fallback.is_empty() {
            fallback[0] = 1.0;
        }
        return fallback;
    }
    vec.iter().map(|v| v / norm).collect()
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let len = a.len().min(b.len());
    if len == 0 {
        return 0.0;
    }
    let mut dot = 0.0_f32;
    let mut norm_a = 0.0_f32;
    let mut norm_b = 0.0_f32;
    for i in 0..len {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }
    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom < 1e-12 {
        return 0.0;
    }
    dot / denom
}

/// 从 16kHz 单声道音频提取 192 维 L2 归一化声纹嵌入（对齐 CAM++ 80-dim Fbank + 一阶斜率 + 基频谐波结构）
pub fn extract_speaker_embedding(samples: &[f32], sample_rate: u32) -> Result<Vec<f32>, TingxuError> {
    if samples.is_empty() || sample_rate == 0 {
        return Err(TingxuError::resample_failed("声纹提取输入音频为空或采样率无效"));
    }

    let num_mel_bins = 80;
    let min_mel = hz_to_mel(60.0);
    let max_mel = hz_to_mel(((sample_rate / 2).saturating_sub(200)).min(7600) as f32);
    let mut mel_centers_hz = Vec::with_capacity(num_mel_bins);
    for b in 0..num_mel_bins {
        let mel = min_mel + (max_mel - min_mel) * (b as f32) / ((num_mel_bins - 1) as f32);
        mel_centers_hz.push(mel_to_hz(mel));
    }

    let frame_size = ((0.025 * (sample_rate as f32)) as usize).max(64);
    let frame_step = ((0.020 * (sample_rate as f32)) as usize).max(32);
    let max_frames = 50;
    let total_available_frames = if samples.len() > frame_size {
        (samples.len() - frame_size) / frame_step + 1
    } else {
        1
    };
    let stride = (total_available_frames / max_frames).max(1);

    let mut mel_frames: Vec<Vec<f32>> = Vec::new();
    let mut f = 0;
    while f < total_available_frames && mel_frames.len() < max_frames {
        let start = f * frame_step;
        let end = (start + frame_size).min(samples.len());
        if end.saturating_sub(start) < 64 {
            break;
        }
        let slice = &samples[start..end];
        let energy: f32 = slice.iter().map(|s| s * s).sum();
        let rms = (energy / (slice.len() as f32)).sqrt();
        if rms >= 0.004 {
            let mut mel_energies = Vec::with_capacity(num_mel_bins);
            for &freq in &mel_centers_hz {
                let p = goertzel_power(slice, freq, sample_rate);
                mel_energies.push((1e-6 + p * 1000.0).ln());
            }
            mel_frames.push(mel_energies);
        }
        f += stride;
    }

    if mel_frames.is_empty() {
        let mut fallback = vec![0.0; SPEAKER_EMBEDDING_DIM];
        fallback[0] = 1.0;
        return Ok(fallback);
    }

    let mut mean_mel = vec![0.0_f32; num_mel_bins];
    for frame in &mel_frames {
        for b in 0..num_mel_bins {
            mean_mel[b] += frame[b];
        }
    }
    for v in &mut mean_mel {
        *v /= mel_frames.len() as f32;
    }

    let mut spectral_delta = vec![0.0_f32; num_mel_bins];
    for b in 0..num_mel_bins {
        let prev = mean_mel[b.saturating_sub(1)];
        let next = mean_mel[(b + 1).min(num_mel_bins - 1)];
        spectral_delta[b] = next - prev;
    }

    let mut pitch_comb = vec![0.0_f32; 32];
    let mid_start = (samples.len() / 2).saturating_sub(1024);
    let mid_end = (mid_start + 2048).min(samples.len());
    let mid_slice = &samples[mid_start..mid_end];

    for p in 0..32 {
        let target_hz = 75.0 + (p as f32) * 10.0;
        let lag = ((sample_rate as f32) / target_hz).round().max(1.0) as usize;
        let mut corr = 0.0_f32;
        let mut count = 0usize;
        let mut i = 0;
        while i + lag < mid_slice.len() {
            corr += mid_slice[i] * mid_slice[i + lag];
            count += 1;
            i += 1;
        }
        pitch_comb[p] = if count > 0 { corr / (count as f32) } else { 0.0 };
    }

    let norm_mel = normalize_sub_vector(&mean_mel, 1.0);
    let norm_delta = normalize_sub_vector(&spectral_delta, 0.8);
    let norm_pitch = normalize_sub_vector(&pitch_comb, 1.2);

    let mut combined = Vec::with_capacity(SPEAKER_EMBEDDING_DIM);
    combined.extend_from_slice(&norm_mel);
    combined.extend_from_slice(&norm_delta);
    combined.extend_from_slice(&norm_pitch);

    Ok(l2_normalize(&combined))
}

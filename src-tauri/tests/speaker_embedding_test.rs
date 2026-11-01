use tingxu_desktop::speaker::{cosine_similarity, extract_speaker_embedding, SPEAKER_EMBEDDING_DIM};

fn synthesize_voice(f0_hz: f32, formant_hz: f32, duration_sec: f32, sample_rate: u32) -> Vec<f32> {
    let total = (duration_sec * sample_rate as f32) as usize;
    let mut out = Vec::with_capacity(total);
    for i in 0..total {
        let t = i as f32 / sample_rate as f32;
        let v = (2.0 * std::f32::consts::PI * f0_hz * t).sin()
            + 0.5 * (2.0 * std::f32::consts::PI * f0_hz * 2.0 * t).sin()
            + 0.25 * (2.0 * std::f32::consts::PI * f0_hz * 3.0 * t).sin()
            + 0.4 * (2.0 * std::f32::consts::PI * formant_hz * t).sin();
        out.push(0.35 * v);
    }
    out
}

#[test]
fn test_rust_speaker_embedding_dimension_and_l2_norm() {
    let samples = synthesize_voice(130.0, 1050.0, 1.5, 16000);
    let emb = extract_speaker_embedding(&samples, 16000).expect("Extract speaker embedding");
    assert_eq!(emb.len(), SPEAKER_EMBEDDING_DIM);

    let norm_sq: f32 = emb.iter().map(|v| v * v).sum();
    assert!((norm_sq.sqrt() - 1.0).abs() < 1e-3);
}

#[test]
fn test_rust_speaker_embedding_separates_different_speakers() {
    let spk_a1 = extract_speaker_embedding(&synthesize_voice(120.0, 950.0, 1.5, 16000), 16000).unwrap();
    let spk_a2 = extract_speaker_embedding(&synthesize_voice(122.0, 960.0, 1.7, 16000), 16000).unwrap();
    let spk_b1 = extract_speaker_embedding(&synthesize_voice(245.0, 2350.0, 1.6, 16000), 16000).unwrap();

    let sim_same = cosine_similarity(&spk_a1, &spk_a2);
    let sim_diff = cosine_similarity(&spk_a1, &spk_b1);

    assert!(sim_same > 0.85, "同一说话人余弦相似度应 > 0.85，实际: {}", sim_same);
    assert!(sim_diff < 0.65, "不同说话人余弦相似度应 < 0.65，实际: {}", sim_diff);
}

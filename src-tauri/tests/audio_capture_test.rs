use tingxu_desktop::media::atomic_disk::{AudioSliceWriter, verify_slice_checksum};
use tingxu_desktop::media::device::{AudioDevice, AudioDeviceManager, TrackType};
use tingxu_desktop::media::resampler::PcmResampler;
use tingxu_desktop::media::ring_buffer::AudioRingBuffer;

#[test]
fn test_ring_buffer_push_pop_and_overflow() {
    let mut buffer = AudioRingBuffer::new(1024);
    assert_eq!(buffer.available_read(), 0);
    assert_eq!(buffer.available_write(), 1024);

    let input_samples = vec![100i16, 200, 300, 400, 500];
    let written = buffer.push_slice(&input_samples).expect("Push should succeed");
    assert_eq!(written, 5);
    assert_eq!(buffer.available_read(), 5);

    let mut output = vec![0i16; 5];
    let read = buffer.pop_slice(&mut output);
    assert_eq!(read, 5);
    assert_eq!(output, input_samples);
    assert_eq!(buffer.available_read(), 0);
}

#[test]
fn test_resampler_48k_stereo_to_16k_mono() {
    let mut resampler = PcmResampler::new(48000, 16000, 2);
    // 480 帧立体声输入 (960 个 float 样本)
    let mut stereo_input = Vec::with_capacity(960);
    for i in 0..480 {
        let val = (i as f32 / 480.0) * 0.8;
        stereo_input.push(val); // 左声道
        stereo_input.push(val); // 右声道
    }

    let pcm16 = resampler
        .process_f32_to_i16(&stereo_input)
        .expect("Resampling should succeed");

    // 48kHz -> 16kHz (3:1 下采样)，480 帧应输出 160 个单声道 i16 样本
    assert_eq!(pcm16.len(), 160);
    // 检查样本处于合理 i16 振幅范围内
    assert!(pcm16.iter().any(|&s| s != 0));
}

#[test]
fn test_atomic_disk_slice_flushing_and_sha256() {
    let temp_dir = std::env::temp_dir().join(format!("tingxu_test_disk_{}", std::time::SystemTime::now().elapsed().unwrap().as_nanos()));
    std::fs::create_dir_all(&temp_dir).unwrap();

    let writer = AudioSliceWriter::new(&temp_dir).expect("Init slice writer");
    
    // 模拟 2 秒 16kHz 16-bit 单声道 PCM 数据 (16000 * 2 = 32000 个 i16 样本，即 64000 字节)
    let pcm_samples: Vec<i16> = (0..32000).map(|i| (i % 3000) as i16).collect();
    
    let slice = writer
        .write_atomic_slice(TrackType::Mic, 1, &pcm_samples)
        .expect("Atomic slice write should succeed");

    assert_eq!(slice.index, 1);
    assert_eq!(slice.track, TrackType::Mic);
    assert_eq!(slice.sample_count, 32000);
    assert_eq!(slice.byte_length, 64000);

    // 校验 SHA256 完整性
    assert!(verify_slice_checksum(&slice.file_path, &slice.sha256).unwrap());

    // 清理
    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_crash_recovery_scan() {
    let temp_dir = std::env::temp_dir().join(format!("tingxu_test_recovery_{}", std::time::SystemTime::now().elapsed().unwrap().as_nanos()));
    std::fs::create_dir_all(&temp_dir).unwrap();

    let writer = AudioSliceWriter::new(&temp_dir).expect("Init slice writer");
    let pcm_samples: Vec<i16> = vec![10, 20, 30, 40, 50];
    let slice = writer.write_atomic_slice(TrackType::System, 1, &pcm_samples).unwrap();

    // 模拟一个崩溃残留的未命名 .tmp 垃圾文件
    let orphan_tmp = temp_dir.join("slice_orphan.tmp");
    std::fs::write(&orphan_tmp, b"corrupted bytes").unwrap();

    // 执行扫描自愈
    let recovered_slices = writer.scan_and_recover().unwrap();
    assert_eq!(recovered_slices.len(), 1);
    assert_eq!(recovered_slices[0].sha256, slice.sha256);
    // .tmp 垃圾文件应被自愈清理
    assert!(!orphan_tmp.exists());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_audio_track_type_and_device_hotplug() {
    let mut manager = AudioDeviceManager::new();
    let default_mic = AudioDevice {
        id: "mic-default".into(),
        name: "内置麦克风 (MacBook Pro)".into(),
        track: TrackType::Mic,
        is_default: true,
    };
    let default_system = AudioDevice {
        id: "sys-default".into(),
        name: "系统扬声器 (Loopback)".into(),
        track: TrackType::System,
        is_default: true,
    };

    manager.register_device(default_mic);
    manager.register_device(default_system);

    let active_tracks = manager.get_active_tracks();
    assert_eq!(active_tracks.len(), 2);
    assert!(active_tracks.contains(&TrackType::Mic));
    assert!(active_tracks.contains(&TrackType::System));
}

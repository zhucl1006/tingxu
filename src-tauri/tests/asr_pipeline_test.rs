use tingxu_desktop::asr::engine::{AsrFrame, TranscriptEvent};
use tingxu_desktop::asr::dashscope::DashScopeParser;
use tingxu_desktop::asr::iflytek::IflytekParser;
use tingxu_desktop::asr::lease::AsrLeaseManager;
use tingxu_desktop::media::device::TrackType;

#[test]
fn test_asr_frame_and_transcript_event_structure() {
    let pcm_payload = vec![0u8; 3200]; // 100ms at 16kHz 16-bit mono
    let frame = AsrFrame::new(TrackType::Mic, 100, pcm_payload);
    
    assert_eq!(frame.track, TrackType::Mic);
    assert_eq!(frame.timestamp_ms, 100);
    assert_eq!(frame.speaker_label(), "我方 (麦克风)");

    let interim_event = TranscriptEvent {
        id: "evt-1".into(),
        track: TrackType::Mic,
        speaker: frame.speaker_label().to_string(),
        text: "正在讨论项目".into(),
        is_final: false,
        timestamp: "00:01:05".into(),
    };
    assert!(!interim_event.is_final);

    let final_event = TranscriptEvent {
        id: "evt-2".into(),
        track: TrackType::System,
        speaker: "远端 (系统扬声器)".into(),
        text: "我们同意本周五交付骨架。".into(),
        is_final: true,
        timestamp: "00:01:08".into(),
    };
    assert!(final_event.is_final);
    assert_eq!(final_event.speaker, "远端 (系统扬声器)");
}

#[test]
fn test_dashscope_asr_protocol_parsing() {
    let mock_json = r#"{
        "header": {
            "event": "result-generated",
            "task_id": "task_abc123"
        },
        "payload": {
            "output": {
                "sentence": {
                    "text": "我们讨论下周计划",
                    "sentence_id": 1,
                    "end_time": 2500
                }
            },
            "usage": {
                "duration": 2500
            }
        }
    }"#;

    let result = DashScopeParser::parse_event(mock_json, TrackType::Mic)
        .expect("Parse DashScope response");
    assert_eq!(result.text, "我们讨论下周计划");
    assert_eq!(result.track, TrackType::Mic);
}

#[test]
fn test_iflytek_asr_protocol_parsing() {
    let mock_json = r#"{
        "code": 0,
        "message": "success",
        "data": {
            "result": {
                "ls": true,
                "pgs": "rpl",
                "rg": [1, 2],
                "sn": 1,
                "ws": [
                    {
                        "bg": 0,
                        "cw": [{"w": "架构"}, {"w": "设计"}]
                    }
                ]
            }
        }
    }"#;

    let result = IflytekParser::parse_event(mock_json, TrackType::System)
        .expect("Parse iFlytek response");
    assert_eq!(result.text, "架构设计");
    assert!(result.is_final);
    assert_eq!(result.track, TrackType::System);
}

#[test]
fn test_lease_manager_and_heartbeat() {
    let mut manager = AsrLeaseManager::new(30); // 30 秒有效租约
    assert!(manager.is_lease_valid());

    // 模拟扣减/使用时长
    manager.record_consumption(10);
    assert_eq!(manager.used_seconds(), 10);
    assert!(manager.is_lease_valid());

    // 模拟租约过期
    manager.expire_now();
    assert!(!manager.is_lease_valid());

    let frame = AsrFrame::new(TrackType::Mic, 0, vec![0u8; 3200]);
    let push_result = manager.check_can_push_frame(&frame);
    assert!(push_result.is_err());
}

#[test]
fn test_exponential_backoff_reconnect() {
    let manager = AsrLeaseManager::new(60);
    assert_eq!(manager.get_reconnect_delay_ms(1), 1000);
    assert_eq!(manager.get_reconnect_delay_ms(2), 2000);
    assert_eq!(manager.get_reconnect_delay_ms(3), 4000);
    assert_eq!(manager.get_reconnect_delay_ms(4), 8000);
    assert_eq!(manager.get_reconnect_delay_ms(5), 16000);
    // 超过最大重试次数
    assert_eq!(manager.get_reconnect_delay_ms(6), 16000);
}

use std::{
    fs,
};
use tingxu_desktop::media::recording::RecordingStore;
fn root() -> std::path::PathBuf { std::env::temp_dir().join(format!("tingxu015-{}", uuid::Uuid::new_v4())) }

#[test]
fn ordered_pcm_tail_restart_and_account_isolation() {
    let root = root();
    let mut store = RecordingStore::new(root.clone()).unwrap();
    store.bind("account-a".into(), u64::MAX);
    let id = store.start().unwrap();
    store.append(&id, vec![1; 64000]).unwrap();
    store.append(&id, vec![2; 1000]).unwrap();
    let meta = store.finish(&id).unwrap();
    assert_eq!(meta.samples, 32500);
    let path = store.resolve(&id).unwrap();
    let wav = fs::read(&path).unwrap();
    assert_eq!(&wav[..4], b"RIFF");
    assert_eq!(wav.len(), 65044);
    assert_eq!(&wav[44..48], &[1, 1, 1, 1]);
    assert_eq!(&wav[64044..64048], &[2, 2, 2, 2]);
    assert!(store.append(&id, vec![0; 2]).is_err());
    store.bind("account-b".into(), u64::MAX);
    assert!(store.resolve(&id).is_err());
    store.bind("account-a".into(), u64::MAX);
    assert!(store.resolve("../escape").is_err());
    drop(store);
    let mut restarted = RecordingStore::new(root.clone()).unwrap();
    restarted.bind("account-a".into(), u64::MAX);
    assert_eq!(
        fs::metadata(restarted.resolve(&id).unwrap()).unwrap().len(),
        65044
    );
    restarted.clear();
    assert!(restarted.resolve(&id).is_err());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn checkpoint_tail_is_durable_and_corruption_rejected() {
    let root = root();
    let mut store = RecordingStore::new(root.clone()).unwrap();
    store.bind("a".into(), u64::MAX);
    let id = store.start().unwrap();
    store.append(&id, vec![3; 1600]).unwrap();
    assert_eq!(store.checkpoint(&id).unwrap(), 800);
    let meta = store.finish(&id).unwrap();
    assert_eq!(meta.samples, 800);
    let path = store.resolve(&id).unwrap();
    fs::remove_file(path).unwrap();
    let recovered = store.resolve(&id).unwrap();
    assert_eq!(fs::metadata(&recovered).unwrap().len(), 1644);
    fs::remove_file(&recovered).unwrap();
    fs::write(recovered.parent().unwrap().join("000000.pcm"), [0, 0]).unwrap();
    assert!(store.resolve(&id).is_err());
    assert!(store.append(&id, vec![1; 3]).is_err());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn no_identity_expired_identity_and_payload_bounds() {
    let root = root();
    let mut s = RecordingStore::new(root.clone()).unwrap();
    assert!(s.start().is_err());
    s.bind("a".into(), 1);
    assert!(s.start().is_err());
    s.bind("a".into(), u64::MAX);
    let id = s.start().unwrap();
    assert!(s.append(&id, vec![0; 65538]).is_err());
    assert!(s.append(&id, vec![0; 3]).is_err());
    s.finish(&id).unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn leases_are_revoked_on_account_change_and_delete_is_owner_scoped() {
    let root = root();
    let mut s = RecordingStore::new(root.clone()).unwrap();
    s.bind("a".into(), u64::MAX);
    let id = s.start().unwrap();
    s.append(&id, vec![0; 320]).unwrap();
    s.finish(&id).unwrap();
    let lease = s.lease(&id).unwrap();
    assert!(s.leased_path(&lease).is_ok());
    s.bind("b".into(), u64::MAX);
    assert!(s.leased_path(&lease).is_err());
    assert!(s.delete(&id).is_err());
    s.bind("a".into(), u64::MAX);
    s.delete(&id).unwrap();
    assert!(s.resolve(&id).is_err());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn thirty_minute_synthetic_recording_streams_without_whole_file_reads() {
    let root = root();
    let mut s = RecordingStore::new(root.clone()).unwrap();
    s.bind("synthetic".into(), u64::MAX);
    let id = s.start().unwrap();
    for _ in 0..900 {
        loop {
            if s.append(&id, vec![0; 64000]).is_ok() {
                break;
            }
            std::thread::yield_now();
        }
    }
    let meta = s.finish(&id).unwrap();
    assert_eq!(meta.samples, 28_800_000);
    let path = s.resolve(&id).unwrap();
    assert_eq!(fs::metadata(&path).unwrap().len(), 57_600_044);
    let range =
        tingxu_desktop::media::playback::read_range(&path, Some("bytes=48000044-")).unwrap();
    assert!(range.bytes.len() <= 262144);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn wav_content_corruption_is_rejected_before_playback() {
    let root = root();
    let mut s = RecordingStore::new(root.clone()).unwrap();
    s.bind("a".into(), u64::MAX);
    let id = s.start().unwrap();
    s.append(&id, vec![0; 320]).unwrap();
    s.finish(&id).unwrap();
    let path = s.resolve(&id).unwrap();
    let mut bytes = fs::read(&path).unwrap();
    bytes[44] = 1;
    fs::write(path, bytes).unwrap();
    assert!(s.resolve(&id).is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn storage_usage_and_pruning_by_age_and_id() {
    let root = root();
    let mut s = RecordingStore::new(root.clone()).unwrap();
    assert!(s.storage_usage().is_err());
    assert!(s.prune(None, None).is_err());

    s.bind("user-cleanup-test".into(), u64::MAX);
    let usage0 = s.storage_usage().unwrap();
    assert_eq!(usage0.recording_count, 0);
    assert_eq!(usage0.total_bytes, 0);

    let id1 = s.start().unwrap();
    s.append(&id1, vec![1; 1600]).unwrap();
    s.finish(&id1).unwrap();

    let id2 = s.start().unwrap();
    s.append(&id2, vec![2; 3200]).unwrap();
    s.finish(&id2).unwrap();

    let usage1 = s.storage_usage().unwrap();
    assert_eq!(usage1.recording_count, 2);
    assert!(usage1.total_bytes > 0);

    // 针对指定 target_ids 删除 id1
    let prune1 = s.prune(None, Some(vec![id1.clone()])).unwrap();
    assert_eq!(prune1.deleted_count, 1);
    assert_eq!(prune1.deleted_ids, vec![id1.clone()]);
    assert!(prune1.freed_bytes > 0);
    assert!(s.resolve(&id1).is_err());
    assert!(s.resolve(&id2).is_ok());

    let usage2 = s.storage_usage().unwrap();
    assert_eq!(usage2.recording_count, 1);

    // 按 older_than_secs: 3600 (未来/不满足时间差)，不应删除
    let prune_noop = s.prune(Some(3600), None).unwrap();
    assert_eq!(prune_noop.deleted_count, 0);
    assert_eq!(prune_noop.deleted_ids.len(), 0);
    assert_eq!(prune_noop.freed_bytes, 0);

    // older_than_secs: 0 (只要大于等于0秒均可清理)，删除 id2
    let prune2 = s.prune(Some(0), None).unwrap();
    assert_eq!(prune2.deleted_count, 1);
    assert_eq!(prune2.deleted_ids, vec![id2.clone()]);
    assert!(prune2.freed_bytes > 0);
    assert!(s.resolve(&id2).is_err());

    let usage3 = s.storage_usage().unwrap();
    assert_eq!(usage3.recording_count, 0);
    assert_eq!(usage3.total_bytes, 0);

    fs::remove_dir_all(root).unwrap();
}

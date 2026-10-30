use tingxu_desktop::media::device::TrackType;
use tingxu_desktop::store::db::LocalDatabase;
use tingxu_desktop::store::fts::SearchResult;

#[test]
fn test_sqlite_wal_init_and_schema() {
    let db = LocalDatabase::memory().expect("Initialize in-memory SQLite");
    let mode = db.get_journal_mode().expect("Check journal mode");
    assert_eq!(mode.to_lowercase(), "memory"); // 内存库模式为 memory，文件库为 wal
}

#[test]
fn test_fts5_full_text_search_and_highlight() {
    let db = LocalDatabase::memory().expect("Init SQLite");

    // 1. 插入测试会议
    db.create_meeting("mtg_101", "acc_user_1", "Q4 战略产品规划会", 1700000000)
        .expect("Create meeting");

    // 2. 插入逐字稿段落
    db.insert_transcript_segment(
        "seg_001",
        "mtg_101",
        "acc_user_1",
        "朱工",
        TrackType::Mic,
        "00:01:15",
        75,
        "我们要在本周五前完成跨平台双栏工作台的骨架搭建。",
    )
    .expect("Insert segment 1");

    db.insert_transcript_segment(
        "seg_002",
        "mtg_101",
        "acc_user_1",
        "李经理",
        TrackType::System,
        "00:02:40",
        160,
        "双栏工作台搭建完成后，请立即安排本地 SQLite FTS5 检索基准测试。",
    )
    .expect("Insert segment 2");

    // 3. 执行 FTS5 全文搜索
    let start = std::time::Instant::now();
    let results: Vec<SearchResult> = db
        .search_transcripts("acc_user_1", "工作台")
        .expect("Search transcripts");
    let elapsed = start.elapsed();

    // 检索时延必须 < 50ms
    assert!(elapsed.as_millis() < 50, "FTS5 检索耗时应 < 50ms");
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].meeting_id, "mtg_101");
    // 检查高亮标签
    assert!(results[0].highlighted_text.contains("<b>工作台</b>"));
}

#[test]
fn test_audio_playback_timestamp_sync() {
    let db = LocalDatabase::memory().expect("Init SQLite");
    // 假设每个音频分片周期为 2 秒 (16kHz 16-bit 单声道 = 32000 字节/秒，即每分片 64000 字节)
    let sync_info = db.calculate_audio_playback_sync(75); // 第 75 秒
    assert_eq!(sync_info.slice_index, 37); // 75 / 2 = 37 (第 38 片，索引 37)
    assert_eq!(sync_info.offset_in_slice_bytes, 32000); // 1 秒偏移量 = 32000 字节
}

#[test]
fn test_multi_account_sandbox_isolation() {
    let db = LocalDatabase::memory().expect("Init SQLite");

    // 账号 A 与 账号 B 数据插入
    db.create_meeting("mtg_a", "acc_alice", "Alice 敏捷会议", 1700000100).unwrap();
    db.insert_transcript_segment("seg_a", "mtg_a", "acc_alice", "Alice", TrackType::Mic, "00:00:10", 10, "关于用户登录模块的计划").unwrap();

    db.create_meeting("mtg_b", "acc_bob", "Bob 财务会议", 1700000200).unwrap();
    db.insert_transcript_segment("seg_b", "mtg_b", "acc_bob", "Bob", TrackType::Mic, "00:00:15", 15, "关于年度财务预算的审计计划").unwrap();

    // Alice 检索“计划”
    let alice_results = db.search_transcripts("acc_alice", "计划").unwrap();
    assert_eq!(alice_results.len(), 1);
    assert_eq!(alice_results[0].meeting_id, "mtg_a");

    // Bob 检索“计划”
    let bob_results = db.search_transcripts("acc_bob", "计划").unwrap();
    assert_eq!(bob_results.len(), 1);
    assert_eq!(bob_results[0].meeting_id, "mtg_b");

    // 交叉验证：Alice 绝对搜不到 Bob 的数据
    let leak_check = db.search_transcripts("acc_alice", "财务预算").unwrap();
    assert_eq!(leak_check.len(), 0);
}

#[test]
fn test_cascade_physical_delete() {
    let temp_dir = std::env::temp_dir().join(format!("tingxu_test_cascade_{}", std::time::SystemTime::now().elapsed().unwrap().as_nanos()));
    std::fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("local.db");
    let db = LocalDatabase::open(&db_path).expect("Open file DB");

    db.create_meeting("mtg_del", "acc_user", "即将删除的会议", 1700000500).unwrap();
    db.insert_transcript_segment("seg_del", "mtg_del", "acc_user", "发言人", TrackType::Mic, "00:00:02", 2, "这是一段即将被抹除的敏感会议语音").unwrap();

    // 模拟物理音频切片与截图文件
    let slice_file = temp_dir.join("slice_mic_000001.pcm");
    std::fs::write(&slice_file, b"secret pcm audio data").unwrap();

    // 执行物理级联删除
    let files_to_delete = vec![slice_file.clone()];
    db.delete_meeting_cascade("mtg_del", &files_to_delete).expect("Delete meeting cascade");

    // 1. 验证 SQLite 记录抹除
    let results = db.search_transcripts("acc_user", "敏感会议").unwrap();
    assert_eq!(results.len(), 0);

    // 2. 验证物理文件彻底被擦除
    assert!(!slice_file.exists());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

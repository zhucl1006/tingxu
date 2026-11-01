use crate::error::TingxuError;
use crate::media::device::TrackType;
use crate::speaker::MeetingSpeakerRecord;
use crate::store::fts::{AudioSyncInfo, SearchResult};
use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub struct LocalDatabase {
    conn: Arc<Mutex<Connection>>,
}

impl LocalDatabase {
    pub fn memory() -> Result<Self, TingxuError> {
        let conn = Connection::open_in_memory()
            .map_err(|e| TingxuError::disk_io(format!("内存 SQLite 初始化失败: {}", e)))?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn open(path: impl AsRef<Path>) -> Result<Self, TingxuError> {
        let conn = Connection::open(path)
            .map_err(|e| TingxuError::disk_io(format!("打开 SQLite 数据库失败: {}", e)))?;
        
        // 开启 WAL 预写日志与外键
        let _ = conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;"
        );

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn get_journal_mode(&self) -> Result<String, TingxuError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("PRAGMA journal_mode;")
            .map_err(|e| TingxuError::disk_io(e.to_string()))?;
        let mode: String = stmt
            .query_row([], |row| row.get(0))
            .map_err(|e| TingxuError::disk_io(e.to_string()))?;
        Ok(mode)
    }

    fn init_schema(&self) -> Result<(), TingxuError> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS meetings (
                local_id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                title TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS transcript_segments (
                segment_id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                account_id TEXT NOT NULL,
                speaker TEXT NOT NULL,
                speaker_id TEXT,
                speaker_confidence REAL,
                channel TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                timestamp_seconds INTEGER NOT NULL,
                text TEXT NOT NULL,
                FOREIGN KEY(meeting_id) REFERENCES meetings(local_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS meeting_speakers (
                meeting_id TEXT NOT NULL,
                local_speaker_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                color_index INTEGER NOT NULL,
                confidence REAL,
                first_seen_ms INTEGER NOT NULL,
                PRIMARY KEY (meeting_id, local_speaker_id),
                FOREIGN KEY(meeting_id) REFERENCES meetings(local_id) ON DELETE CASCADE
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS transcript_fts USING fts5(
                segment_id UNINDEXED,
                account_id UNINDEXED,
                meeting_id UNINDEXED,
                text,
                tokenize = 'trigram'
            );"
        )
        .map_err(|e| TingxuError::disk_io(format!("初始化数据表与 FTS5 失败: {}", e)))?;

        Ok(())
    }

    pub fn create_meeting(
        &self,
        local_id: &str,
        account_id: &str,
        title: &str,
        start_time: i64,
    ) -> Result<(), TingxuError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO meetings (local_id, account_id, title, start_time) VALUES (?1, ?2, ?3, ?4)",
            params![local_id, account_id, title, start_time],
        )
        .map_err(|e| TingxuError::disk_io(e.to_string()))?;
        Ok(())
    }

    pub fn insert_transcript_segment(
        &self,
        segment_id: &str,
        meeting_id: &str,
        account_id: &str,
        speaker: &str,
        track: TrackType,
        timestamp: &str,
        timestamp_seconds: u64,
        text: &str,
    ) -> Result<(), TingxuError> {
        let mut conn = self.conn.lock().unwrap();
        let channel_str = match track {
            TrackType::Mic => "mic",
            TrackType::System => "system",
        };

        let tx = conn
            .transaction()
            .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        tx.execute(
            "INSERT INTO transcript_segments 
             (segment_id, meeting_id, account_id, speaker, channel, timestamp, timestamp_seconds, text) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![segment_id, meeting_id, account_id, speaker, channel_str, timestamp, timestamp_seconds, text],
        )
        .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        // 同步写入 FTS5 虚表
        tx.execute(
            "INSERT INTO transcript_fts (segment_id, account_id, meeting_id, text) VALUES (?1, ?2, ?3, ?4)",
            params![segment_id, account_id, meeting_id, text],
        )
        .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        tx.commit().map_err(|e| TingxuError::disk_io(e.to_string()))?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn insert_transcript_segment_with_speaker(
        &self,
        segment_id: &str,
        meeting_id: &str,
        account_id: &str,
        speaker: &str,
        speaker_id: Option<&str>,
        speaker_confidence: Option<f64>,
        track: TrackType,
        timestamp: &str,
        timestamp_seconds: u64,
        text: &str,
    ) -> Result<(), TingxuError> {
        let mut conn = self.conn.lock().map_err(|e| TingxuError::disk_io(e.to_string()))?;
        let channel_str = match track {
            TrackType::Mic => "mic",
            TrackType::System => "system",
        };

        let tx = conn
            .transaction()
            .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        tx.execute(
            "INSERT INTO transcript_segments 
             (segment_id, meeting_id, account_id, speaker, speaker_id, speaker_confidence, channel, timestamp, timestamp_seconds, text) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                segment_id,
                meeting_id,
                account_id,
                speaker,
                speaker_id,
                speaker_confidence,
                channel_str,
                timestamp,
                timestamp_seconds,
                text
            ],
        )
        .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        tx.execute(
            "INSERT INTO transcript_fts (segment_id, account_id, meeting_id, text) VALUES (?1, ?2, ?3, ?4)",
            params![segment_id, account_id, meeting_id, text],
        )
        .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        tx.commit().map_err(|e| TingxuError::disk_io(e.to_string()))?;
        Ok(())
    }

    pub fn upsert_meeting_speaker(
        &self,
        meeting_id: &str,
        local_speaker_id: &str,
        display_name: &str,
        color_index: i32,
        confidence: f64,
        first_seen_ms: i64,
    ) -> Result<(), TingxuError> {
        let conn = self.conn.lock().map_err(|e| TingxuError::disk_io(e.to_string()))?;
        conn.execute(
            "INSERT INTO meeting_speakers (meeting_id, local_speaker_id, display_name, color_index, confidence, first_seen_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(meeting_id, local_speaker_id) DO UPDATE SET
               display_name = excluded.display_name,
               confidence = excluded.confidence",
            params![meeting_id, local_speaker_id, display_name, color_index, confidence, first_seen_ms],
        )
        .map_err(|e| TingxuError::disk_io(e.to_string()))?;
        Ok(())
    }

    pub fn rename_meeting_speaker(
        &self,
        meeting_id: &str,
        local_speaker_id: &str,
        new_display_name: &str,
    ) -> Result<(), TingxuError> {
        let mut conn = self.conn.lock().map_err(|e| TingxuError::disk_io(e.to_string()))?;
        let tx = conn
            .transaction()
            .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        tx.execute(
            "UPDATE meeting_speakers SET display_name = ?1 WHERE meeting_id = ?2 AND local_speaker_id = ?3",
            params![new_display_name, meeting_id, local_speaker_id],
        )
        .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        tx.execute(
            "UPDATE transcript_segments SET speaker = ?1 WHERE meeting_id = ?2 AND speaker_id = ?3",
            params![new_display_name, meeting_id, local_speaker_id],
        )
        .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        tx.commit().map_err(|e| TingxuError::disk_io(e.to_string()))?;
        Ok(())
    }

    pub fn list_meeting_speakers(&self, meeting_id: &str) -> Result<Vec<MeetingSpeakerRecord>, TingxuError> {
        let conn = self.conn.lock().map_err(|e| TingxuError::disk_io(e.to_string()))?;
        let mut stmt = conn
            .prepare(
                "SELECT meeting_id, local_speaker_id, display_name, color_index, COALESCE(confidence, 0.0), first_seen_ms
                 FROM meeting_speakers
                 WHERE meeting_id = ?1
                 ORDER BY first_seen_ms ASC",
            )
            .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        let rows = stmt
            .query_map(params![meeting_id], |row| {
                Ok(MeetingSpeakerRecord {
                    meeting_id: row.get(0)?,
                    local_speaker_id: row.get(1)?,
                    display_name: row.get(2)?,
                    color_index: row.get(3)?,
                    confidence: row.get(4)?,
                    first_seen_ms: row.get(5)?,
                })
            })
            .map_err(|e| TingxuError::disk_io(e.to_string()))?;

        let mut list = Vec::new();
        for item in rows.flatten() {
            list.push(item);
        }
        Ok(list)
    }

    pub fn search_transcripts(
        &self,
        account_id: &str,
        keyword: &str,
    ) -> Result<Vec<SearchResult>, TingxuError> {
        let conn = self.conn.lock().unwrap();
        let clean_kw = keyword.trim();
        if clean_kw.is_empty() {
            return Ok(Vec::new());
        }

        let char_count = clean_kw.chars().count();
        if char_count >= 3 {
            let fts_query = format!("\"{}\"", clean_kw.replace('"', "\"\""));
            let mut stmt = conn
                .prepare(
                    "SELECT f.segment_id, f.meeting_id, m.title, m.start_time, 
                            snippet(transcript_fts, 3, '<b>', '</b>', '...', 15) as highlighted_text
                     FROM transcript_fts f
                     JOIN meetings m ON f.meeting_id = m.local_id
                     WHERE transcript_fts MATCH ?1 AND f.account_id = ?2
                     ORDER BY bm25(transcript_fts) LIMIT 50",
                )
                .map_err(|e| TingxuError::disk_io(e.to_string()))?;

            let rows = stmt
                .query_map(params![fts_query, account_id], |row| {
                    Ok(SearchResult {
                        segment_id: row.get(0)?,
                        meeting_id: row.get(1)?,
                        title: row.get(2)?,
                        start_time: row.get(3)?,
                        highlighted_text: row.get(4)?,
                    })
                })
                .map_err(|e| TingxuError::disk_io(e.to_string()))?;

            let mut results = Vec::new();
            for r in rows.flatten() {
                results.push(r);
            }
            Ok(results)
        } else {
            // 少于 3 字符时使用 trigram 索引加速的 LIKE 查询
            let like_pattern = format!("%{}%", clean_kw);
            let mut stmt = conn
                .prepare(
                    "SELECT f.segment_id, f.meeting_id, m.title, m.start_time, f.text
                     FROM transcript_fts f
                     JOIN meetings m ON f.meeting_id = m.local_id
                     WHERE f.text LIKE ?1 AND f.account_id = ?2
                     LIMIT 50",
                )
                .map_err(|e| TingxuError::disk_io(e.to_string()))?;

            let rows = stmt
                .query_map(params![like_pattern, account_id], |row| {
                    let segment_id: String = row.get(0)?;
                    let meeting_id: String = row.get(1)?;
                    let title: String = row.get(2)?;
                    let start_time: i64 = row.get(3)?;
                    let raw_text: String = row.get(4)?;
                    let highlighted = raw_text.replace(clean_kw, &format!("<b>{}</b>", clean_kw));
                    Ok(SearchResult {
                        segment_id,
                        meeting_id,
                        title,
                        start_time,
                        highlighted_text: highlighted,
                    })
                })
                .map_err(|e| TingxuError::disk_io(e.to_string()))?;

            let mut results = Vec::new();
            for r in rows.flatten() {
                results.push(r);
            }
            Ok(results)
        }
    }

    /// 逐字稿时间戳精准对应本地音频切片（每片 2 秒，16kHz 16-bit 单声道 = 32000 字节/秒）
    pub fn calculate_audio_playback_sync(&self, timestamp_seconds: u64) -> AudioSyncInfo {
        let slice_index = timestamp_seconds / 2;
        let offset_in_slice_bytes = (timestamp_seconds % 2) * 32000;
        AudioSyncInfo {
            slice_index,
            offset_in_slice_bytes,
        }
    }

    /// 彻底物理级联删除：清除 SQLite 记录并同步擦除磁盘物理分片文件
    pub fn delete_meeting_cascade(
        &self,
        meeting_id: &str,
        files_to_delete: &[PathBuf],
    ) -> Result<(), TingxuError> {
        // 1. 事务删除数据库记录
        {
            let mut conn = self.conn.lock().unwrap();
            let tx = conn
                .transaction()
                .map_err(|e| TingxuError::disk_io(e.to_string()))?;

            tx.execute("DELETE FROM transcript_fts WHERE meeting_id = ?1", params![meeting_id])
                .map_err(|e| TingxuError::disk_io(e.to_string()))?;
            tx.execute("DELETE FROM transcript_segments WHERE meeting_id = ?1", params![meeting_id])
                .map_err(|e| TingxuError::disk_io(e.to_string()))?;
            tx.execute("DELETE FROM meetings WHERE local_id = ?1", params![meeting_id])
                .map_err(|e| TingxuError::disk_io(e.to_string()))?;

            tx.commit().map_err(|e| TingxuError::disk_io(e.to_string()))?;
        }

        // 2. 级联彻底擦除物理磁盘音频文件
        for file in files_to_delete {
            if file.exists() {
                let _ = fs::remove_file(file);
            }
        }

        Ok(())
    }
}

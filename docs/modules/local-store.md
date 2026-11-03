# 模块设计：Local-First 存储与全文检索（local-store）

**模块名称：** `local-store`  
**代码路径：** `src-tauri/src/store/`  
**负责人：** 听序核心系统研发组  
**最后更新：** 2026-10-30  

---

## 1. 模块定位与职责

`local-store` 模块保障听序用户的数据主权与隐私安全。

- **嵌入式关系存储**：基于 SQLite 3（通过 Rust `rusqlite` crate 驱动），管理会议、音轨切片、逐字稿、洞察卡片与纪要版本；
- **毫秒级全文检索（FTS5）**：利用 SQLite 原生 FTS5 虚表与 `unicode61` 分词器，实现几十场长会议逐字稿的无网秒级关键词检索；
- **文件系统持久化与清理**：管理音频 `.pcm` / `.wav` 分片与截图文件；执行带校验的级联彻底物理删除。

---

## 2. SQLite 连接与并发控制模式

由于桌面客户端存在并发写入（如音频落盘线程、ASR 逐字稿写入、洞察更新与 UI 查询），SQLite 必须配置为最佳并发模式：

```sql
-- 数据库初始化必须启用的 PRAGMA 参数
PRAGMA journal_mode = WAL;          -- 开启预写日志 (Write-Ahead Logging)，读写完全互不阻塞
PRAGMA synchronous = NORMAL;        -- 兼顾断电安全与 I/O 吞吐
PRAGMA foreign_keys = ON;           -- 启用外键级联检查
PRAGMA busy_timeout = 5000;         -- 遇到锁等待最多重试 5 秒
```

---

## 3. 全文检索（FTS5）查询优化

在前端搜索栏输入搜索词时，系统通过参数化查询检索 `transcript_fts`：

```rust
pub fn search_transcripts(
    conn: &Connection, 
    account_id: &str, 
    keyword: &str
) -> Result<Vec<SearchResult>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT t.segment_id, t.meeting_id, m.title, m.start_time, 
                snippet(transcript_fts, 2, '<b>', '</b>', '...', 15) as highlighted_text
         FROM transcript_fts f
         JOIN transcript_segments t ON f.segment_id = t.segment_id
         JOIN meetings m ON t.meeting_id = m.local_id
         WHERE transcript_fts MATCH ? AND m.account_id = ?
         ORDER BY bm25(transcript_fts) LIMIT 50"
    )?;
    
    // 执行查询并组装高亮结果
}
```

- **搜索体验**：支持中文词语精确匹配与上下文带高亮标签（`<b>...</b>`）的片段摘要输出；点击直接定位到历史会议并跳播音频。

## 计划015真实媒体存储（2026-11-02）

当前桌面历史仍使用本机localStorage，音频为独立 app_data_dir/recordings-v1 账号哈希/原生UUID目录，未将SQLite预留字段视作已接通。HistoryMeeting新增可选recording(id/samples/sampleRate)，不保存任意路径或音频base64；旧记录缺省无录音。

原生通过固定控制面的只读auth/session确认JWT身份，缓存token哈希与有效期支持会话有效期内离线重启。身份世代随退出/切账号失效，启动/打开/删除要求匹配绑定世代。离线缓存以本机OS账户文件边界为信任根，不能抵御已控制本机文件系统的攻击者。

播放器使用 tingxu-media 自定义协议的临时不透明租约；媒体校验放后台且不持有全局锁，注册租约前再次验证世代。每次Range最多256KiB；不开放asset文件系统scope。退出/切会/卸载撤销租约并停止媒体，浏览器不能删除带原生录音的历史。用户在既有删除确认后删除历史时同时删除对应当前账号录音；失败保留历史供重试。未被历史关联的崩溃录音暂未提供自动发现/清理界面。

# 数据库迁移与容灾管理规范（MIGRATIONS）

**项目名称：** 听序（Tingxu）  
**文档版本：** v0.2  
**最后更新：** 2026-10-30  
**适用范围：** 本地 SQLite 升级迁移与服务端 PostgreSQL 数据库架构演进  

---

## 1. 客户端 SQLite 版本迁移机制

桌面软件客户端无法强制所有用户在同一时间完成全量更新，本地 SQLite 数据库升级必须遵循严格的前后兼容策略。

### 1.1 `user_version` 版本戳管理
SQLite 原生提供 `PRAGMA user_version` 用于标记与查询用户当前的数据库版本结构：

```rust
// Rust 客户端数据库初始化伪代码示例
pub fn run_migrations(conn: &mut Connection) -> Result<(), rusqlite::Error> {
    let current_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    if current_version < 1 {
        // 执行 v1 初始化脚本：建 meetings, audio_segments, transcript_segments, FTS5 虚表
        conn.execute_batch(SCHEMA_V1)?;
        conn.execute("PRAGMA user_version = 1", [])?;
    }

    if current_version < 2 {
        // 执行 v2 增量升级：新增 insight_items, insight_revisions, meeting_questions 表
        conn.execute_batch(MIGRATION_V1_TO_V2)?;
        conn.execute("PRAGMA user_version = 2", [])?;
    }

    Ok(())
}
```

### 1.2 本地迁移安全规则
1. **自动备份机制**：执行任何大版本 DDL 变更前，客户端必须先将当前的 `tingxu.db` 拷贝一份为 `tingxu.db.bak_{timestamp}`；若迁移失败，自动回滚恢复旧文件并提示用户，禁止使数据库处于半迁移的损坏状态。
2. **严禁破坏性清表**：升级脚本绝对禁止包含 `DROP TABLE` 或清空用户历史会议记录的语句；字段重命名或废弃应通过 `ALTER TABLE ADD COLUMN` 渐进式废止。

---

## 2. 云端 PostgreSQL 迁移规范

服务端采用版本受控的迁移工具（如 TypeORM Migrations / Prisma Migrate），与代码库版本严格绑定。

### 2.1 迁移执行生命周期
1. **CI 自动化校验**：在 PR 阶段，CI 会针对全新的空数据库自动运行完整的迁移脚本，并验证逆向 `down()` 回滚能力。
2. **生产零停机发布（Zero-Downtime）**：
   - 字段扩展遵循“先加字段 $\rightarrow$ 业务双写 $\rightarrow$ 历史数据刷库 $\rightarrow$ 废弃旧字段”的四步平滑演进；
   - 严禁在高频交易表（如 `orders`, `usage_ledgers`）上执行长时间独占锁表的操作。

---

## 3. 容灾恢复与数据损坏自愈

1. **SQLite 异常断电检测**：在启动时执行 `PRAGMA integrity_check;`。若检测到损坏，利用预备的 `.bak` 备份文件尝试修复。
2. **孤立音频片段扫描（Orphan Segment Scan）**：若操作系统异常断电，应用重启时扫描录音分片目录，比对 `audio_segments` 表与物理磁盘文件的校验和（Checksum），将未完成登记的碎片自动归档入“已恢复会议”容器。

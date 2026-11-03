# 本地录音存储空间用量统计与定期清理实施计划

**Plan ID：** `016-local-recording-storage-cleanup`  
**创建时间：** 2026-11-02  
**当前状态：** 进行中（用户已确认需求与默认“不自动清理”策略）  
**负责人：** 主执行者  
**目标：** 在保障会议文字、纪要与思维导图 100% 留存的前提下，为本地物理录音（PCM 切片与 WAV）提供存储空间感知、手动一键释放，以及可配置保留天数的定期自动清理机制。

---

## 0. 状态管理

- [x] G0：用户确认需求与策略决策（支持手动清理、支持定期清理，默认不自动清理，由用户手动开启天数限制）。
- [x] M1：Rust 底层用量统计与原子清理指令（红/绿 TDD 测试通过）。
- [x] M2：前端 Store、IPC 封装与自动清理执行器。
- [x] M3：设置页与会议总结页“本地存储与录音管理”UI 视觉与交互落地。
- [x] M4：全量 Harness 门禁（verify-gates.sh）验证通过。

| ID | 任务 | 模式 | 依赖 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 完成证据 |
|---|---|---|---|---|---|---|---|---|---|
| T01 | 存储清理协议与数据模型设计（Rust & TS） | 串行 | 无 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | - | StorageUsage / PruneResult 定义完成 |
| T02 | Rust 录音用量统计与按时间切分物理清理实现 | 串行 | T01 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | - | recording.rs / recording_commands.rs |
| T03 | Rust 单元测试（用量统计、过期清理、路径边界与沙箱防逃逸） | 串行 | T02 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | - | cargo test recording_test 全部通过 |
| T04 | 前端 IPC 封装（getStorageUsage / pruneRecordings） | 串行 | T03 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | - | localRecording.ts 接口封装 |
| T05 | Store 存储策略配置持久化与自动清理触发器 | 串行 | T04 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | - | useMeetingStore.ts / vitest 全部通过 |
| T06 | 设置页“本地存储与录音管理”UI 组件与弹窗交互实现 | 串行 | T05 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | - | SettingsView.tsx & MeetingAudioPlayer |
| T07 | 前端 TDD 测试用例与 QA data-testid 门禁验证 | 串行 | T06 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | - | 43 套件 238 项前端测试全部通过 |
| T08 | 全量 Harness 质量门禁与工程规范验证 | 串行 | T07 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | - | bash scripts/verify-gates.sh 全部通过 |

---

## 1. 需求、现状与边界

### 1.1 背景与现状
- 在 Plan 015 中实现了本地录音全流程落盘（16kHz PCM + WAV，约 220MB/小时），存放于 `recordings-v1/<SHA256(userId)>/<UUID>/`。
- 目前系统仅在“删除历史会议”时连带删除录音；缺少针对音频大文件的单独容量统计、无独立清理音频保留文字的功能，也没有定期自动淘汰老旧录音的机制，长时间使用会不断消耗磁盘空间。

### 1.2 铁律与范围边界
- **保文本、释音频**：严禁清理用户的会议标题、逐字稿正文、待办事项和思维导图；只删除物理大文件 `audio.wav`、`slice-*.pcm` 和 `manifest.json`。
- **账号隔离与防目录穿越**：清理操作必须通过 Rust 原生 `bind_recording_identity` 校验，只能操作当前已登录账号目录下的 UUID 文件夹，严禁超出 `recordings-v1` 根目录。
- **默认策略尊重用户**：默认自动清理规则为 `0`（不自动清理），用户可在设置中选择保留 7 天、14 天、30 天或 90 天。

---

## 2. 接口契约定义

### 2.1 Rust IPC 命令
1. `get_recording_storage_usage(identity: u64) -> Result<StorageUsage, TingxuError>`
   ```rust
   pub struct StorageUsage {
       pub total_bytes: u64,
       pub recording_count: u32,
   }
   ```
2. `prune_local_recordings(identity: u64, older_than_secs: Option<u64>, target_ids: Option<Vec<String>>) -> Result<PruneResult, TingxuError>`
   ```rust
   pub struct PruneResult {
       pub freed_bytes: u64,
       pub deleted_count: u32,
       pub deleted_ids: Vec<String>,
   }
   ```

### 2.2 前端存储策略持久化（localStorage）
`tingxu_storage_settings`:
```typescript
export interface StorageSettings {
  autoCleanupDays: number; // 0 = 从不清理, 7, 14, 30, 90
  lastCleanupAt?: number;
}
```

---

## 3. 验收标准（AC）
- **AC-01**：在“系统设置”中展示“💾 本地存储与录音管理”卡片，清晰呈现已占用磁盘容量与录音场数，数字采用 `tabular-nums`。
- **AC-02**：支持手动“立即清理所有录音”与“清理 30 天前录音”，清理时弹出确认警告，点击确认后物理删除对应音频，释放磁盘空间。
- **AC-03**：清理后对应的会议文字、逐字稿、洞察全部保留；在总结页中播放器安全降级为“本地录音已清理以释放磁盘，文字纪要完整保留”。
- **AC-04**：设置项支持切换自动清理周期（从不、7天、14天、30天、90天），修改即时持久化；在应用启动或新会议完成保存时，若策略启用则自动触发过期物理音频清理。
- **AC-05**：所有前端交互控件与展示元素 100% 覆盖符合 AGENTS.md 规范的 `data-testid`。
- **AC-06**：Rust 层杜绝裸 `.unwrap()`，所有错误转换为 `TingxuError`；通过全量单元测试与 Harness 门禁。

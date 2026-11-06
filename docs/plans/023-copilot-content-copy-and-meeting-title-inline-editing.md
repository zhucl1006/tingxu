# Plan 023: Copilot 内容一键复制与会议标题自主编辑及重新提炼

- **Plan ID**: `023-copilot-content-copy-and-meeting-title-inline-editing`
- **创建时间**: 2026-11-05
- **当前状态**: 已完成 (Completed)
- **关联需求**: 用户反馈 Copilot 对应内容需要可复制；会议标题（Title）需支持自行就地修改，并支持会后一键重新提炼主题，解决当前标题与业务主题脱节的痛点。

---

## 1. 目标与价值

1. **Copilot 内容一键复制 (Copilot Content Copying)**：
   - 会后 Copilot 问答面板中，每条 AI 回复气泡、提案卡片、用户提问均支持一键复制到剪贴板，提供短暂的 `✓ 已复制` 绿色微反馈，大幅提升协作分享效率。
   - 会中实时 Q&A 问答卡片同样支持一键复制回答正文。
2. **会议标题自主编辑 (Meeting Title Inline Editing)**：
   - 彻底打破标题只读限制，会后纪要详情页支持点击标题或铅笔图标就地编辑（Inline Edit），支持回车/保存/取消，同步持久化到本地存储并联动待办。
   - 会中顶栏标题支持随时编辑修正。
   - 首页历史会议卡片支持快速编辑重命名。
3. **会后【重新提炼主题】(Regenerate Title by AI)**：
   - 提供一键【🤖 重新提炼主题】能力，通过大模型重读全场逐字稿并强力过滤开场白寒暄与测试杂音，萃取切题精准的会议标题。
4. **算法与 Prompt 降噪提炼优化**：
   - 完善会议总结与标题生成的 Prompt 指引，严禁使用“喂喂/听得到吗/测试”等开场闲聊命名，彻底废除粗暴的首句截取兜底逻辑。

---

## 2. 详细研发任务清单

- [x] Task 1: Store 状态层支持 `updateHistoryMeetingTitle(meetingId, newTitle)` 与 `regenerateMeetingTitle(meetingId)`
- [x] Task 2: 会后 Copilot 消息气泡、提案卡片及会中 Q&A 卡片【一键复制】按钮与动效提示
- [x] Task 3: 会议纪要页（MeetingSummaryView）实现标题就地编辑（Inline Editing）与键盘快捷键
- [x] Task 4: 会议纪要页实现【重新提炼主题】按钮与异步生成交互
- [x] Task 5: 优化 AI Gateway 的标题提炼 Prompt 与离线 Fallback 算法，彻底杜绝开场测试闲聊入题
- [x] Task 6: 编写 TDD 单元测试覆盖上述所有功能，全量跑通 5 大工程门禁验证

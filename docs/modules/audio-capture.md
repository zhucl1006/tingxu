# 模块设计：双轨无感音频采集（audio-capture）

**模块名称：** `audio-capture`  
**代码路径：** `src-tauri/src/media/`  
**负责人：** 听序核心系统研发组  
**最后更新：** 2026-10-30  

---

## 1. 模块定位与核心职责

`audio-capture` 是听序桌面客户端最底层的生命线模块。其核心职责是在 **不安装任何虚拟声卡驱动、不向会议添加机器人** 的前提下，实现对 Windows 与 macOS 两大操作系统的物理双轨硬件级音频捕获。

- **Track 1（本地我方）**：捕获麦克风默认输入设备；
- **Track 2（远端对方）**：免驱内录系统扬声器混音输出（捕获来自 Teams/腾讯会议/飞书等远端所有人的声音）；
- **音频标准化**：统一双轨重采样（Resample）为工业级 ASR 标准单声道 16kHz、16-bit PCM 流；
- **本地高保真落盘**：以 2 秒为原子周期写入本地磁盘，防止因断电或程序崩溃丢失物理录音。

---

## 2. 跨平台底层技术实现

### 2.1 Windows 平台：WASAPI Loopback 捕获
- 通过 `windows-rs` crate 直接调用 Windows 核心音频 API `IMMDeviceEnumerator`。
- 获取默认音频渲染端点（`eRender`, `eConsole`），激活 `IAudioClient` 并开启 `AUDCLNT_STREAMFLAGS_LOOPBACK` 标志位。
- 采用事件驱动模式（Event-driven Mode），当音频缓冲区就绪时触发系统级事件，将 PCM 缓冲推入 Rust 双通道环形队列。

### 2.2 macOS 平台：ScreenCaptureKit 音频通道
- 在 macOS 13+ 系统上，通过 Objective-C / Swift C-FFI 绑定调用苹果官方的 `ScreenCaptureKit`。
- 配置 `SCStreamConfiguration`，仅开启音频捕获（`capturesAudio = true`），关闭视频画面编码以将 CPU 占用降至 $<1\%$。
- 监听 `stream:didOutputSampleBuffer:ofType:` 回调，提取 CoreAudio CMSampleBuffer 音频包。

### 2.3 环形缓冲与重采样流水线

```
[麦克风输入 (如 48kHz Stereo)] ──► [重采样器 SincResampler] ──► [通道 1: 16kHz 16bit PCM] ┐
                                                                                           ├──► [原子落盘 Thread]
[系统输出 (如 44.1kHz Stereo)] ──► [重采样器 SincResampler] ──► [通道 2: 16kHz 16bit PCM] ┘         ↓
                                                                                           [ASR 发送 Thread]
```

---

## 3. 容错与回声消除（AEC）策略

1. **佩戴耳机最佳实践引导**：在用户开启录制时检测当前音频输出设备；若检测为内置外放扬声器，弹窗温馨提示“佩戴耳机开会可获得最完美的发言人隔离体验”。
2. **WebRTC AEC3 轻量集成**：当检测到外放且麦克风捕获到疑似扬声器回音时，激活轻量回声消除模块，对本地麦克风音频进行自适应滤波对齐。
3. **设备热插拔自适应**：监听系统音频设备变更事件（如拔出蓝牙耳机切回内置扬声器），无需用户重启会议，在 500ms 内平滑完成采集重连接。

## 计划015实施补充（2026-11-02）

当前桌面实际入口为 Web Audio/原生系统声音经 `RealAudioCapture` 混合后的 16kHz 单声道 PCM16，并未实现历史文档所述独立双轨归档。`localRecording.ts` 每块投递 Tauri 命令，前端排队最多1MiB，原生后台队列32块、单块最多64KiB；过载/磁盘错误明确降级，不将不完整录音显示为可播放。

后台每2秒保存原子PCM及SHA256/真实startSample清单，暂停刷尾片，结束流式生成WAV；不将全场PCM放入前端内存。PCM及WAV会同时留存，约220MiB/小时（各约110MiB）；声音仅本机保存，无新增云录音上传。崩溃未提交的暂存块不能保证恢复。

新逐字稿 `recordingBeginMs/recordingEndMs` 使用会议连续采样时钟。暂停间隙不插静音；每次ASR会话在READY后首个发送样本绑定偏移，握手前PCM只本地保存，避免网关有限预缓冲造成错位。缺时间的旧句不猜测音频位置。

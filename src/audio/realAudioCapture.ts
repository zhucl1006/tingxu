/**
 * 听序（Tingxu）— 真实麦克风 Web Audio 物理采集与 16kHz PCM 编码器
 */

export type CaptureMode = 'speaker_meeting' | 'mic_only';

export interface RealAudioCaptureOptions {
  sampleRate?: number;
  bufferSize?: number;
  deviceId?: string;
  auxDeviceId?: string;
  captureMode?: CaptureMode;
  onAudioChunk?: (pcmChunk: ArrayBuffer) => void;
  onRmsLevel?: (rms: number) => void;
  onDeviceEnded?: () => void;
  onDeviceChange?: () => void;
  onSystemAudioStateChange?: (active: boolean) => void;
}

/**
 * 将 Float32 音频数据 [-1.0, 1.0] 编码为 16-bit 线性 PCM ArrayBuffer
 */
export function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new ArrayBuffer(input.length * 2);
  const view = new DataView(output);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return output;
}

/**
 * 高保真抗混叠降采样器：将任意采样率（如 48000Hz、44100Hz）抗混叠重采样至 16000Hz
 * 具备积分平均低通抗混叠特性，杜绝 CoreAudio 重采样高频毛刺与时钟抖动
 */
export function downsampleTo16kHz(
  input: Float32Array,
  sampleRate: number
): Float32Array {
  if (sampleRate === 16000 || input.length === 0) {
    return input;
  }
  const ratio = sampleRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : input[offsetBuffer] || 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * 听序（Tingxu）— 双轨音频时钟对齐混音器 (Dual-Track Synchronous Audio Mixer)
 * 解决麦克风（本人声音）与系统内录（Teams 对方声音）并发独立推流导致的采样率翻倍与时序错乱问题。
 * 以硬件麦克风中断为主节拍，将两路 PCM 在同一个 16kHz 时钟下点对点线性相加，并附带软限幅防爆音。
 */
export class DualTrackAudioMixer {
  private sysBuffer: number[] = [];
  private isSystemActive: boolean = false;
  private onDirectSysChunk: ((chunk: ArrayBuffer) => void) | null = null;
  private flushTimer: any = null;

  constructor(onDirectSysChunk?: (chunk: ArrayBuffer) => void) {
    this.onDirectSysChunk = onDirectSysChunk || null;
  }

  public setSystemActive(active: boolean): void {
    this.isSystemActive = active;
    if (!active) {
      this.sysBuffer = [];
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
    }
  }

  public pushSysChunk(chunk: ArrayBuffer): void {
    const view = new Int16Array(chunk);
    for (let i = 0; i < view.length; i++) {
      this.sysBuffer.push(view[i]);
    }
    // 防止内存积压，限制最大缓冲不超过 1 秒 (16000 样点)
    if (this.sysBuffer.length > 32000) {
      this.sysBuffer.splice(0, this.sysBuffer.length - 16000);
    }

    // 若长时间没有麦克风帧消费 (例如麦克风被系统禁音/独立使用系统内录)，自动排空输出
    if (!this.flushTimer && this.onDirectSysChunk) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        if (this.sysBuffer.length >= 1600 && this.onDirectSysChunk) {
          const slice = this.sysBuffer.splice(0, 1600);
          const buf = new ArrayBuffer(slice.length * 2);
          const v = new Int16Array(buf);
          for (let i = 0; i < slice.length; i++) v[i] = slice[i];
          this.onDirectSysChunk(buf);
        }
      }, 120);
    }
  }

  public mixWithMic(micChunk: ArrayBuffer): ArrayBuffer {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (!this.isSystemActive || this.sysBuffer.length === 0) {
      return micChunk;
    }

    const micView = new Int16Array(micChunk);
    const count = micView.length;
    const outBuffer = new ArrayBuffer(count * 2);
    const outView = new Int16Array(outBuffer);

    // 从系统缓冲中取出 count 个样点按时钟精准对齐混音
    const sysSlice = this.sysBuffer.splice(0, count);

    for (let i = 0; i < count; i++) {
      const m = micView[i];
      const s = i < sysSlice.length ? sysSlice[i] : 0;
      let sum = m + s;
      if (sum > 32767) sum = 32767;
      else if (sum < -32768) sum = -32768;
      outView[i] = sum;
    }

    return outBuffer;
  }
}

/**
 * 计算音频帧的均方根能量 (Root Mean Square) 并归一化到 [0, 1]
 */
export function calculateRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 3);
}

export class RealAudioCapture {
  private options: Required<RealAudioCaptureOptions>;
  private stream: MediaStream | null = null;
  private auxStream: MediaStream | null = null;
  private systemStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private auxSource: MediaStreamAudioSourceNode | null = null;
  private systemSource: MediaStreamAudioSourceNode | null = null;
  private capturing: boolean = false;
  private deviceChangeListener: (() => void) | null = null;
  private isTauriSystemAudioCapturing: boolean = false;
  private unlistenSystemAudio: (() => void) | null = null;
  private systemStopPromise: Promise<void> | null = null;
  private tauriInvoke: (<T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | null = null;
  private silenceGain: GainNode | null = null;
  private dualTrackMixer: DualTrackAudioMixer;

  constructor(options?: RealAudioCaptureOptions) {
    this.options = {
      sampleRate: options?.sampleRate || 16000,
      bufferSize: options?.bufferSize || 4096,
      deviceId: options?.deviceId || '',
      auxDeviceId: options?.auxDeviceId || '',
      captureMode: options?.captureMode || 'speaker_meeting',
      onAudioChunk: options?.onAudioChunk || (() => {}),
      onRmsLevel: options?.onRmsLevel || (() => {}),
      onDeviceEnded: options?.onDeviceEnded || (() => {}),
      onDeviceChange: options?.onDeviceChange || (() => {}),
      onSystemAudioStateChange: options?.onSystemAudioStateChange || (() => {}),
    };
    this.dualTrackMixer = new DualTrackAudioMixer((chunk) => {
      this.options.onAudioChunk(chunk);
    });
  }

  public getCaptureMode(): CaptureMode {
    return this.options.captureMode;
  }

  public async setCaptureMode(mode: CaptureMode): Promise<void> {
    if (this.options.captureMode === mode) return;
    this.options.captureMode = mode;
    if (this.capturing) {
      await this.restart();
    }
  }

  public async start(): Promise<void> {
    if (this.capturing) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前运行环境不支持 Web Audio API / 麦克风录音权限');
    }

    try {
      // 1. 请求物理麦克风权限与音频流（支持指定 deviceId 与模式）
      // 当处于 speaker_meeting（扬声器外放开会）模式且未开启系统数字内录时，关闭 echoCancellation 与 noiseSuppression，
      // 确保扬声器放出的声音能灵敏收音；若已开启系统音频内录（如戴耳机通过 ScreenCaptureKit 无损截流），
      // 则麦克风自动启用降噪与回声消除，杜绝耳机侧音杂音与环境底噪。
      const isMeetingMode = this.options.captureMode === 'speaker_meeting' && !this.isSystemAudioCapturing();
      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        sampleRate: this.options.sampleRate,
        echoCancellation: !isMeetingMode,
        noiseSuppression: !isMeetingMode,
        autoGainControl: true,
      };
      if (this.options.deviceId) {
        audioConstraints.deviceId = { exact: this.options.deviceId };
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      // 监听音轨终止事件 (例如蓝牙耳机断开或被系统拔出)
      const audioTracks = this.stream.getAudioTracks ? this.stream.getAudioTracks() : this.stream.getTracks();
      audioTracks.forEach((track) => {
        track.onended = () => {
          console.warn('[RealAudioCapture] 当前音频轨道已断开 (例如蓝牙耳机断开/关闭)');
          this.options.onDeviceEnded();
        };
      });

      // 监听系统设备热插拔变动
      if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
        this.deviceChangeListener = () => {
          console.info('[RealAudioCapture] 检测到系统音频输入设备列表变动');
          this.options.onDeviceChange();
        };
        navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeListener);
      }

      // 2. 初始化 AudioContext
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      try {
        // 优先允许 AudioContext 自适应声卡硬件原生采样率（如 48k/44.1k），
        // 避免强制 16000Hz 导致 macOS CoreAudio 蓝牙时钟争抢及重采样杂音
        this.audioContext = new AudioCtx();
      } catch {
        this.audioContext = new AudioCtx({ sampleRate: this.options.sampleRate });
      }

      // 3. 构建节点图
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(this.options.bufferSize, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.capturing) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // 彻底清空所有输出声道缓冲区（无论单双声道），100% 杜绝漏音与爆音杂音
        if (e.outputBuffer) {
          const channels = e.outputBuffer.numberOfChannels || 1;
          for (let ch = 0; ch < channels; ch++) {
            if (typeof e.outputBuffer.getChannelData === 'function') {
              e.outputBuffer.getChannelData(ch).fill(0);
            }
          }
        }

        // 高保真降采样至 16000Hz (若当前声卡运行在 48kHz/44.1kHz)
        const currentRate = this.audioContext ? this.audioContext.sampleRate : this.options.sampleRate;
        const resampledData =
          currentRate === this.options.sampleRate
            ? inputData
            : downsampleTo16kHz(inputData, currentRate);

        // 计算真实电平并回调通知
        const rms = calculateRms(resampledData);
        this.options.onRmsLevel(rms);

        // 转换为 16-bit 线性 PCM 并通过双轨时钟对齐混音器派发（防止时钟错位与数据率翻倍）
        const pcmBuffer = floatTo16BitPCM(resampledData);
        const alignedBuffer = this.dualTrackMixer.mixWithMic(pcmBuffer);
        this.options.onAudioChunk(alignedBuffer);
      };

      this.source.connect(this.processor);

      // 4. 如果配置了辅助会议音频通道 (如 Microsoft Teams Audio)，同时捕获并混音
      if (this.options.auxDeviceId) {
        try {
          this.auxStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: this.options.auxDeviceId },
              channelCount: 1,
              sampleRate: this.options.sampleRate,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: true,
            },
          });
          this.auxSource = this.audioContext.createMediaStreamSource(this.auxStream);
          this.auxSource.connect(this.processor);
          console.info(`[RealAudioCapture] 辅助会议音频通道 (Teams/内录) 已成功混音并轨: ${this.options.auxDeviceId}`);
        } catch (e) {
          console.warn('[RealAudioCapture] 辅助会议音频通道初始化失败:', e);
        }
      }

      // 如果此前已开启系统内录音频，自动将其混音连入当前 AudioContext 节点
      if (this.systemStream && this.systemStream.active) {
        this.attachSystemAudioStream(this.systemStream);
      }

      // 核心物理隔离：建立增益为 0 的静音节点，杜绝任何麦克风串音直通扬声器/耳机硬件
      if (typeof this.audioContext.createGain === 'function') {
        this.silenceGain = this.audioContext.createGain();
        this.silenceGain.gain.setValueAtTime(0, this.audioContext.currentTime);
        this.processor.connect(this.silenceGain);
        if (this.audioContext.destination) {
          this.silenceGain.connect(this.audioContext.destination);
        }
      } else if (this.audioContext.destination) {
        this.processor.connect(this.audioContext.destination);
      }

      if (this.audioContext.state === 'suspended') {
        let resumeTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.audioContext.resume(),
            new Promise<never>((_, reject) => {
              resumeTimer = setTimeout(() => reject(new Error('音频设备启动超时，请重新开始录音')), 3000);
            }),
          ]);
        } finally { if (resumeTimer) clearTimeout(resumeTimer); }
      }
      this.capturing = true;
    } catch (err) {
      this.capturing = false;
      if (this.deviceChangeListener && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeListener);
        this.deviceChangeListener = null;
      }
      if (this.silenceGain) { this.silenceGain.disconnect(); this.silenceGain = null; }
      if (this.auxSource) { this.auxSource.disconnect(); this.auxSource = null; }
      if (this.auxStream) {
        this.auxStream.getTracks().forEach(track => track.stop());
        this.auxStream = null;
      }
      if (this.processor) {
        this.processor.onaudioprocess = null;
        this.processor.disconnect();
        this.processor = null;
      }
      if (this.source) { this.source.disconnect(); this.source = null; }
      const failedContext = this.audioContext;
      this.audioContext = null;
      if (failedContext) void failedContext.close().catch(() => {});
      // 发生异常时，立即释放已获取的系统麦克风音轨，防止设备指示灯常驻
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      throw err;
    }
  }

  /**
   * 启动系统扬声器数字内录（优先通过 macOS 原生 ScreenCaptureKit，Web 降级走 getDisplayMedia）
   * 适合戴耳机开会场景，直接无损采集 Teams/远端参会者的数字音频流
   */
  public async startSystemAudioCapture(): Promise<void> {
    if (this.systemStopPromise) await this.systemStopPromise;
    this.systemStopPromise = null;
    // 1. 优先检测是否运行在 Tauri 桌面端原生环境中 (利用 macOS ScreenCaptureKit 无损数字截流)
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');
        this.tauriInvoke = invoke;

        // 避免重复监听
        if (this.unlistenSystemAudio) {
          this.unlistenSystemAudio();
          this.unlistenSystemAudio = null;
        }

        this.unlistenSystemAudio = await listen<string>('tingxu://system-audio-chunk', (event) => {
          try {
            const binaryStr =
              typeof atob === 'function'
                ? atob(event.payload)
                : Buffer.from(event.payload, 'base64').toString('binary');
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const pcmBuffer = bytes.buffer;

            // 计算系统声音 RMS 电平以灵敏反映声音活跃度
            const int16View = new Int16Array(pcmBuffer);
            let sumSq = 0;
            for (let i = 0; i < int16View.length; i++) {
              const norm = int16View[i] / 32768.0;
              sumSq += norm * norm;
            }
            const rms = Math.min(1, Math.sqrt(sumSq / Math.max(1, int16View.length)) * 3);
            if (rms > 0.01) {
              this.options.onRmsLevel(rms);
            }

            // 推入双轨时钟对齐混音器，在同一 16kHz 时钟节拍下与麦克风精准并轨输出（防止数据率翻倍与多人抢话时序撕裂）
            if (this.capturing) {
              this.dualTrackMixer.pushSysChunk(pcmBuffer);
            } else {
              this.options.onAudioChunk(pcmBuffer);
            }
          } catch (err) {
            console.warn('[RealAudioCapture] 原生系统音频解码异常:', err);
          }
        });

        await invoke('start_system_audio_capture');
        this.isTauriSystemAudioCapturing = true;
        this.dualTrackMixer.setSystemActive(true);
        this.options.onSystemAudioStateChange(true);
        console.info('[RealAudioCapture] macOS 原生 ScreenCaptureKit 免驱系统音频内录已激活');
        return;
      } catch (tauriErr) {
        if (this.unlistenSystemAudio) {
          this.unlistenSystemAudio();
          this.unlistenSystemAudio = null;
        }
        this.isTauriSystemAudioCapturing = false;
        this.options.onSystemAudioStateChange(false);
        throw tauriErr;
      }
    }

    // 2. 纯 Web 浏览器环境降级走 getDisplayMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('当前系统环境不支持免驱系统音频内录通道 (getDisplayMedia)');
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = displayStream.getAudioTracks ? displayStream.getAudioTracks() : [];
      if (audioTracks.length === 0) {
        // 用户未勾选“共享音频”
        displayStream.getTracks().forEach((t) => t.stop());
        throw new Error('未检测到系统音频，请在授权弹窗中勾选【共享音频】');
      }

      // 停止不必要的视频流，释放 GPU/渲染资源
      displayStream.getVideoTracks().forEach((t) => t.stop());

      this.systemStream = displayStream;
      audioTracks.forEach((track) => {
        track.onended = () => {
          void this.stopSystemAudioCapture().catch(() => {
            this.options.onSystemAudioStateChange(false);
          });
        };
      });

      if (this.audioContext && this.processor) {
        this.attachSystemAudioStream(this.systemStream);
      }

      this.options.onSystemAudioStateChange(true);
    } catch (err) {
      this.options.onSystemAudioStateChange(false);
      throw err;
    }
  }

  private attachSystemAudioStream(stream: MediaStream): void {
    if (!this.audioContext || !this.processor) return;
    try {
      if (this.systemSource) {
        this.systemSource.disconnect();
      }
      this.systemSource = this.audioContext.createMediaStreamSource(stream);
      // Web Audio API: 多个 source 节点同时 connect 到同一个 processor，会自动以高保真浮点线性相加混音
      this.systemSource.connect(this.processor);
      console.info('[RealAudioCapture] 系统内部扬声器音频流已成功混音并轨');
    } catch (e) {
      console.warn('[RealAudioCapture] 混音系统音频流异常:', e);
    }
  }

  public stopSystemAudioCapture(): Promise<void> {
    if (this.systemStopPromise) return this.systemStopPromise;
    let nativeStop: Promise<unknown> = Promise.resolve();
    if (this.isTauriSystemAudioCapturing) {
      if (this.tauriInvoke) {
        nativeStop = this.tauriInvoke('stop_system_audio_capture');
      } else if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        nativeStop = import('@tauri-apps/api/core').then(({ invoke }) => invoke('stop_system_audio_capture'));
      }
      if (this.unlistenSystemAudio) {
        this.unlistenSystemAudio();
        this.unlistenSystemAudio = null;
      }
      this.isTauriSystemAudioCapturing = false;
      this.dualTrackMixer.setSystemActive(false);
      this.options.onSystemAudioStateChange(false);
    }

    if (this.systemSource) {
      try {
        this.systemSource.disconnect();
      } catch {}
      this.systemSource = null;
    }
    if (this.systemStream) {
      this.systemStream.getTracks().forEach((t) => t.stop());
      this.systemStream = null;
    }
    if (!this.isTauriSystemAudioCapturing) {
      this.options.onSystemAudioStateChange(false);
    }
    this.systemStopPromise = nativeStop.then(() => {});
    return this.systemStopPromise;
  }

  public isSystemAudioCapturing(): boolean {
    return this.isTauriSystemAudioCapturing || !!(this.systemStream && this.systemStream.active);
  }

  public isAuxAudioCapturing(): boolean {
    return !!(this.auxStream && this.auxStream.active !== false);
  }

  public async switchAuxDevice(newAuxDeviceId?: string): Promise<void> {
    this.options.auxDeviceId = newAuxDeviceId || '';
    if (this.auxSource) {
      try {
        this.auxSource.disconnect();
      } catch {}
      this.auxSource = null;
    }
    if (this.auxStream) {
      this.auxStream.getTracks().forEach((t) => t.stop());
      this.auxStream = null;
    }

    if (newAuxDeviceId && this.capturing && this.audioContext && this.processor) {
      try {
        this.auxStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: newAuxDeviceId },
            channelCount: 1,
            sampleRate: this.options.sampleRate,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
          },
        });
        this.auxSource = this.audioContext.createMediaStreamSource(this.auxStream);
        this.auxSource.connect(this.processor);
        console.info(`[RealAudioCapture] 已切换辅助音频设备: ${newAuxDeviceId}`);
      } catch (e) {
        console.warn('[RealAudioCapture] 切换辅助音频设备失败:', e);
      }
    }
  }

  public async switchDevice(newDeviceId?: string): Promise<void> {
    this.options.deviceId = newDeviceId || '';
    if (this.capturing) {
      await this.restart();
    }
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  public static async getAvailableMicrophones(): Promise<Array<{ deviceId: string; label: string }>> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `系统麦克风 ${index + 1}`,
        }));
    } catch {
      return [];
    }
  }

  public async stop(): Promise<void> {
    this.capturing = false;

    if (this.deviceChangeListener && navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeListener);
      this.deviceChangeListener = null;
    }

    if (this.silenceGain) {
      if (typeof this.silenceGain.disconnect === 'function') {
        this.silenceGain.disconnect();
      }
      this.silenceGain = null;
    }

    if (this.processor) {
      if (typeof this.processor.disconnect === 'function') {
        this.processor.disconnect();
      }
      this.processor.onaudioprocess = null;
      this.processor = null;
    }

    if (this.source) {
      if (typeof this.source.disconnect === 'function') {
        this.source.disconnect();
      }
      this.source = null;
    }

    if (this.auxSource) {
      if (typeof this.auxSource.disconnect === 'function') {
        this.auxSource.disconnect();
      }
      this.auxSource = null;
    }

    if (this.auxStream) {
      this.auxStream.getTracks().forEach((track) => track.stop());
      this.auxStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch {
        // 忽略关闭异常
      }
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    await this.stopSystemAudioCapture();

    this.options.onRmsLevel(0);
  }

  public isCapturing(): boolean {
    return this.capturing;
  }
}

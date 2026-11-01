/**
 * 听序（Tingxu）— 真实麦克风 Web Audio 物理采集与 16kHz PCM 编码器
 */

export interface RealAudioCaptureOptions {
  sampleRate?: number;
  bufferSize?: number;
  deviceId?: string;
  onAudioChunk?: (pcmChunk: ArrayBuffer) => void;
  onRmsLevel?: (rms: number) => void;
  onDeviceEnded?: () => void;
  onDeviceChange?: () => void;
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
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private capturing: boolean = false;
  private deviceChangeListener: (() => void) | null = null;

  constructor(options?: RealAudioCaptureOptions) {
    this.options = {
      sampleRate: options?.sampleRate || 16000,
      bufferSize: options?.bufferSize || 4096,
      deviceId: options?.deviceId || '',
      onAudioChunk: options?.onAudioChunk || (() => {}),
      onRmsLevel: options?.onRmsLevel || (() => {}),
      onDeviceEnded: options?.onDeviceEnded || (() => {}),
      onDeviceChange: options?.onDeviceChange || (() => {}),
    };
  }

  public async start(): Promise<void> {
    if (this.capturing) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前运行环境不支持 Web Audio API / 麦克风录音权限');
    }

    try {
      // 1. 请求物理麦克风权限与音频流（支持指定 deviceId）
      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        sampleRate: this.options.sampleRate,
        echoCancellation: true,
        noiseSuppression: true,
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
      this.audioContext = new AudioCtx({ sampleRate: this.options.sampleRate });

      // 3. 构建节点图
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(this.options.bufferSize, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.capturing) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // 静音输出缓冲区，防止输入音频串扰至扬声器产生环境回环啸叫
        if (e.outputBuffer && typeof e.outputBuffer.getChannelData === 'function') {
          e.outputBuffer.getChannelData(0).fill(0);
        }

        // 计算真实电平并回调通知
        const rms = calculateRms(inputData);
        this.options.onRmsLevel(rms);

        // 转换为 16-bit 线性 PCM 并分片推流
        const pcmBuffer = floatTo16BitPCM(inputData);
        this.options.onAudioChunk(pcmBuffer);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.capturing = true;
    } catch (err) {
      // 发生异常时，立即释放已获取的系统麦克风音轨，防止设备指示灯常驻
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      throw err;
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

    this.options.onRmsLevel(0);
  }

  public isCapturing(): boolean {
    return this.capturing;
  }
}

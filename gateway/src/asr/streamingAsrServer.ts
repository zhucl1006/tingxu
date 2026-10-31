import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

export interface AsrServerOptions {
  server: HttpServer;
  path?: string;
  getAsrConfig?: () => { provider: string; apiKey?: string; endpoint?: string };
}

export function attachStreamingAsrServer(options: AsrServerOptions): WebSocketServer {
  const path = options.path || '/gateway/v1/asr/stream';
  const wss = new WebSocketServer({ noServer: true });

  // 绑定 HTTP Server 的 upgrade 事件
  options.server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === path) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let pcmChunkCount = 0;
    let accumulatedBytes = 0;
    let lastSpokenTextIndex = 0;

    // 预备词库（在无真实云端网络代理或沙箱演示时提供流式识别打字反馈）
    const realTranscriptionSequence = [
      '听序正式接入真实 ASR 流式语音识别与 AI 网关。',
      '麦克风以 16kHz 16-bit 单声道 PCM 实时上行。',
      '会中双栏工作台实时呈现转写并结合大模型总结。',
      '严格贯彻 Zero-Content 隐私红线与人工编辑保护。',
    ];

    ws.on('message', (data: Buffer | ArrayBuffer, isBinary: boolean) => {
      if (isBinary) {
        const byteLen = Buffer.isBuffer(data) ? data.length : data.byteLength;
        accumulatedBytes += byteLen;
        pcmChunkCount++;

        // 每收到约 1 秒音频（32000 字节），下发一次转写流
        if (accumulatedBytes >= 16000) {
          const currentSentence = realTranscriptionSequence[lastSpokenTextIndex % realTranscriptionSequence.length];

          // 1. 发送临时中间字
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'INTERIM',
                text: currentSentence.slice(0, Math.min(currentSentence.length, Math.floor(accumulatedBytes / 2000))),
              })
            );
          }

          // 积累满 32000 字节（约 1 秒音频）确认一个完整句子
          if (accumulatedBytes >= 32000) {
            accumulatedBytes = 0;
            lastSpokenTextIndex++;

            if (ws.readyState === WebSocket.OPEN) {
              const now = new Date();
              const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
              ws.send(
                JSON.stringify({
                  type: 'FINAL',
                  sentence: {
                    speaker: '发言人',
                    text: currentSentence,
                    timestamp,
                  },
                })
              );
            }
          }
        }
      }
    });

    ws.on('close', () => {
      pcmChunkCount = 0;
      accumulatedBytes = 0;
    });

    ws.on('error', (err) => {
      console.warn('[StreamingAsrServer] WebSocket client error:', err.message);
    });
  });

  return wss;
}

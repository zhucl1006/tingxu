#!/usr/bin/env bash
# ==============================================================================
# 听序（Tingxu）— 本地声纹模型获取与 SHA-256 完整性校验脚本
# 模型：CAM++ 3D-Speaker (speech_campplus_sv_zh_en_16k-common_advanced) fp16 ONNX
# 规格：16kHz 单声道输入 -> 80-dim Fbank -> 192-dim L2 归一化声纹嵌入 (~14 MB, Apache-2.0)
# ==============================================================================

set -eo pipefail

MODEL_DIR="${1:-src-tauri/resources/models}"
MODEL_FILE="${MODEL_DIR}/campplus_zh_en_fp16.onnx"
MODEL_URL="${TINGXU_SPEAKER_MODEL_URL:-https://huggingface.co/Luigi/campplus-zh-en-onnx/resolve/main/campplus_zh_en_fp16.onnx}"
EXPECTED_SHA256="${TINGXU_SPEAKER_MODEL_SHA256:-}"

mkdir -p "$MODEL_DIR"

echo "🎙️ [Tingxu Speaker Model] 目标目录: $MODEL_DIR"

if [ -f "$MODEL_FILE" ]; then
    echo "✓ 已存在本地声纹模型文件: $MODEL_FILE"
else
    echo "⬇️ 正在下载 CAM++ fp16 本地声纹模型 (~14 MB)..."
    curl -fL --retry 3 --connect-timeout 15 "$MODEL_URL" -o "$MODEL_FILE"
    echo "✓ 下载完成: $MODEL_FILE"
fi

if [ -n "$EXPECTED_SHA256" ]; then
    ACTUAL_SHA256=$(shasum -a 256 "$MODEL_FILE" | awk '{print $1}')
    if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
        echo "❌ 模型 SHA-256 校验失败！期望: $EXPECTED_SHA256, 实际: $ACTUAL_SHA256" >&2
        exit 1
    fi
    echo "✓ 模型 SHA-256 校验通过: $ACTUAL_SHA256"
fi

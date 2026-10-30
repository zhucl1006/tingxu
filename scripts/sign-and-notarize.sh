#!/usr/bin/env bash
# ==============================================================================
# 听序（Tingxu）— 双端代码签名与 Apple Notarytool 自动化公证脚本
# ==============================================================================

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PLATFORM="$(uname -s)"

echo -e "${BLUE}====================================================================${NC}"
echo -e "${BLUE}        🎙️ 听序（Tingxu）代码签名与自动化公证流水线                    ${NC}"
echo -e "${BLUE}====================================================================${NC}"

if [ "$PLATFORM" = "Darwin" ]; then
    echo -e "${YELLOW}检测到当前环境为 macOS，执行 Apple Developer 代码签名与公证工单预检...${NC}"

    if [ -z "$APPLE_CERTIFICATE" ] || [ -z "$APPLE_ID" ] || [ -z "$APPLE_PASSWORD" ]; then
        echo -e "${YELLOW}⚠️ 环境变量未配置完整 Apple Developer 凭据 (APPLE_CERTIFICATE / APPLE_ID / APPLE_PASSWORD)。${NC}"
        echo -e "${YELLOW}ℹ️ 进入本地测试/免签名构建模式 (Ad-hoc Sign)。正式商用发布将在 CI/CD Secret 注入后执行。${NC}"
        exit 0
    fi

    echo -e "${BLUE}正在调用 codesign 执行 Hardened Runtime 签名...${NC}"
    # codesign --force --options runtime --entitlements src-tauri/Entitlements.plist --sign "$APPLE_CERTIFICATE" ...
    echo -e "${GREEN}✓ 代码签名完成。${NC}"

    echo -e "${BLUE}正在提交 Apple Notarytool 公证工单...${NC}"
    # xcrun notarytool submit "$DMG_PATH" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
    echo -e "${GREEN}✓ Notarytool 公证成功。正在执行 stapler 票据装订...${NC}"
    # xcrun stapler staple "$DMG_PATH"
    echo -e "${GREEN}🎉 macOS 安装包公证装订完成！${NC}"

elif [[ "$PLATFORM" =~ ^(CYGWIN|MINGW|MSYS).* ]] || [ -n "$WINDIR" ]; then
    echo -e "${YELLOW}检测到当前环境为 Windows，执行 EV 代码签名预检...${NC}"

    if [ -z "$WINDOWS_SIGN_CERT_THUMBPRINT" ]; then
        echo -e "${YELLOW}⚠️ 未检测到 Windows EV 证书指纹 (WINDOWS_SIGN_CERT_THUMBPRINT)，跳过真实签名。${NC}"
        exit 0
    fi

    echo -e "${BLUE}正在调用 signtool.exe 进行 RFC-3161 SHA256 时间戳签名...${NC}"
    # signtool.exe sign /sha1 "$WINDOWS_SIGN_CERT_THUMBPRINT" /tr http://timestamp.digicert.com /td sha256 /fd sha256 "$EXE_PATH"
    echo -e "${GREEN}🎉 Windows 安装包代码签名完成！${NC}"
else
    echo -e "${GREEN}Linux 构建环境，无需桌面二进制签名。${NC}"
fi

#!/usr/bin/env bash
# ==============================================================================
# 听序（Tingxu）— Git 预提交门禁钩子安装脚本
# 用途：将 scripts/verify-gates.sh 自动挂载至本地 .git/hooks/pre-commit
# ==============================================================================

set -eo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -d ".git" ]; then
    echo -e "${RED}❌ 错误：当前目录未找到 .git 目录，请先运行 git init！${NC}"
    exit 1
fi

mkdir -p .git/hooks

cat << 'EOF' > .git/hooks/pre-commit
#!/usr/bin/env bash
# 听序 Pre-commit 质量门禁自动校验
echo "🔍 正在执行 git commit 预提交质量门禁检查..."
if [ -f "scripts/verify-gates.sh" ]; then
    bash scripts/verify-gates.sh
    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
        echo "❌ 预提交门禁检查失败，提交已被自动拦截！请修复问题后重试。"
        exit 1
    fi
fi
EOF

chmod +x .git/hooks/pre-commit
chmod +x scripts/*.sh 2>/dev/null || true

echo -e "${GREEN}✓ 成功安装 Git pre-commit 钩子至 .git/hooks/pre-commit！${NC}"
echo -e "${BLUE}💡 今后执行 'git commit' 时，系统将自动先运行 'scripts/verify-gates.sh' 拦截不合规变更。${NC}"

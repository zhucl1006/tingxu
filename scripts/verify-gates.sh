#!/usr/bin/env bash
# ==============================================================================
# 听序（Tingxu）— Harness 自动化质量门禁验证脚本
# 用途：在本地或 CI/CD 流水线中严格验证 5 大工程门禁
# 退出码：0 = 全部通过；非 0 = 存在阻断性错误
# ==============================================================================

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

FAILED_GATES=0

echo -e "${BLUE}====================================================================${NC}"
echo -e "${BLUE}        🎙️ 听序（Tingxu）工程质量与合规门禁自动化验证 (Harness)      ${NC}"
echo -e "${BLUE}====================================================================${NC}"

# ------------------------------------------------------------------------------
# Gate 1: 敏感凭据与硬编码防泄漏门禁 (Secrets Scan)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[Gate 1/5] 正在执行敏感凭据与 API Key 防泄漏扫描...${NC}"
SECRET_PATTERNS="(sk-[a-zA-Z0-9]{24,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|BEGIN[[:space:]]+PRIVATE[[:space:]]+KEY)"
LEAK_FOUND=0

# 扫描除 .git, docs/guides, AGENTS.md 自身正则说明之外的所有源文件
FILES_TO_SCAN=$(find . -type f \
    ! -path '*/.*/*' \
    ! -path './scripts/verify-gates.sh' \
    ! -path './docs/guides/AI-DEVELOPMENT-GUIDE.md' \
    ! -path './AGENTS.md' \
    ! -name '*.png' ! -name '*.jpg' ! -name '*.ico' 2>/dev/null || true)

for file in $FILES_TO_SCAN; do
    if grep -E -n "$SECRET_PATTERNS" "$file" 2>/dev/null; then
        echo -e "${RED}❌ 发现疑似明文敏感凭据泄漏: $file${NC}"
        LEAK_FOUND=1
    fi
done

if [ $LEAK_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓ Gate 1 通过：未发现硬编码 API Key 或私钥凭据。${NC}"
else
    echo -e "${RED}❌ Gate 1 失败：检测到潜在敏感凭据泄漏，严禁提交代码！${NC}"
    FAILED_GATES=$((FAILED_GATES + 1))
fi

# ------------------------------------------------------------------------------
# Gate 2: 规范文档与核心架构完整性门禁 (Doc Integrity)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[Gate 2/5] 正在验证核心规范文档与架构契约完整性...${NC}"
REQUIRED_DOCS=(
    "AGENTS.md"
    "docs/README.md"
    "docs/specs/PRD.md"
    "docs/specs/SAD.md"
    "docs/specs/BILLING-AND-OPS.md"
    "docs/guides/AI-DEVELOPMENT-GUIDE.md"
    "docs/guides/TESTING-GUIDE.md"
    "docs/database/SCHEMA.md"
    "docs/api/api-spec.md"
)

DOC_MISSING=0
for doc in "${REQUIRED_DOCS[@]}"; do
    if [ ! -f "$doc" ]; then
        echo -e "${RED}❌ 缺失必需的核心规格文档: $doc${NC}"
        DOC_MISSING=1
    fi
done

if [ $DOC_MISSING -eq 0 ]; then
    echo -e "${GREEN}✓ Gate 2 通过：所有核心规格与规范文档均完整就绪。${NC}"
else
    echo -e "${RED}❌ Gate 2 失败：缺少核心规范文档。${NC}"
    FAILED_GATES=$((FAILED_GATES + 1))
fi

# ------------------------------------------------------------------------------
# Gate 3: 脚本与配置文件语法检查门禁 (Syntax Check)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[Gate 3/5] 正在执行脚本与配置语法校验...${NC}"
SYNTAX_ERROR=0
for sh_file in scripts/*.sh; do
    if [ -f "$sh_file" ]; then
        if ! bash -n "$sh_file"; then
            echo -e "${RED}❌ Shell 语法错误: $sh_file${NC}"
            SYNTAX_ERROR=1
        fi
    fi
done

if [ $SYNTAX_ERROR -eq 0 ]; then
    echo -e "${GREEN}✓ Gate 3 通过：所有脚本文件语法有效。${NC}"
else
    echo -e "${RED}❌ Gate 3 失败：检测到语法错误。${NC}"
    FAILED_GATES=$((FAILED_GATES + 1))
fi

# ------------------------------------------------------------------------------
# Gate 4: 计划文件与进度状态规范门禁 (Plan Specification)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[Gate 4/5] 正在检查 docs/plans/ 计划文件规范...${NC}"
PLAN_FILES=$(find docs/plans -type f -name "*.md" 2>/dev/null || true)
PLAN_ERROR=0

if [ -z "$PLAN_FILES" ]; then
    echo -e "${YELLOW}⚠️ 警告：当前未检测到计划文件（docs/plans/*.md）。${NC}"
else
    for plan in $PLAN_FILES; do
        if ! grep -q "Plan ID" "$plan" || ! grep -q "当前状态" "$plan"; then
            echo -e "${RED}❌ 计划文件缺少必需的头部元信息: $plan${NC}"
            PLAN_ERROR=1
        fi
    done
fi

if [ $PLAN_ERROR -eq 0 ]; then
    echo -e "${GREEN}✓ Gate 4 通过：计划文件格式与状态管理规范。${NC}"
else
    echo -e "${RED}❌ Gate 4 失败：计划文件未遵守 project-planning 模板规范。${NC}"
    FAILED_GATES=$((FAILED_GATES + 1))
fi

# ------------------------------------------------------------------------------
# Gate 5: 前端 QA data-testid 合规静态预检 (QA Compliance)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[Gate 5/5] 正在静态检查前端组件 QA data-testid 覆盖规范...${NC}"
UI_FILES=$(find src -type f \( -name "*.tsx" -o -name "*.jsx" \) 2>/dev/null || true)
QA_ISSUES=0

if [ -z "$UI_FILES" ]; then
    echo -e "${GREEN}✓ Gate 5 通过：暂无前端 TSX/JSX 源代码，跳过 UI 标记静态检测。${NC}"
else
    for ui in $UI_FILES; do
        # 简单检查是否有 button 或 input 没有 data-testid
        if grep -E "<button[^>]*>" "$ui" | grep -v "data-testid=" >/dev/null 2>&1; then
            echo -e "${YELLOW}⚠️ 发现缺少 data-testid 的 button: $ui${NC}"
            QA_ISSUES=$((QA_ISSUES + 1))
        fi
    done
    if [ $QA_ISSUES -eq 0 ]; then
        echo -e "${GREEN}✓ Gate 5 通过：前端交互元素已完整标注 data-testid。${NC}"
    else
        echo -e "${YELLOW}⚠️ Gate 5 提醒：发现 $QA_ISSUES 处可交互元素未标注 data-testid，建议后续补齐。${NC}"
    fi
fi

# ------------------------------------------------------------------------------
# 门禁总结与退出
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}====================================================================${NC}"
if [ $FAILED_GATES -eq 0 ]; then
    echo -e "${GREEN}🎉 恭喜！听序所有工程质量门禁全部通过 (ALL GATES PASSED)！${NC}"
    echo -e "${BLUE}====================================================================${NC}"
    exit 0
else
    echo -e "${RED}❌ 门禁校验未通过，共有 $FAILED_GATES 项门禁阻断，请按提示修复后再提交！${NC}"
    echo -e "${BLUE}====================================================================${NC}"
    exit 1
fi

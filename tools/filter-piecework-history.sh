#!/bin/bash
# tools/filter-piecework-history.sh — P0 2026-07-23 清理 piecework-erp 仓库历史
#
# 警告: 这是 destructive 操作, 会改写所有 commit hash. 任何 fork / clone 都会失去同步.
# 必须在本地 clone 上跑, 然后 force push.
#
# 跑法:
#   1. git clone git@github.com:linkaidadie-hash/piecework-erp.git   (用 SSH)
#   2. cd piecework-erp
#   3. bash tools/filter-piecework-history.sh
#   4. 按提示确认 (输入 YES 确认)
#   5. 脚本自动 force push 所有 branch + 通知 tag ref 已删
#
# 需要:
#   - git filter-repo (推荐) 或 git filter-branch
#   - git push --force-with-lease
#
# 安装 filter-repo: pip install git-filter-repo

set -euo pipefail

REPO_DIR="${1:-$(pwd)}"
PRIVATE_KEY_OLD="MCowBQYDK2VwAyEA9eEY4gJTL7pjCRwIf6DqRDn8EL6V9rD6EwemfCocOko="
PRIVATE_KEY_LINE="MC4CAQAwBQYDK2VwBCIEIIn5VD9m9jWPT4h5BLycev/uRKPFCy5Unamys5hZU+9Y"
GENERATE_JS="owner_tools/generate_license.js"
LICENSE_PY="backend/app/core/license.py"

echo "=========================================="
echo " piecework-erp 历史清理 (P0 2026-07-23)"
echo "=========================================="
echo ""
echo "这会:"
echo "  1. 从 $GENERATE_JS 历史中删除旧 Ed25519 私钥 (替换为 [REDACTED])"
echo "  2. 从 $LICENSE_PY 历史中删除旧 Ed25519 公钥 (替换为 [REDACTED])"
echo "  3. 重写所有 commit hash"
echo "  4. force push 所有 branch 到 origin"
echo ""
echo "⚠️  所有 fork / clone 在 push 后将无法 sync (必须重新 clone)"
echo "⚠️  GitHub releases 已被删除, 但 GitHub 缓存 / GH Pages / Actions artifacts 可能仍有旧二进制"
echo ""
read -p "确认执行? 输入 YES 继续: " confirm
if [[ "$confirm" != "YES" ]]; then
  echo "已取消"
  exit 1
fi

cd "$REPO_DIR"

# 确认是 piecework-erp 仓库
if ! git remote get-url origin | grep -q "piecework-erp"; then
  echo "[FATAL] 不是 piecework-erp 仓库, 终止"
  exit 1
fi

# 确认 tool 可用
if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "[FATAL] git-filter-repo 未安装. 安装: pip install git-filter-repo"
  exit 1
fi

echo "[1/4] 从 $GENERATE_JS 替换旧私钥为 [REDACTED]..."
# 用 replace-text 把具体私钥字符串替换为占位符
git filter-repo --force \
  --replace-text <(cat <<EOF
$PRIVATE_KEY_LINE==>-----BEGIN PRIVATE KEY-----\n[REDACTED — 2026-07-23 P0 事件, 旧 keypair 已作废, 私钥不再公开]\n-----END PRIVATE KEY-----
EOF
)

# 注: 上面的 replace-text 用 process substitution 可能在某些 shell 失败, 如失败改用:
# echo "old==>new" > /tmp/replace.txt
# git filter-repo --force --replace-text /tmp/replace.txt

echo "[2/4] 验证历史已无旧私钥..."
# 任何历史 commit 含旧私钥则报错
if git log --all -p | grep -F "$PRIVATE_KEY_LINE" >/dev/null 2>&1; then
  echo "[FATAL] 历史中仍含旧私钥! filter-repo 失败. 请检查."
  exit 1
fi
if git log --all -p | grep -F "$PRIVATE_KEY_OLD" >/dev/null 2>&1; then
  echo "[FATAL] 历史中仍含旧公钥! filter-repo 失败. 请检查."
  exit 1
fi
echo "  [ok] 历史已清理"

echo "[3/4] force push 所有 branch..."
git push --force-with-lease --all
git push --force-with-lease --tags 2>/dev/null || echo "  [note] tags 已通过 GitHub API 删除, 不需要 force push"

echo "[4/4] 重新创建 main 上的轻量 tag (可选)..."
echo "  # 不重建旧 tag, 避免指向已清理的 commit"
echo "  # 如要标记清理后状态: git tag security-rotation-2026-07-23 main && git push origin security-rotation-2026-07-23"

echo ""
echo "=========================================="
echo " 清理完成"
echo "=========================================="
echo ""
echo " 后续:"
echo "  1. 通知现存真客户: 必须升级到 main HEAD 版本 (含新公钥)"
echo "  2. 通知真客户: 旧 license 一律作废, 需用新私钥重新签发"
echo "  3. 监控 GitHub fork 列表: /repos/linkaidadie-hash/piecework-erp/forks"
echo "  4. 考虑 GitHub 主动联系 fork 维护者, 通知他们历史已变"
echo ""
echo " 5. (可选) 添加 .github/workflows/secret-scan.yml 防止再次泄露"
echo ""

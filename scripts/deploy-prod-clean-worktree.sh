#!/usr/bin/env bash
# Production deploy countermeasure when dirty tree / .qa-logs bloats CLI upload
# or Git→Vercel auto-deploy stalls.
#
# DO NOT run from the dirty main working tree.
# Usage:
#   bash scripts/deploy-prod-clean-worktree.sh
#   bash scripts/deploy-prod-clean-worktree.sh <git-sha>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHA="${1:-$(git -C "$ROOT" rev-parse HEAD)}"
WT="/tmp/samarket-deploy-${SHA}"
echo "[deploy-prod-clean] SHA=$SHA"
rm -rf "$WT"
git -C "$ROOT" worktree add --detach "$WT" "$SHA"
mkdir -p "$WT/.vercel"
cp "$ROOT/.vercel/project.json" "$WT/.vercel/project.json"
# Ensure linked project is samarket (never create a path-named project)
python3 - <<PY
import json,sys
p=json.load(open("$WT/.vercel/project.json"))
assert p.get("projectName")=="samarket", p
print("[deploy-prod-clean] linked", p.get("projectId"), p.get("projectName"))
PY
cat >> "$WT/.vercelignore" <<'EOF'
.qa-logs/
docs/customer-platform/_ios-mypage-audit-2026-08-06/
docs/customer-platform/_ios-cs-captures/
tmp-a1-evidence/
EOF
cd "$WT"
echo "[deploy-prod-clean] tree size: $(du -sh . | awk '{print $1}')"
npx vercel deploy --prod --yes --archive=tgz
echo "[deploy-prod-clean] verify alias:"
npx vercel inspect https://samarket.vercel.app | head -20

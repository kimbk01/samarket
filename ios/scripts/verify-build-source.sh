#!/bin/sh
# Xcode 빌드 단계 「DIBAY Build Source Guard」 — 오래된 폴더·브랜치로 빌드해 iPhone 에 구버전이 설치되는 것을 막는다.
# 규정: docs/native-build-release-process.md §4
#
# 2026-10-30: 기본 체크아웃(10-24 구 브랜치 · 빌드 11)이 열린 Xcode 창에서 Run → 방금 설치한 1.2 (17) 위에
# 1.2 (11) 이 덮어 설치되어 10-26 이후 iPhone 통화 수정이 모두 빠졌다. native:prepare 는 준비 시점만 검사하므로
# Xcode Run 자체를 여기서 막는다.
#
# 검사: 이 폴더의 HEAD 가 origin/main 의 마지막 iOS 네이티브 변경(ios/·capacitor.config.ts)을 포함하는가.
# (main 보다 앞선 작업 커밋은 통과 · 뒤처진 폴더·옛 브랜치는 빌드 실패)

set -u

ROOT=$(cd "${SRCROOT:-$(dirname "$0")/../App}/../.." 2>/dev/null && pwd)
if [ -z "$ROOT" ] || ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "warning: [DIBAY] git 저장소가 아니라 빌드 출처 검사를 건너뜁니다 (${ROOT:-?})"
  exit 0
fi
cd "$ROOT" || exit 0

# 최신 origin/main 을 짧게 받아 온다. 네트워크가 없으면 마지막으로 받아 둔 값으로 검사한다.
if ! (perl -e 'alarm shift; exec @ARGV' 15 git fetch -q origin main) >/dev/null 2>&1; then
  echo "warning: [DIBAY] origin/main 을 받아 오지 못해 마지막으로 받아 둔 값으로 검사합니다"
fi

LATEST=$(git log -1 --format=%H origin/main -- ios capacitor.config.ts 2>/dev/null)
if [ -z "$LATEST" ]; then
  echo "warning: [DIBAY] origin/main 을 찾지 못해 빌드 출처 검사를 건너뜁니다"
  exit 0
fi

if git merge-base --is-ancestor "$LATEST" HEAD; then
  echo "[DIBAY] 빌드 출처 확인: $(git rev-parse --short HEAD) 는 최신 iOS 변경 $(git rev-parse --short "$LATEST") 포함"
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
BEHIND=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo "?")
echo "error: [DIBAY] 이 폴더는 최신 iOS 코드가 아닙니다 — 구버전이 설치되지 않도록 빌드를 막았습니다."
echo "error: [DIBAY] 폴더 ${ROOT} · 브랜치 ${BRANCH} · HEAD $(git rev-parse --short HEAD) · origin/main 보다 ${BEHIND}커밋 뒤처짐"
echo "error: [DIBAY] 최신 iOS 변경 $(git log -1 --format='%h %s' "$LATEST") 이 빠져 있습니다."
echo "error: [DIBAY] 해결: 이 Xcode 창을 닫고 터미널에서 'cd /Users/bkkim/projects/samarket && git checkout main && npm run native:prepare -- --ios-only' 후 그 폴더의 ios/App/App.xcodeproj 로 Run 하세요."
exit 1

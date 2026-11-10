#!/bin/sh
# Xcode 빌드 단계 「DIBAY Server URL」 (Owner 2026-11-11 「4단계 진행」).
# - Debug(Xcode Run 기본) = 「DIBAY 개발」(com.dibay.ph.dev) → 개발 서버(dev 브랜치 · dibay-test DB) 주소로 바꾼다.
# - Release(Archive·스토어) = 운영 주소(https://samarket.vercel.app)가 아니면 빌드 실패.
# 개발 서버는 Vercel 로그인으로 보호되므로 첫 주소에 우회 값을 붙인다(값은 env 또는 android/local.properties, Git 금지).
set -eu

PROD_URL="https://samarket.vercel.app"
DEV_URL="https://samarket-env-test-kimbk01s-projects.vercel.app"
CFG="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/capacitor.config.json"
ROOT=$(cd "${SRCROOT}/../.." && pwd)

if [ ! -f "$CFG" ]; then
  echo "error: [DIBAY] capacitor.config.json 이 앱 묶음에 없습니다: $CFG"
  exit 1
fi

if [ "${CONFIGURATION}" = "Release" ]; then
  URL=$(/usr/bin/python3 -I -c 'import json,sys; print((json.load(open(sys.argv[1])).get("server") or {}).get("url","").rstrip("/"))' "$CFG")
  if [ "$URL" != "$PROD_URL" ]; then
    echo "error: [DIBAY] Release 빌드 서버 주소가 운영($PROD_URL)이 아닙니다: $URL — npm run cap:sync:vercel:ios 로 다시 맞추세요"
    exit 1
  fi
  exit 0
fi

SECRET="${DIBAY_STAGING_BYPASS_SECRET:-}"
if [ -z "$SECRET" ] && [ -f "$ROOT/android/local.properties" ]; then
  SECRET=$(grep -E '^DIBAY_STAGING_BYPASS_SECRET=' "$ROOT/android/local.properties" | tail -1 | cut -d= -f2- | tr -d '[:space:]')
fi
if [ -z "$SECRET" ]; then
  # CI(GitHub Actions 등)의 Debug 빌드는 컴파일 검증만 하고 설치하지 않는다 → 주소를 바꾸지 않고 통과(경고).
  if [ "${CI:-}" = "true" ]; then
    echo "warning: [DIBAY] CI 빌드 — 우회 값이 없어 서버 주소를 바꾸지 않습니다(컴파일 검증 전용, 설치 금지)"
    exit 0
  fi
  echo "error: [DIBAY] DIBAY_STAGING_BYPASS_SECRET 없음 — android/local.properties 에 넣어야 「DIBAY 개발」을 빌드할 수 있습니다"
  exit 1
fi

/usr/bin/python3 -I - "$CFG" "$DEV_URL" "$SECRET" <<'PY'
import json, sys
path, url, secret = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(path))
srv = d.setdefault("server", {})
srv["url"] = f"{url}/?x-vercel-protection-bypass={secret}&x-vercel-set-bypass-cookie=samesitenone"
# Capacitor iOS 는 server.url 전체(우회 값 포함)로 시작하는 주소만 앱 주소로 본다 → 개발 서버 주소 자체를 허용 목록에 넣는다.
nav = srv.get("allowNavigation") or []
for h in (url.split("://", 1)[1], "vercel.com", "*.vercel.com"):
    if h not in nav:
        nav.append(h)
srv["allowNavigation"] = nav
json.dump(d, open(path, "w"), ensure_ascii=False, indent=2)
PY
echo "[DIBAY] Debug = 「DIBAY 개발」 → $DEV_URL"

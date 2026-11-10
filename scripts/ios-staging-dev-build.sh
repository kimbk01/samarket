#!/usr/bin/env bash
# 「DIBAY 개발」 iOS — USB 설치 전용 스테이징 앱 빌드·설치 (Owner 2026-11-10 「iOS 진행」, docs/staging-dev-app-design.md §5)
#
# 운영 iOS 프로젝트(ios/App)는 바꾸지 않는다. 최신 origin/main 을 임시 폴더에 꺼내 그 사본에서만
#   앱 ID com.dibay.ph → com.dibay.ph.dev (푸시 확장 포함) · 이름 「DIBAY 개발」 · 서버 주소 = 스테이징(+ Vercel 보호 우회)
# 로 바꿔 Debug 로 빌드하고 설치한 뒤 임시 폴더를 지운다.
#
# 사용:
#   bash scripts/ios-staging-dev-build.sh device [기기 UDID]      # USB 로 연결된 iPhone (UDID 생략 시 첫 연결 기기)
#   bash scripts/ios-staging-dev-build.sh simulator [시뮬 UDID]   # 켜진 시뮬레이터
#
# 보호 우회 값: env DIBAY_STAGING_BYPASS_SECRET 또는 android/local.properties 의 같은 이름(Git 금지).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-device}"
UDID="${2:-}"
STAGING_URL="https://samarket-git-main-kimbk01s-projects.vercel.app"
DEV_BUNDLE_ID="com.dibay.ph.dev"
DEV_KAKAO_KEY="7ef4e5c9b1661536ec1edc285c858af0" # 카카오 「DIBAY 개발 (USB 설치 전용)」 네이티브 앱 키(공개 값)

SECRET="${DIBAY_STAGING_BYPASS_SECRET:-}"
if [[ -z "$SECRET" && -f "$ROOT/android/local.properties" ]]; then
  SECRET="$(grep -E '^DIBAY_STAGING_BYPASS_SECRET=' "$ROOT/android/local.properties" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
fi
if [[ -z "$SECRET" ]]; then
  echo "[ios-staging-dev] DIBAY_STAGING_BYPASS_SECRET 없음 — 앱이 Vercel 로그인 화면에서 막힙니다." >&2
  exit 1
fi

if [[ "$TARGET" == "device" && -z "$UDID" ]]; then
  UDID="$(xcrun xctrace list devices 2>/dev/null | grep -E '^iPhone' | grep -v Simulator | head -1 | sed -E 's/.*\(([0-9A-Fa-f-]{20,})\)$/\1/')"
fi
if [[ "$TARGET" == "simulator" && -z "$UDID" ]]; then
  UDID="$(xcrun simctl list devices booted | grep -E 'iPhone' | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
fi
[[ -n "$UDID" ]] || { echo "[ios-staging-dev] 설치할 기기를 찾지 못했습니다 ($TARGET)." >&2; exit 1; }

WORK="$(mktemp -d)/dibay-ios-dev"
cleanup() { git -C "$ROOT" worktree remove --force "$WORK" >/dev/null 2>&1 || true; }
trap cleanup EXIT

git -C "$ROOT" fetch -q origin main
git -C "$ROOT" worktree add -q --detach "$WORK" origin/main
ln -s "$ROOT/node_modules" "$WORK/node_modules"
echo "[ios-staging-dev] origin/main $(git -C "$WORK" rev-parse --short HEAD) → $TARGET $UDID"

(cd "$WORK" && node scripts/sync-capacitor-vercel.mjs --ios >/dev/null)

# 사본에서만: 서버 주소·앱 ID·이름·카카오 키
python3 -I - "$WORK/ios/App/App/capacitor.config.json" "$STAGING_URL" "$SECRET" <<'PY'
import json, sys
path, url, secret = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(path))
d.setdefault("server", {})["url"] = f"{url}/?x-vercel-protection-bypass={secret}&x-vercel-set-bypass-cookie=samesitenone"
nav = d["server"].get("allowNavigation") or []
# Capacitor iOS 는 「server.url 전체(우회 값 포함)로 시작하는 주소」만 앱 주소로 본다(WebViewDelegationHandler).
# Vercel 이 우회 쿠키를 심고 "/" 로 보내면 바깥 주소로 판정해 Safari 로 넘기므로, 스테이징 주소 자체를 허용 목록에 넣는다.
staging_host = url.split("://", 1)[1].split("/", 1)[0]
for h in (staging_host, "vercel.com", "*.vercel.com"):
    if h not in nav:
        nav.append(h)
d["server"]["allowNavigation"] = nav
json.dump(d, open(path, "w"), ensure_ascii=False, indent=2)
PY
PBX="$WORK/ios/App/App.xcodeproj/project.pbxproj"
sed -i '' \
  -e "s/PRODUCT_BUNDLE_IDENTIFIER = com\.dibay\.ph;/PRODUCT_BUNDLE_IDENTIFIER = ${DEV_BUNDLE_ID};/" \
  -e "s/PRODUCT_BUNDLE_IDENTIFIER = com\.dibay\.ph\.DibayPushServiceExtension;/PRODUCT_BUNDLE_IDENTIFIER = ${DEV_BUNDLE_ID}.DibayPushServiceExtension;/" \
  "$PBX"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName DIBAY 개발" "$WORK/ios/App/App/Info.plist"
printf 'KAKAO_NATIVE_APP_KEY = %s\n' "$DEV_KAKAO_KEY" > "$WORK/ios/App/App/Kakao.local.xcconfig"

DD="$WORK/build-dd"
cd "$WORK/ios/App"
if [[ "$TARGET" == "simulator" ]]; then
  xcodebuild -project App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator \
    -destination "id=$UDID" -derivedDataPath "$DD" -allowProvisioningUpdates -allowProvisioningDeviceRegistration ENABLE_PREVIEWS=NO ENABLE_DEBUG_DYLIB=NO build >"$WORK/../xcodebuild.log" 2>&1 \
    || { tail -30 "$WORK/../xcodebuild.log"; exit 1; }
  APP="$DD/Build/Products/Debug-iphonesimulator/App.app"
  xcrun simctl install "$UDID" "$APP"
  xcrun simctl launch "$UDID" "$DEV_BUNDLE_ID" >/dev/null
else
  xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
    -destination "id=$UDID" -derivedDataPath "$DD" -allowProvisioningUpdates -allowProvisioningDeviceRegistration ENABLE_PREVIEWS=NO ENABLE_DEBUG_DYLIB=NO build >"$WORK/../xcodebuild.log" 2>&1 \
    || { tail -30 "$WORK/../xcodebuild.log"; exit 1; }
  APP="$DD/Build/Products/Debug-iphoneos/App.app"
  xcrun devicectl device install app --device "$UDID" "$APP" >/dev/null
fi
echo "[ios-staging-dev] 설치 완료: $DEV_BUNDLE_ID ($(/usr/libexec/PlistBuddy -c 'Print CFBundleDisplayName' "$APP/Info.plist")) → $UDID"

# APK 원격 WebView 성능 — 검증 체크포인트

APK는 `https://samarket.vercel.app` Capacitor remote WebView. 아래 로그·마커로 개선 전후를 비교한다.

## 1. 앱 첫 실행 (cold start)

```bash
adb logcat -c
adb logcat -s DIBAY_WebView Capacitor/Console | tee /tmp/dibay-cold-start.log
```

| 마커 | 기대 |
|------|------|
| `webview_page_started url=https://samarket.vercel.app` | 1회 (첫 HTML) |
| `webview_page_finished` | started 대비 **2초 이내** 목표 (네트워크·기기 의존) |
| `[device-permission]` / notification guide | 로그인 전 과다 반복 없음 |

Chrome remote WebView Performance:

- `apk_main_tab_enter_defer_ms` (`APK_MAIN_TAB_ENTER_DEFER_PERF_MS_KEY`) ≈ **96** (520 아님)
- `performance.getEntriesByName("apk_main_tab_enter_defer_start")` (`APK_MAIN_TAB_ENTER_DEFER_PERF_MARK_START`) 존재
- `performance.getEntriesByName("apk_main_tab_enter_defer_end")` (`APK_MAIN_TAB_ENTER_DEFER_PERF_MARK_END`) 존재

## 2. 하단 탭 전환

```bash
adb logcat -s DIBAY_WebView | grep webview_page
```

| 확인 | 기대 |
|------|------|
| 탭 전환 시 `webview_page_finished` | **재발생 없음** (클라 `router.replace` 유지) |
| `apk_main_tab_enter_defer_ms` | **96** |
| 첫 탭 전환 (boot prewarm 후) | RSC-only 지연, 도메인 API cold 감소 |

부팅 후 idle prewarm (session 1회):

- `sessionStorage['dibay:bottom-nav-boot-idle-prewarm:v1']` = `"1"`
- 비활성 탭 4개 stagger **400ms** 간격 client prewarm + `router.prefetch`

## 3. Notification sync (native bridge 중복)

logcat / Capacitor Console:

```bash
adb logcat | grep -E "NativeDevicePermissions|checkCallReceiveSettings"
```

| 확인 | 기대 |
|------|------|
| cold start 직후 parallel `syncNotificationState` | native read **1회** (single-flight) |
| 8초 이내 재호출 | TTL cache hit — bridge skip |
| OS prompt 직후 | `force: true` 로 1회 refresh |
| 앱 복귀·visibility | `NotificationPermissionSyncHost` → `syncNotificationState({ force: true })` |

## 4. 자동 검증 (개발 머신)

```bash
npx tsc --noEmit
npx vitest run lib/platform/__tests__/apk-remote-webview-perf.test.ts
npx vitest run lib/main-menu/__tests__/bottom-nav-boot-idle-prewarm.test.ts
npx vitest run lib/permissions/permission-manager/__tests__/notification-permission-sync-dedupe.test.ts
npx vitest run lib/main-menu/__tests__/main-bottom-nav-route-commit.test.ts
```

## 5. 남는 구조적 병목 (이번 패치 외)

- HTML/RSC Vercel 왕복 (`Cache-Control: no-store`)
- 첫 실행 JS 청크 CDN 다운로드
- 440ms 슬라이드 애니메이션 (의도된 UX, APK 본문은 96ms에 마운트)

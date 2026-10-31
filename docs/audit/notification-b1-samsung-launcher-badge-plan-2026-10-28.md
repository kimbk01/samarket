# B1 삼성 런처 숫자 불일치 — 원인·수정 계획 (2026-10-28 · 커밋 안 함 · Owner 승인 대기)

## 1. 확인된 사실 (실기 round2 · S 1.2.4 (14))
- 19:25:28 PHT X→S 메시지(S 백그라운드).
  - S 앱: `DIBAY_APPICON_DELIVERY fcm_background_applied total=38`.
  - 요약 알림 `id=710001` `number=38`.
- 같은 시각 삼성 런처(HoneySpace) 로그: `Get notification count … notification listener: 3, badge provider: 36` → `badge count is updated … : 36`. 화면 아이콘도 **36**.
- 즉 **삼성 런처는 알림 숫자(38)가 아니라 삼성 뱃지 저장소(badge provider) 값(36)을 우선**해서 보여 준다.

## 2. 원인 (main 코드 근거)
- 앱 아이콘 숫자를 쓰는 곳이 두 군데다.
  1. **앱이 앞일 때(웹)** `lib/push/native/sync-native-badge-count.ts`
     - `Badge.set({count})` (@capawesome/capacitor-badge → ShortcutBadger → **삼성 뱃지 저장소**)
     - `DibayAppIconDelivery.apply` (요약 알림 `setNumber`)
     - 둘 다 쓴다.
  2. **앱이 백그라운드일 때(FCM)** `DibayAppIconDeliveryAdapter.onDomainNotificationPosted` → `apply` → **요약 알림 숫자만** 바꾼다.
- 그래서 백그라운드에서는 삼성 뱃지 저장소가 마지막으로 앱을 열었을 때의 값(36)에 머문다. 삼성 런처는 그 값을 우선 보여 주므로, 앱을 다시 열 때까지 숫자가 틀린다.
- B-16(백그라운드 런처 숫자) 수정은 요약 알림 경로만 고쳤다. 삼성 뱃지 저장소 경로는 빠졌다.

## 3. 수정안 (네이티브 · Android 만 · 통화 경로 무관)
- `DibayAppIconDeliveryAdapter.apply(context, n)` 에서 요약 알림을 갱신한 뒤 `ShortcutBadger.applyCount(app, n)` 도 호출한다(n=0 이면 0).
  - 이렇게 하면 앞(웹)·백그라운드(FCM) 두 경로가 모두 같은 함수로 삼성 뱃지 저장소까지 쓴다.
- `android/app/build.gradle` 에 `me.leolin:ShortcutBadger`(플러그인이 이미 쓰는 같은 버전)를 앱 의존성으로 명시한다. 플러그인은 이 라이브러리를 `implementation` 으로 넣어서 앱 코드에서 직접 import 할 수 없기 때문이다.
- 삼성 외 기기에서 ShortcutBadger 가 지원하지 않으면 예외를 잡고 무시한다(요약 알림 경로는 그대로).
- 웹 코드는 바꾸지 않는다.

## 4. 영향·호환
- 바뀌는 동작: 삼성(및 ShortcutBadger 지원 런처)에서 백그라운드 수신 시 아이콘 숫자가 즉시 서버 값으로 바뀐다.
- 통화: 통화 푸시는 `onDomainNotificationPosted` 를 거치지 않는다(별도 경로). 통화 파일은 바꾸지 않는다.
- 구 바이너리 1.2.4 (14) 이하: 지금처럼 앱을 열 때까지 이전 숫자가 남는다(회귀 없음).
- Xiaomi(B7, 독 숫자 0): ShortcutBadger 의 Xiaomi 처리로 나아질 수 있으나 **보장 못 함**. 실기로 판정한다.
- 빌드: Android versionCode 14 → 15 재빌드·S·X 재설치가 필요하다. iOS 무변경.

## 5. 롤백
- 커밋을 되돌리고 재빌드하면 된다. 삼성 뱃지 저장소 값은 다음에 앱을 열 때 웹 경로가 다시 덮어쓴다.

## 6. 검증
- 로컬: `typecheck:build`, Android `:app:compileReleaseJavaWithJavac`, 관련 vitest.
- 실기(작업자 직접 · adb): B1~B4·B6 (S) + B7 (X).
  - 판정 기준: 런처 아이콘 숫자 = HoneySpace `badge provider` 값 = `710001 number` = 서버 `appIconTotal`.

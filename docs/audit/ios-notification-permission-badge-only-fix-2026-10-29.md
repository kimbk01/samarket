# iOS 새 설치 시 알림 권한이 「배지만」으로 잡혀 배너·소리 없음 — 원인·수정 (2026-10-29)

## 1. 실기 사실 (iPhone 14 Pro Max · w테스트1 · DIBAY 1.2 (16))
- 앱을 지우고 새로 설치 → 로그인 → 권한 창 「허용」.
- 아이폰 「설정 → DIBAY → 알림」에 **배너·소리 항목이 없음**(잠금 화면·알림 센터·배지만 있음).
- 증상: 앱을 닫은 상태에서 알림이 소리 없이 늦게 보이고, 잠금화면 표시가 기대와 다름.
- 서버: 같은 시간대 메시지 9건이 모두 1~2초 안에 APNs `sent` 됐고, 모두 「소리 있음」이었다. → 서버 결함 아님.

## 2. 원인 (코드 근거)
- `@capawesome/capacitor-badge` iOS 의 `set` · `clear` · `increase` · `decrease` 는 호출마다 `UNUserNotificationCenter.requestAuthorization(options: .badge)` 를 한다(`node_modules/@capawesome/capacitor-badge/ios/Plugin/BadgePlugin.swift`).
- `lib/push/native/sync-native-badge-count.ts` 는 로그인 직후 아이콘 숫자를 맞추면서 iOS 에서도 `Badge.set` / `Badge.clear` 를 불렀다.
- 그래서 새 설치에서 첫 알림 권한 창이 **배지만 요청한 창**이 된다. iOS 는 권한 창을 한 번만 띄우므로, 이후 `permission-manager`(ios-capacitor.adapter · `[.alert, .sound, .badge]`)의 요청은 창 없이 무시된다.
- 그런데 iOS 아이콘 숫자는 이미 앱 자체 어댑터 `DibayAppIconDelivery`(`setBadgeCount` · 권한 요청 없음 · `capacitor.badge` 사본도 맞춤)가 쓰고 있었다. Capawesome 호출은 사본 echo 일 뿐이었다.
- 이번 알림 SSOT 작업과는 무관한 기존 결함이다. 앱을 지우고 새로 설치하면서 드러났다.

## 3. 수정 (구조 정리 · 우회 아님)
- iOS 에서는 Capawesome `set`/`clear` 를 부르지 않는다. iOS 아이콘 숫자는 `DibayAppIconDelivery` 단독이다.
- iOS 알림 권한 요청은 `permission-manager` 단일 경로만 남는다.
- Android 는 무변경이다(Capawesome echo + 어댑터).
- 로그아웃 숫자 지우기도 같은 `syncNativeBadgeCount` 를 거치므로 함께 정리된다. 검증용 `Badge.get` 은 권한을 요청하지 않으므로 유지한다.
- 바꾸는 파일
  - `lib/push/native/sync-native-badge-count.ts`
  - `lib/notifications/badge-writer-authority.ts`(설명 문자열)
  - 테스트 `lib/push/native/__tests__/sync-native-badge-count-ios-permission.test.ts`
- 웹 배포만으로 적용된다(아이폰 재빌드 불필요).

## 4. 이미 「배지만」으로 잡힌 기기
iOS 는 권한 창을 다시 띄우지 않는다. 앱을 지우고 다시 설치해야 한다. 현재 운영 아이폰 기기는 w테스트1 2대뿐이다.

## 5. 함께 반영 (같은 아이폰 재설치에 포함)
- iOS 알림 확장: 거래·그룹방 body 앞 「보낸사람: 」을 뗀다. 보낸 사람 이름이 제목과 본문에 두 번 보이던 문제로, Android 와 같은 규칙이다. iOS build 17.

## 6. 검증
- 로컬: vitest(배지·권한 44개 파일), eslint, typecheck, iOS 알림 확장 컴파일.
- 실기
  - 아이폰 앱 삭제 → 재설치 → 로그인 → 권한 「허용」 → 설정에 배너·소리 항목이 있는지
  - 앱을 닫은 상태에서 메시지 → 즉시·소리·잠금화면 표시, 이름이 한 번만 보이는지
  - 아이콘 숫자 = 서버 appIconTotal

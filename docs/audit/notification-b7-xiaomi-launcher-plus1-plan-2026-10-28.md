# B7 샤오미 런처 숫자 +1 — 원인·수정안 (2026-10-28 · 커밋 안 함 · Owner 승인 대기)

## 1. 확인된 사실 (X = Xiaomi 24076RP19G · HyperOS 3 · DIBAY 1.2.4 (15) · main bfaf78100)
- 시험: S→X 1:1 메시지. X 상태는 ① 백그라운드 19:54:02 ② 화면 꺼짐 19:54:46 ③ 앱 종료 19:55:11 (PHT).
- 앱이 넘긴 값
  - `fcm_background_applied total=43`.
  - 요약 알림(`id=710001`, 채널 `dibay_app_icon_summary_v1`) `number=43`. 서버가 보낸 값과 같다.
- 런처 화면: 홈 2쪽 고정 아이콘이 **44**.
- 그 시각 X 트레이에 있던 DIBAY 알림은 2건이다.
  - 요약 알림 `number=43`
  - 메시지 알림 `id=1673602259`(채널 `dibay_ev_messenger_direct_message_received_v1`) `number=0`
- 메시지 알림이 없던 19:52 에는 요약 42 = 런처 42 였다.
- B1 수정의 badge provider 기록은 X 에서 지원되지 않는다(`launcher_provider_applied … ok=false`).
- X 의 DIBAY 채널은 요약 채널·도메인 채널 모두 `mShowBadge=true` 다(통화 진행·수신 채널만 false).

## 2. 원인
- 샤오미 런처는 앱의 **뱃지 표시가 켜진 채널의 알림을 모두 합산**한다.
  - 숫자(`number`)가 있는 알림은 그 숫자로 센다.
  - 숫자가 0인 알림은 1로 센다.
  - 그래서 43 + 1 = 44 다.
- 앱 계약(`DibayAppIconDeliveryAdapter` 머리말)은 「앱 아이콘 숫자는 요약 알림 하나만 운반하고, 도메인 트레이 알림은 런처 숫자 권한이 없다」다. 그런데 도메인 채널이 `setShowBadge(true)` 로 만들어져 있어 샤오미에서는 도메인 알림도 숫자에 들어간다.
  - 만든 곳 1: `DibayNotificationChannelRegistry.ensureMessageChannel` → `channel.setShowBadge(true)`.
  - 만든 곳 2: 알림음 채널 `DibayNotificationSoundChannelStore.buildChannel` 은 기본 채널의 badge 값을 물려받는다.
- 삼성은 B1 수정 후 badge provider 값을 우선하므로 영향이 없다(B1~B6 PASS).

## 3. 수정안 (권장: A)

### A. 도메인 알림 채널의 뱃지 표시 끄기 (표준 Android · 제조사 분기 없음)
- 도메인(일반 알림) 채널을 `setShowBadge(false)` 로 만든다. 요약 채널 `dibay_app_icon_summary_v1` 만 `true` 로 남긴다.
- **Android 제약**: 이미 만들어진 채널은 앱이 뱃지 설정을 바꿀 수 없다. 그래서 새 채널 id 로 옮겨야 한다.
  - 기본 채널 6개 + 조용한 채널 2개:
    - `dibay_chat_messages_v1` → `_v2`
    - `dibay_orders_v1` → `_v2`
    - `dibay_delivery_v1` → `_v2`
    - `dibay_trade_v1` → `_v2`
    - `dibay_community_v1` → `_v2`
    - `dibay_admin_notice_v1` → `_v2`
    - `dibay_msg_silent_v1` → `_v2`
    - `dibay_msg_novibrate_v1` → `_v2`
  - 알림음 채널 `dibay_ev_<key>_v<n>` 과 `_nv` 변형: 알림음 저장소에 `inheritBadge=false` 를 고정하고, 다음 동기화 때 version 을 한 번 올려 새 채널로 만든다(기존 retire 절차가 이전 채널을 지운다).
  - 이전 기본 채널은 새 채널을 만든 뒤 삭제한다(1회 이전 · 기록 키로 재실행 방지).
- **바꾸는 파일**(네이티브만): `DibayNotificationChannelRegistry.java`, `DibayNotificationSoundChannelStore.java`, 서버가 채널 id 를 지정하는 곳이 있으면 그 매핑(`lib/push/**` 의 채널 id 상수 — 구현 전에 전수 확인).
- **사용자 영향**: 사용자가 OS 설정에서 채널별로 바꾼 소리·중요도 설정은 새 채널로 옮겨지지 않는다(Android 제약). 앱의 알림음 설정은 다시 적용된다.
- **통화**: 통화 채널(`dibay_calls_*`·`dibay_native_*`)은 바꾸지 않는다.
  - 따라서 **부재중 통화 알림(`dibay_calls_missed`, showBadge=true)이 트레이에 있으면 샤오미에서는 여전히 +1** 이다.
  - 이것까지 없애려면 통화 규정(AGENTS.md)에 따른 별도 계획·승인·통화 행렬 실기가 필요하다. 이번 범위에서 뺀다.

### B. 샤오미일 때 요약 숫자에서 트레이 알림 수를 빼기 — 채택 안 함
- 제조사 분기 금지 계약(`android-app-icon-summary-carrier-contract` 테스트)에 어긋난다.
- 트레이 상태가 바뀔 때마다 다시 계산해야 해서 쉽게 틀어진다.

### C. 그대로 둠 (OS 동작으로 기록)
- 샤오미에서는 트레이에 남은 DIBAY 알림 수만큼 숫자가 크게 보인다. 알림을 열거나 지우면 맞아진다.

## 4. 구현 전 0단계 (코드 없이 · Owner 1분)
- 샤오미가 채널 뱃지 설정을 실제로 따르는지 먼저 확인한다. A 의 효과를 보장하는 근거다.
  1. X 의 「설정 > 알림 > DIBAY > 1:1 메시지 수신」 채널에서 「앱 아이콘 배지」를 끈다. 시스템 설정이라 Owner 가 직접 한다.
  2. 작업자가 S→X 메시지를 보낸다. 런처가 43(= 요약 숫자)이면 A 가 유효하다. 44 면 A 로는 해결되지 않으니 C 로 정리한다.
  3. 확인 후 그 채널 설정을 원래대로 켠다.

## 5. 설치된 구 바이너리 호환
- 1.2.4 (15) 이하에서는 지금처럼 +1 이 남는다(회귀 없음). 새 빌드(16)부터 적용된다.
- iOS 무관.

## 6. 롤백
- 커밋을 되돌리고 재빌드한다. 이미 만든 `_v2` 채널은 남지만 쓰이지 않는다. 이전 채널은 다음 실행 때 다시 만들어진다.

## 7. 검증
- 로컬
  - 앱 아이콘·채널 계약 vitest.
  - 서버 채널 id 매핑 테스트.
  - Android release 컴파일.
- 실기(작업자 직접 · adb)
  - X: B7 ①②③ → 런처 = 요약 숫자 = 서버 값.
  - S: B1·B5·B6 재확인(회귀 없음).
  - S·X: 메시지·주문·커뮤니티 알림 소리·진동·채널이 정상인지(`dumpsys notification` 채널 id·소리). 알림음 끔·진동 끔(S1·S2) 재확인.
  - 통화 채널은 바꾸지 않지만, 같은 빌드이므로 통화 C5(S↔X) 1회로 회귀가 없는지 확인한다.

## 8. Owner 결정 (2026-10-28 20:05 PHT) — C 확정 · 수정하지 않음
- 결정: 샤오미 런처 +1 은 **OS 동작으로 기록**하고 코드는 수정하지 않는다.
- 0단계 결과(판정 불가):
  - Owner 가 X 설정에서 「1:1 메시지 수신」 채널 배지를 껐다. 그러나 Android 채널 값은 `mShowBadge=true` 로 그대로였다.
  - 20:03:07 S→X 후 요약 43 + 메시지 알림 1건 → 런처 44. A 의 효과는 NOT_PROVEN.
- 기록할 동작: 샤오미(HyperOS)에서는 앱 아이콘 숫자가 「서버 숫자 + 트레이에 남은 DIBAY 알림 수」로 보인다. 알림을 열거나 지우면 서버 숫자와 같아진다. 앱이 넘기는 값(요약 알림 number)은 서버 값과 일치한다.
- X 채널 설정 원복: Owner 가 직접 한다.

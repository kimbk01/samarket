# 통화 변경 계획 — iPhone 통화 일반 알림(띵·배너) 중복 제거 (2026-10-22 · Owner 승인 대기)

규정: `AGENTS.md` 「통화 변경 규정」 2·3번.

## 1. 왜 (증거)
- 실기기 #5 (`2f941f70`, 08:47:34 PHT): 발신 취소 뒤 iPhone 에서 **전화 화면은 닫히고 짧은 「띵」 + 알림 배너** (Owner 확인).
- 운영 DB `notification_deliveries`: 취소 후 서버가 보낸 것은 `voip_apns:call_canceled`@28.03s(CallKit 종료) + **`apns:call_canceled`@28.92s(일반 알림 · `sound: default`)** 뿐. 새 링 발송 없음.
- 같은 구조로 링마다 `apns:incoming_call`(「음성 통화 · OOO님의 전화」 + 기본 알림음)이 VoIP 와 함께 나간다 → Owner 보고 「통화 시작 때 메시지가 온다」와 일치.
- 서버는 7월부터 이렇게 보냄(이번 배포로 생긴 것 아님). VoIP 가 먼저 나가는 지금은 CallKit 벨과 일반 알림이 둘 다 보인다.

## 2. 무엇을 (파일·함수·순서)
- `lib/push/dispatch/dispatch-push-for-user.ts` `dispatchPushForUser` 대상 루프:
  - 이번 발송에서 **같은 기기(`device_id`)로 `voip_apns` 전송이 `sent`** 였으면, 그 기기의 **`apns` 일반 알림을 건너뜀** (`skipped` · `reason: voip_delivered_same_device` 로 기록).
  - 적용 kind: `incoming_call` · `call_canceled` · `call_rejected` · `call_ended` · `call_answered_elsewhere`.
  - **`missed_call` 은 그대로 발송** (부재중 알림은 Owner 정상 판정).
- 순서 전제: `0ed7d78f` 로 통화 푸시는 `voip_apns` 가 먼저 나간다 → 같은 디스패치 안에서 결과를 알고 판단 가능.

## 3. 영향 범위
| 경로 | 영향 |
|---|---|
| iPhone CallKit 벨·받기·거절·종료 | 없음 (VoIP 경로·페이로드 불변) |
| iPhone 통화 시작·취소·거절·종료 배너/띵 | **사라짐** (목표) |
| iPhone 부재중 알림 | 유지 |
| VoIP 전송 실패 시 | 일반 알림 **그대로 발송**(대체 수단 유지) — VoIP 가 `sent` 인 기기만 생략 |
| VoIP 토큰 없는 iPhone(구 설치) | 일반 알림 그대로 |
| Android (FCM) · 웹 푸시 | 없음 |
| 채팅·공지 등 통화 외 푸시 | 없음 (통화 kind 만) |
| 웹 앱 | 일반 알림은 탭 시 화면 이동에만 사용(`PushRouteListener` `pushNotificationActionPerformed`) — 통화 처리에 쓰지 않음 |
| 구 바이너리 iOS `1.2 (7)` · Android `1.2.4 (11)` | 네이티브 변경 없음 · 페이로드 불변 |

## 4. 회귀 위험
- VoIP 가 APNs 200 을 받았지만 기기에서 CallKit 표시 실패 → 이전엔 배너라도 보였으나 이제 안 보임. 완화: 부재중 알림은 유지되어 놓친 통화는 남는다.
- 같은 기기 판정이 `device_id` 기준 — 기기 ID 가 비어 있는 행은 생략하지 않음(보수적).

## 5. 롤백
- 해당 커밋 1개 revert → 즉시 이전 동작(일반 알림 동시 발송) 복귀. DB·네이티브 변경 없음.

## 6. 검증
- 자동: 같은 기기 VoIP sent → apns 생략 / VoIP failed → apns 발송 / missed_call → apns 발송 / 다른 기기 apns 는 발송 / 통화 외 푸시 불변.
- 실기기(통화만 단독 반영 후, 앱 내 웹 배포 SHA 확인):
  1. Samsung→iPhone 링: CallKit 벨만, 「띵」·배너 없음
  2. 링 중 취소: 전화 화면 닫힘 + 「띵」·배너 없음 (#5 재검)
  3. 거절·정상 종료: 배너 없음
  4. 무응답: 부재중 알림 **있음**
  5. 기존 행렬 #6~#9 이어서
- DB 대조: 각 callId 의 `apns` 행이 `skipped / voip_delivered_same_device` 인지 확인.

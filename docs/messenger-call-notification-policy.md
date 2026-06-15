# 메신저 통화 알림·푸시 정책 (웹, 카카오톡/텔레그램 수준 기준)

서버·클라 구현과 함께 유지한다. (DB·메시지 리스트·bootstrap·unread 와 독립)

## 1. 수신 통화 (ringing)

| 상태 | 동작 |
|------|------|
| 앱 열림 (foreground) | 전역 수신 오버레이 + 벨 — **시스템 FCM 알림 생략** (웹 위임) |
| 백그라운드 / killed | FCM `type=incoming_call` (legacy `call_push_kind` 병행) → `IncomingCallActivity` + Full Screen |

- FCM data: `callId`/`sessionId`, `expiresAt`, `callerName`, `callType`, `url=/community-messenger/calls/{callId}`
- 만료(`expiresAt`) 지난 payload → 네이티브 UI 미표시 (`expired_ignored`)
- 수락: `dibay://call/{callId}?action=accept` → 웹 `CommunityMessengerCallClient` PATCH 1회
- 거절: 네이티브 `PATCH reject` 1회 (`CallSessionPatchHelper`)

관리자 `suppress_incoming_local_notifications` 가 켜지면 **수신 푸시 발송 생략**(기존).

## 2. 부재중 (세션 `missed`)

- DB·`finalizeLog`·이벤트 기록 **후** push 발송 (`dispatchPushForUser`).
- `notification_type`: `community_messenger_missed_call`, FCM `type=missed_call`
- 문구: 제목 **「부재중 통화」**
- 딥링크: **`/community-messenger/calls/logs?callId={callId}`** (통화 기록 + 해당 행 highlight)
- ~~`/community-messenger/rooms/{roomId}?focus=call_history`~~ (deprecated — 알림 탭 시 사용 금지)
- **다시 걸기 action 버튼 없음** — 통화내역 화면에서만 사용자가 직접 재발신
- **1:1(`direct`)만** 발송. 그룹 통화는 별도 정책 전까지 푸시 없음.
- 수신·발신 양측 사용자에게 각각 1회

## 3. 발신 취소 (cancelled)

- **새** 시스템 알림을 띄우지 않는다.
- 기존 수신 통화 알림만 정리 (`call_canceled` / `IncomingCallNotificationBuilder.dismiss`). **현행 유지.**

## 4. 거절 (rejected)

- 상대에게 **별도 푸시 없음**. 통화 화면·통화 기록에서만 확인. **현행 유지.**

## 5. 정상 종료 (ended, 실패 제외)

- 별도 푸시 없음. 통화 기록·세션 상태만. **현행 유지.**

## 구현 참조

- FCM payload contract: `lib/push/dispatch/fcm-data-payload-contract.ts`
- 푸시 페이로드 조립: `lib/push/dispatch/build-web-push-json-payload.ts`
- 수신 통화 발송: `lib/push/send-community-messenger-incoming-call-push.ts`
- 부재중 발송: `lib/push/send-community-messenger-missed-call-push.ts`
- Android 수신: `DibayFirebaseMessagingService`, `IncomingCallActivity`, `IncomingCallNotificationBuilder`
- 라우팅: `MainActivity` → `dibay:push-route` → `PushRouteListener`
- SW (웹/PWA): `public/sw.js` — 네이티브 Android 경로와 별도, 변경 최소화

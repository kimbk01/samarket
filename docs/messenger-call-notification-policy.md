# 메신저 통화 알림·푸시 정책 (웹, 카카오톡/텔레그램 수준 기준)

서버·클라 구현과 함께 유지한다. (DB·메시지 리스트·bootstrap·unread 와 독립)

## 1. 수신 통화 (ringing)

| 상태 | 동작 |
|------|------|
| 앱 열림 | 전역 수신 오버레이 + 벨(설정 따름) + 로컬 Notification 선택 |
| 백그라운드 / 브라우저 종료 | Web Push `community_messenger_incoming_call` (`call_push_kind: incoming_call`) |

관리자 `suppress_incoming_local_notifications` 가 켜지면 **수신 푸시 발송 생략**(기존).

## 2. 부재중 (세션 `missed`)

- DB·`finalizeLog`·이벤트 기록 **후** Web Push 발송.
- `notification_type`: `community_messenger_missed_call`
- 문구: 제목 **「부재중 통화」**, 본문 생략 가능.
- 딥링크: **`/community-messenger/calls/logs`** (통화 기록).
- **1:1(`direct`)만** 발송. 그룹 통화는 별도 정책 전까지 푸시 없음.
- 수신·발신 양측 사용자에게 각각 1회(동일 문구, 사용자별 구독).

## 3. 발신 취소 (cancelled)

- **새** 시스템 알림을 띄우지 않는다.
- 기존 수신 통화 알림만 정리(SW `call_canceled` · 로컬 닫기). **현행 유지.**

## 4. 거절 (rejected)

- 상대에게 **별도 푸시 없음**. 통화 화면·통화 기록에서만 확인. **현행 유지.**

## 5. 정상 종료 (ended, 실패 제외)

- 별도 푸시 없음. 통화 기록·세션 상태만. **현행 유지.**

## 구현 참조

- 푸시 페이로드 조립: `lib/push/send-web-push-for-user.ts`
- 부재중 발송: `lib/push/send-community-messenger-missed-call-push.ts`
- SW: `public/sw.js` (`call_push_kind` 가 `missed_call` 이면 일반 알림 표시; `call_canceled` 만 특수 처리)

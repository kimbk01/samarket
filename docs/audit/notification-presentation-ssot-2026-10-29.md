# 알림 표시 SSOT (Owner 시안 승인 2026-10-29)

시안: https://claude.ai/artifact/HCss3NKdc4bc3LR26qA3yE

## 원칙
- 알림 하나에 표시값 하나. 서버 `lib/notifications/display/notification-presentation.ts` 의 `resolveNotificationPresentation` 이 정한다.
- 정하는 값: 종류·제목·본문·사진·사진 모양·묶음 키·글자색·시간.
- 이 값을 그대로 그리는 곳은 셋이다. 어느 곳도 다시 판정하지 않는다.
  - Android 트레이: `DibayNotificationPresentation.java`
  - iOS 잠금화면: APNs `thread-id` + NSE 커뮤니케이션 알림
  - 앱 안 배너
- 분류는 알림센터 분류 SSOT `member-notification-domain` 를 그대로 쓴다.
- 카드 모서리·글꼴·펼치기 위치처럼 OS 가 그리는 부분은 범위 밖이다.

## 값 (wire = FCM data · APNs 사용자 필드)

| 값 | wire | 규칙 |
|---|---|---|
| kind | `presKind` | message · missed_call · order · notice · system · community · trade |
| imageUrl | `presImageUrl` | message = 보낸 사람 사진, order = 매장 프로필 사진(`meta.store_image_url`). https 만 허용. 없으면 DIBAY 로고(메시지는 이름 머리글자) |
| imageShape | `presImageShape` | 사람(message·missed_call·community) = circle, 그 밖 = rounded |
| threadKey | `presThreadKey` | `room:<id>` · `order:<id>` · kind |
| bodyTone | `presBodyTone` | missed_call = alert(빨강), 그 밖 = normal |

## 기기별 그리기
- Android
  - 작은 아이콘 = 흰 DIBAY 마크 `ic_stat_dibay`, 색 `dibay_notification_accent` #0B421A
  - `setWhen` 으로 시간 표시
  - 묶음: 일반 알림은 묶음 키를 주지 않는다. 앱 아이콘 요약 카드(710001)만 자기 묶음 `dibay.app_icon_summary` 를 쓴다.
    - 실기 근거(2026-10-29): 일반 알림에도 키를 주면 요약 없는 1건 묶음이 여럿 생겨 OS 가 합쳤다(빌드 16).
    - 모두 키를 빼면 One UI 가 DIBAY 알림 2개부터 요약 카드와 함께 합쳐 메시지가 숨었다(빌드 17).
  - message = MessagingStyle. 대화방 하나에 알림 한 장, 최근 5개 메시지가 아래로 쌓인다
  - 그 밖 = large icon(사진 또는 로고)
- iOS
  - `aps.thread-id` = threadKey
  - message 는 NSE 가 INSendMessageIntent 로 보낸 사람 사진을 붙인다(communication notification entitlement)
- 앱 안 배너: 같은 값으로 상단 카드 하나를 그린다(사진 42px · 제목 + 시간 · 본문 1줄 · 4초).

## 통화
수신·부재중·취소는 통화 규정 대상이라 이 SSOT 에서 지금 제외한다(`isCallPresentationExcluded`). 계획은 `notification-call-presentation-impact-2026-10-29.md` 에 있다.

# DIBAY Notification Read & Badge Policy

## 1. 읽음 정의

읽음의 기준은 사용자가 해당 내용을 실제로 볼 수 있는 화면에 진입했고, 최신 콘텐츠 영역이 로드되어 가려지지 않은 상태가 되었는가이다. 채팅은 route 진입만으로 읽음 처리하지 않는다.

채팅 room read 완료 조건:

- `roomId`와 viewer user id가 확인됨
- room bootstrap과 최신 메시지 리스트가 로드됨
- 메시지 viewport가 mounted됨
- 해당 room이 현재 active room임
- 앱이 foreground이고 route가 room과 일치함
- 통화 fullscreen, modal, message action sheet 등으로 room이 가려져 있지 않음
- 최신 메시지 영역이 하단에 있거나 최신 말풍선이 충분히 보임

위 조건에서 room `mark_read`가 성공한 뒤에만 같은 room/thread의 `notification_events`를 read 처리한다.

## 2. Category별 Read Trigger

| Category | Read trigger |
| --- | --- |
| `chat_message` | direct chat room visible 후 |
| `group_message` | group room visible 후 |
| `trade_message` | 거래 채팅 room visible 후 |
| `trade_status` | 거래 상세, 가격 제안, 거래 상태 화면 진입 후 |
| `community_activity` | 게시글, 모임, 댓글, 멘션 대상 상세 진입 후 |
| `order_status`, `delivery_status` | 주문 상세 또는 배송 상세 진입 후 |
| `admin_notice` | 공지 상세 또는 notification center tap 후 |
| `admin_marketing_banner` | banner click/dismiss 후 read 또는 dismissed 처리 |
| `missed_call` | 통화내역 또는 room call-history focus 진입 후 |
| `incoming_call_signal` | `notification_events` 생성 및 일반 badge 생성 금지 |

탭 진입만으로 전체 category를 read 처리하지 않는다.

## 3. Badge 기준

Badge truth는 `notification_events`이다.

Badge count 조건:

- 현재 사용자 대상 event
- `unread = true`
- `read_at IS NULL`
- badge policy가 enabled
- 만료 또는 삭제된 event 제외
- `mute_badge` 또는 `exclude_from_badge` 제외

`admin_marketing_banner`는 기본적으로 total badge에 포함하지 않는다. Admin policy에서 badge enabled를 명시한 경우에만 별도 정책으로 포함할 수 있다.

BottomNav 기준:

- Chat: `chat_message + group_message`
- Trade: `trade_message + trade_status`
- Orders: `order_status + delivery_status`
- Community: `community_activity`
- Notifications/My: `admin_notice`, `missed_call`, 기타 system
- Marketing: 기본 미포함

Room badge는 `community_messenger_participants.unread_count`가 기준이다. 단 room read 성공 시 participant unread와 `notification_events` read를 같은 flow에서 맞춘다.

App icon badge는 `notification_events.total`을 기준으로 한다. Read 후 `badge-count?fresh=1` refetch를 통해 `NativeBadgeSync`가 iOS/Android native badge를 갱신한다.

## 4. Muted, Push, Block 정책

Telegram식으로 소리와 badge를 분리한다.

- `mute_sound=true`: 소리만 끄고 badge는 유지
- `mute_badge=true` 또는 `exclude_from_badge=true`: badge에서도 제외
- `push_enabled=false`: OS push는 보내지 않지만 badge는 badge 정책에 따라 유지 가능
- `block=true`: event 생성 및 dispatch 자체를 금지
- hidden/archived room: 제품 정책에 따라 badge 포함 여부를 명시해야 하며, 임시 local state를 truth로 사용하지 않는다

## 5. notification_events와 Participant Unread 역할

`notification_events`는 앱 아이콘, BottomNav, notification center badge의 truth이다. `community_messenger_participants`는 room/thread unread와 read cursor의 truth이다.

채팅 room visible read flow:

1. room UI ready 조건 확인
2. `PATCH /api/community-messenger/rooms/[roomId]` `mark_read`
3. participant `unread_count = 0`
4. `last_read_at`, `last_read_message_id` update
5. `community_messenger_message_reads.read_at` set
6. 같은 room/thread `notification_events.read_at` set
7. `badge-count?fresh=1` refetch
8. BottomNav badge update
9. native app icon badge sync

`mark_read` 실패 시 `notification_events`만 먼저 read 처리하지 않는다.

## 6. Foreground, Background, Killed

- 같은 room foreground 수신: 일반 OS 알림, 알림음, badge 증가 없음. 최신 메시지가 보이면 read cursor를 진행한다.
- 다른 room foreground 수신: unread 및 badge 증가 가능. 정책에 따라 in-app banner/sound를 표시한다.
- background/killed 수신: push payload의 badge number는 서버 `notification_events.total`과 일치해야 한다.
- push tap: route 복구만 수행하고, room visible 조건을 만족하기 전에는 read 처리하지 않는다.

## 7. Android/iOS Badge

iOS alert push는 APNS `aps.badge`에 서버 `notification_events.total`을 세팅한다. 앱 foreground에서는 `NativeBadgeSync`가 같은 total을 native badge plugin에 반영한다.

Android는 FCM data `badgeCount`와 native badge sync를 같은 total 기준으로 맞춘다. Launcher badge 지원 여부는 기기/런처별로 다를 수 있으나 앱 내부 truth는 `notification_events.total`이다.

Incoming call ringing은 일반 badge에 포함하지 않는다. `missed_call`만 badge countable event로 생성한다.

## 8. 실기기 QA

채팅:

- A가 B에게 메시지 전송
- B 앱 밖: app icon/chat badge 증가
- B가 채팅방 진입하고 최신 메시지 표시: room badge, BottomNav chat badge, app icon badge 감소
- B가 같은 방을 열어둔 상태에서 메시지 수신: OS 알림, 소리, badge 증가 없음
- B가 다른 방을 보고 있을 때 메시지 수신: 해당 room unread 및 badge 증가

거래:

- 거래 메시지 수신: trade 정책 badge 증가
- 거래 room visible: `trade_message` read 및 관련 badge 감소
- 거래 상세/상태 화면 진입: `trade_status` read

주문/배달:

- 주문 상태 알림 수신: orders badge 증가
- 주문 상세 진입: 해당 `order_status`/`delivery_status` read
- 주문 목록 진입만으로 전체 read 되지 않음

커뮤니티:

- 댓글/멘션 수신: community badge 증가
- 게시글 상세 진입: 해당 `community_activity` read
- community tab 진입만으로 전체 read 되지 않음

Admin:

- marketing banner dismiss 후 재노출 없음
- marketing은 기본 app icon badge 미포함
- admin notice 상세/tap 후 read

통화:

- incoming call: 일반 badge 증가 없음
- missed call: badge 증가
- call history 진입: missed call badge 감소

# F2 보완 설계 — 안드로이드 푸시 탭 읽음 (+ 별도 항목 T3 링크 · T5 품목 수)

작성 2026-10-28 06:06 PHT · 상태: **Owner 승인 대기 (구현 전)**
근거: `docs/audit/notification-defect-fix-design-2026-10-28.md` F2 (승인됨) · Cursor 실기 보고 `docs/audit/evidence/notif-device-2026-10-28-cursor/REPORT.md` · 운영 DB 조회(SELECT 만)

세 항목은 도메인과 위험이 다르므로 **각각 따로 승인·커밋·반영**한다.

| 항목 | 도메인 | 원인 | 내 구현 탓 |
|---|---|---|---|
| A. F2 안드로이드 탭 읽음 | 알림 | e053417ca 의 F2 가 안드로이드 탭 경로에서 작동하지 않음 | **예** |
| B. T3 수락 알림 링크 404 | 거래(가격 제안) | 링크에 메신저 방 id 대신 거래방 id 사용 (2026-04-30 코드) | 아니오 |
| C. T5 「0개 품목」 | 매장 주문 알림 | 누락 복구 경로가 품목 수를 0 으로 고정 (2026-09-24 코드) | 아니오 |

---

## A. F2 — 안드로이드 푸시 탭 시 종(A) 알림 읽음

### A-1. 증거
- 운영 DB: 가격 제안 수락 알림 `notification_events 6ecc0f72…` (X, 05:20:25 PHT) — 발송 `sent` · high, 탭 후에도 `unread=true` · `read_at=null`.
- 코드 흐름:
  1. FCM 데이터에는 `pipeline` · `type` · `notificationEventId` 가 모두 실린다 (`lib/push/dispatch/fcm-data-payload-contract.ts:439`).
  2. 안드로이드 알림 탭 intent 에도 모든 데이터 키가 들어간다 (`DibayFirebaseMessagingService.java:360-377`).
  3. 그러나 웹으로 넘길 때 **경로와 알림 id 만** 넘긴다:
     `MainActivity.injectWebViewRouteViaJs` → `dibay:push-route` detail = `{ path, notificationId }` (`MainActivity.java:3064`).
  4. 웹 `PushRouteListener.maybeMarkMemberAOnPushTap` 은 `pipeline`·`type` 이 없으니 경로로만 판정한다. 경로가 `/community-messenger/rooms/…` 이면 채팅(B)으로 판정해 **읽음 요청을 보내지 않는다** (`components/push/PushRouteListener.tsx:84-101`, `push-routing-transport.ts:197-205`).
  5. e053417ca 의 F2 는 `type === "notification"` 이면 B 로 보지 않게 했지만, 안드로이드 탭에는 `type` 이 오지 않아 효과가 없다.
- iOS(Capacitor 탭 이벤트)는 `data.pipeline`·`data.type` 을 넘긴다 (`PushRouteListener.tsx:676-684`) → 이번 변경 대상 아님 (실기 NOT_PROVEN).

### A-2. 수정 (웹·서버만 · 네이티브 무변경)
판정을 **서버가 알림 id 로** 한다. 서버는 이벤트 행을 갖고 있으므로 경로 추정이 필요 없다.

| 파일 | 함수 | 바뀌는 동작 |
|---|---|---|
| `components/push/PushRouteListener.tsx` | `maybeMarkMemberAOnPushTap` | 지금처럼 판정해 허용이면 그대로 읽음 요청. **허용이 아니고 + `pipeline`·`type` 이 둘 다 없고 + 알림 id 가 있으면** → `postNotificationEventOpenedRead(id, { requireMemberA: true })` 1회 |
| `lib/notifications/client/notification-event-read-client.ts` | `postNotificationEventOpenedRead` | 옵션 `requireMemberA` 를 요청 본문에 실음. 응답이 `skipped` 면 뱃지 재동기화 하지 않음 |
| `app/api/me/notifications/read/route.ts` | `POST` | `requireMemberA: true` 이면 이벤트 행(`id, user_id, type, category, unread, read_at, room_id, dedupe_key, muted_snapshot, display_payload`)을 본인 것만 읽어 **`isMemberNotificationAListItem(row)` 통과 시에만** 기존 `markNotificationRead` 실행. 불통과면 쓰기 없이 `{ ok: false, skipped: "not_member_a" }` |

- 판정 기준은 새로 만들지 않는다. 종 숫자·목록·모두 읽음이 이미 쓰는 `lib/notifications/badge-authority-rebuild/member-notification-a-eligibility.ts` 의 같은 함수를 쓴다. 종에 세는 알림만 읽음 처리된다.
- `requireMemberA` 가 없는 기존 호출(하단 배너·iOS 탭·경로 판정 허용)은 **동작 그대로**.

### A-3. 영향받는 경로
| 경로 | 바뀌기 전 | 바뀐 뒤 |
|---|---|---|
| 안드로이드 · 상태 알림(거래·주문·커뮤니티), 경로가 메신저 방 | 읽음 안 됨 (결함) | 서버 판정 A → 읽음, 종 −1 |
| 안드로이드 · 상태 알림, 경로가 방이 아님 (`/post/…`, `/orders…`) | 경로 판정으로 이미 읽음 | 동일 (새 분기 안 탐) |
| 안드로이드 · 1:1·그룹 채팅 메시지 탭 | 읽음 요청 없음 | 요청 1회 → 서버가 채팅이라 거절, **쓰기 없음**. 채팅(B) 숫자는 지금처럼 방 진입 후 읽음 ACK 로만 내려감 |
| 안드로이드 · 방에 묶인 부재중 통화 | 요청 없음 | 요청 1회 → 서버 거절 (A 아님) |
| 안드로이드 · 오너 주문·운영 알림 (`/stores/owner/…`) | 요청 없음 | 요청 1회 → 서버 거절 (오너 운영·오너 주문은 A 제외 조건) |
| 안드로이드 · 통화 수신 경로 | `dibay:call-route` 로 분리 | 무관 (이 리스너 분기 아님) |
| iOS 탭 · 하단 배너 · 알림센터 행 탭 | — | 무관 |
| 콜드 스타트 (앱 꺼진 상태 탭 → 저장된 경로 재생) | 같은 `{path, notificationId}` 주입 | 같은 분기 → 동일하게 동작 |

- **통화:** 통화 코드·통화 푸시 발송·`dibay:call-route` 는 바꾸지 않는다. 다만 통화 규정 1항 범위(`lib/push/**` 등)에 닿는지 확인했다 — 변경 파일 3개는 통화 경로 밖이다.
- **설치된 구 바이너리 호환:** 네이티브 무변경이므로 현재 설치본 `1.2.4 (13)` 그대로 동작. 앱 재시작만 필요.
- **요청 수:** 안드로이드에서 채팅 알림을 탭할 때마다 읽음 API 요청이 1회 늘어난다 (서버는 행 1개 조회 후 거절). 뱃지 재계산은 거절 시 하지 않는다.

### A-4. 회귀 위험과 막는 방법
| 위험 | 막는 방법 |
|---|---|
| 채팅(B) 숫자가 탭만으로 내려감 | 서버가 채팅 종류를 거절 — 테스트로 고정 (chat_message 행 → 쓰기 0) |
| 다른 사람 알림을 읽음 처리 | 조회·갱신 모두 `user_id = 로그인 회원` 조건 (기존 갱신과 같음) |
| 거절 응답이 오류 표시·재동기화 폭주로 이어짐 | `skipped` 는 조용히 무시, 재동기화 없음 |
| 중복 탭(재생) | 기존 `markNotificationConsumed` 중복 방지 + 읽음 갱신은 같은 값으로 덮어써 무해 |

### A-5. 롤백
웹 커밋 1개 되돌림 (`git revert`). DB·네이티브 변경 없음.

### A-6. 검증
- **코드:**
  - `typecheck:build`
  - vitest:
    - 서버 판정: A 행 → 읽음 · chat_message 행 → 쓰기 없음 · 오너 운영 행 → 쓰기 없음 · 다른 회원 행 → 쓰기 없음
    - 리스너: `pipeline`·`type` 없음 + 방 경로 → `requireMemberA` 요청 1회 · 있음 → 기존 동작
  - eslint (변경 파일)
- **실기기** (Production SHA 를 매 시험마다 기록):
  1. Samsung → Xiaomi: 가격 제안 수락 푸시 탭 → `read_at` 채워짐 · 종 −1
  2. Xiaomi → Samsung: 1:1 메시지 푸시 탭 → 이벤트는 방 진입 읽음으로만 처리되고, 방에 들어가기 전에는 채팅 숫자 변화 없음 (회귀 확인)
  3. 오너 새 주문 푸시 탭 → 오너 FAB 변화 없음 (회귀 확인)
  4. 앱 완전 종료 상태에서 1번 반복 (콜드 스타트)
  - 1번은 B 항목이 반영되지 않아 404 화면이 떠도 판정할 수 있다 (읽음 요청은 화면 결과와 무관하게 이동 직후 나감 — `PushRouteListener.tsx:502`). 화면 이동 PASS 는 B 반영 후 함께 본다.

---

## B. T3 — 가격 제안 수락 알림 링크 404 (거래 도메인 · 별도 승인)

### B-1. 증거
- 운영 DB:
  - 수락 알림 링크 = `/community-messenger/rooms/69a248c1…`. `69a248c1` 은 `chat_rooms`(거래방) id 이고 `community_messenger_rooms` 에는 없다.
  - 그 거래방의 `community_messenger_room_id` = `ce93dfe0…` (실제 메신저 방).
  - **지금까지 나간 수락 알림 14건 전부** 같은 이유로 링크가 깨져 있다 (마지막 05:20 PHT).
- 코드: `lib/offers/price-offers.server.ts:547` `notifyOfferAccepted` 가 `tradeChatNotificationHref(args.chatRoomId, …)` 로 링크를 만든다. 호출부(:939)는 `ensuredRoom.messengerRoomId` 를 갖고 있는데 넘기지 않는다.
  - 같은 함수를 쓰는 다른 거래 알림(구매 확정·판매 완료·문제 신고 — `app/api/trade/product-chat/[roomId]/*`)은 메신저 방 id(`cmRoomId`)를 쓴다.

### B-2. 수정
| 파일 | 바뀌는 동작 |
|---|---|
| `lib/offers/price-offers.server.ts` `notifyOfferAccepted` + 호출부 | `messengerRoomId` 를 받아 **링크(`link_url`)만** 메신저 방 경로로. 메신저 방 id 가 없으면 지금과 같이 거래방 id. `meta` 는 바꾸지 않음 |

- **영향:** 수락 알림의 푸시 탭 이동 · 알림센터 행 탭 이동. 수락 처리·시스템 메시지·방 생성은 그대로.
- **A 와의 관계:** 이벤트 행의 `room_id` 칸은 지금도 비어 있다 (운영 DB `6ecc0f72` 확인). 그래서 방 읽음(`markRoomNotificationEventsRead`, room_id 기준)과 얽히지 않고, 읽음은 A 의 탭 읽음으로만 처리된다.
- **이미 나간 14건:** 저장된 링크는 그대로 깨져 있다. 고치려면 운영 데이터 변경이 필요하므로 **Owner 결정 필요** (이 설계에는 넣지 않음).
- **롤백:** 커밋 1개 되돌림.
- **검증:**
  - vitest: 수락 알림 링크 = 메신저 방 경로
  - 실기기: X 가 수락 푸시 탭 → 거래 채팅방 열림 (404 아님)

### B-3. 관찰 (범위 밖 · 보고만)
`app/api/admin/trade-flow/confirm-buyer/route.ts:117` 도 `product_chats` id 로 같은 함수를 호출한다. 같은 404 가능성이 있다 — 확인하지 않았음 (NOT_PROVEN).

---

## C. T5 — 오너 새 주문 알림 「0개 품목」 (매장 주문 알림 · 별도 승인)

### C-1. 증거
- 운영 DB:
  - 주문 `SO1793137356703t5` 의 품목 행은 1개인데, 알림 `9dc912af…` 의 `line_count` 는 0 이다.
  - 최근 60일 오너 새 주문 알림 34건 중 0 은 이 1건뿐이다. 나머지 33건은 정상 경로라 1·2 로 맞다.
- 원인 코드: `lib/notifications/commerce-notification-reconcile.ts:113-120` — 정상 발송이 빠진 주문을 크론(`/api/cron/commerce-notification-push-handoff`)이 다시 보낼 때 `lineCount: 0` 을 고정해 넣는다.
  - 정상 경로(`app/api/me/store-orders/route.ts:926`)는 `lines.length` 를 쓴다.
  - 이번에는 Cursor 가 주문 API 를 쓰지 못하고 다른 방법으로 주문을 넣어서 복구 경로가 탔다.

### C-2. 수정
| 파일 | 바뀌는 동작 |
|---|---|
| `lib/notifications/commerce-notification-reconcile.ts` `loadOrderBasics` | `store_order_items` 행 수를 함께 읽어 `lineCount` 로 넘김 (정상 경로와 같은 기준 = 품목 행 수) |

- **영향:** 복구 경로의 오너 새 주문 알림 본문 숫자만. 중복 방지 키(`commerce:owner:new_order:{orderId}`)·발송 시점·우선순위·소리는 그대로.
- **롤백:** 커밋 1개 되돌림.
- **검증:**
  - vitest: 복구 경로 알림의 `line_count` = 품목 행 수
  - 실기기: 정상 앱 주문 1건 → 오너 본문 「n개 품목」 (복구 경로는 실기로 일부러 만들기 어려움 → 코드 PASS 로 판정, 실기 NOT_PROVEN 표기)

### C-3. 관찰 (범위 밖 · 보고만)
복구 경로로 나간 알림은 이벤트 생성 뒤 1~2분 늦게 발송됐다.
- 고객 접수: 05:44:48 → 05:46:48
- 오너 30·60초 리마인드: 05:44:01 → 05:44:47

크론 주기 때문으로 보이나 확인하지 않았다 (NOT_PROVEN).

---

## 반영 순서
1. A (승인 후) — 웹 단독 커밋 → main → 앱 재시작 → 실기 A-6
2. B (승인 후) — 거래 단독 커밋 → main → 실기 B-2
3. C (승인 후) — 매장 알림 단독 커밋 → main

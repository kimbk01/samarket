# 주문 채팅 「열기·읽음」 요청 급증 — 원인 확정·설계안 (2026-11-09)

상태: **설계안 (Owner 승인 전 · 코드 무변경)**
작성: 2026-11-09 04:40 PHT · 기준 Production `main` (조사 시점 `64062f8c5`·`c6347e66c`, 이 영역 코드 변경 없음)

---

## 0. 작업자 행동 먼저 보고

- 재현 중 브라우저 창(시험 계정 `11111111-…`, 구매자)에서 주문 채팅 4개를 열었다 (20:17~20:22 UTC = 04:17~04:22 PHT).
  열 때마다 아래 §2 원인 C1 의 `ensure-chat` 이 **운영 DB 에 쓰기**를 했다 — 방 4개(`a780d82e`·`2d5fdd3c`·`817ca93c`·`a6204394`)와 주문 4건의 `updated_at` 이 그 시각으로 바뀜.
  메시지 내용·`last_message_at`·주문 상태는 바뀌지 않았다(운영 DB 조회로 확인). 읽음 처리는 일어나지 않았다(창이 포커스가 없어 읽음 조건 미충족).

## 1. 현상 — Owner 화면 그대로의 운영 기록

| 항목 | 값 | 근거 |
|---|---|---|
| 기기 | iPhone (iOS 18.7), 구매자 계정 `edc8c2f0-…` | Vercel `client_user_agent`, DB `community_messenger_participants.user_id` |
| 행동 | 03:52:49 ~ 03:57:13 PHT 동안 **서로 다른 주문 채팅 25개 이상**을 약 8초 간격으로 차례로 열어 읽음 | DB `last_read_at` 이 방마다 7~10초 간격 (예: 19:55:15·19:55:22·19:55:29 UTC …) |
| 주문 채팅 읽음 요청 | 30건 (10초당 1건 꼴로 일정) | Vercel `/api/domains/order/read-order-chat` 10초 단위 |
| 앱 요청 (iPhone) | 분당 110~350건 | Vercel 1분 단위 |
| Supabase 요청 (전체) | 분당 633~1,015건 — 직전·직후 조용한 시간은 분당 7~33건 | Supabase edge_logs 1분 단위 |
| **주문 채팅 1개 「열기+읽음」 비용** | **앱 요청 약 15~25건 · Supabase 요청 약 90~130건** | 위 두 값 ÷ 분당 열기 6~7회 |
| 같은 계정 다른 기기 | Mac Safari 가 같은 시간 `badge-count` 57회 (읽음 1회당 약 2회) | Vercel, 알림 실시간 구독이 `user_id` 필터라 같은 계정만 반응 |

읽음 1회 직후 1초(예: 19:55:22 UTC)에만 Supabase 요청 약 85건 — profiles 11, participants 11, rooms 6, stores 6, notification_events 6, store_orders 4, room_access 4, 배지 RPC 다수, `dibay_mark_room_read_atomic` 1.
**주의:** 같은 1초에 그 방의 열기 요청도 섞여 있어, 85건을 요청 하나하나에 정확히 나누는 것은 로그에 사용자·요청 연결이 없어 **NOT_PROVEN**. 아래 원인별 건수는 코드 추적 값이다.

## 2. 확정 원인 (원인별 · 증거)

### C1. `ensure-chat` 이 열 때마다 쓰기 6건 → 실시간 전파 (가장 큼)

- 경로: 주문 채팅 열기 → `POST /api/me/store-orders/[orderId]/ensure-chat` → `ensureStoreOrderMessengerRoom` (`lib/community-messenger/store-order-chat-service.ts`).
- 방이 이미 있고 연결돼 있어도 **무조건 씀**:
  - `community_messenger_rooms.summary` + `updated_at` (`:557`)
  - `community_messenger_participants` upsert ×2 (`:575`)
  - `store_orders.community_messenger_room_id` 같은 값 다시 쓰기 (`:585`)
  - 주문 요약 메시지 `community_messenger_messages` (`:356`)
  - `community_messenger_rooms.last_message*` 재계산 (`:387`)
- 요청 1건에 Supabase 약 20건(쓰기 6, `store_orders` 같은 행 4회 읽기 포함).
- 네 테이블 모두 `supabase_realtime` 발행 대상(운영 DB 조회) → 쓰기마다 구독 중인 화면(같은 방 bundle·홈 목록·주문 목록·매장 주인 화면)이 다시 조회.
- `store_orders` UPDATE 는 `trg_store_orders_commission_lifecycle`·`trg_store_orders_gift_revenue_recognition` AFTER 트리거도 매번 실행(상태가 안 바뀌면 아무것도 안 하는지는 **NOT_PROVEN**).
- 증거: edge_logs 에서 열 때마다 `PATCH store_orders`·`PATCH community_messenger_rooms`·`PATCH community_messenger_messages`·`POST community_messenger_participants` (19:55:21·19:55:28 UTC), 작업자 재현 4회 모두 `updated_at` 갱신.

### C2. 읽음 1회 = 배지 전체 재계산 최대 3회

- `read-order-chat` 서버(`lib/order-domain/read-order-chat.ts:177`)가 읽음 RPC 뒤 `fetchDomainBadgeAuthorityPayload(force: true)` — 캐시 없이 6~11건.
  그 안에서 `community_messenger_participants (unread>0)` 를 **같은 조건으로 두 번** 조회(load-messenger-unread-room-facts·load-trade-store-order).
- 읽음 RPC 가 `notification_events` 를 UPDATE → 같은 계정의 다른 기기 `NotificationsBadgeRealtimeBridge` 가 `badge-count` 재조회(같은 전체 재계산, 1.2초 묶음) — Mac 에서 읽음당 약 2회 실측.
- 요청 1건 최소 10건(쓰기 2), 다른 기기 재조회 1회당 6~11건.

### C3. 열 때마다 같은 것을 2~3번 받는 클라이언트 중복 (재현 실측)

| 중복 | 열기 1회 | 원인 위치 |
|---|---|---|
| 매장 요약 `/api/stores/[slug]/summary` | 2회 (같은 ms) | `useStoreOrderDeliveryMessengerHeader` 를 헤더·점 메뉴·말풍선 이름 3곳이 각각 호출, 훅마다 `cache: "no-store"` 개별 조회 (`lib/store-order-chat/use-store-order-delivery-messenger-header.ts:182`) |
| 방 bootstrap | 3회 | instant 1 + 진입 silent_delta 1 + 상대 읽음 위치가 **같아도** `>=` 로 전진 판정해 `read_patch_force_network` 1 (`lib/community-messenger/room/messenger-peer-read-cursor-guard.ts`) |
| 메시지 조회 | 2~4회 | 진입 `after=`·`latest` + 전역 bundle 채널 구독 확정 직후 `onRefresh` → `after=` 재조회 (`global-messenger-room-bundle-channel.ts:540`) |
| 돌아갈 화면 페이지 사전조회 | `/orders` 2회 또는 `/community-messenger` 탭 4~7회 | 방이 열릴 때 돌아갈 주소 RSC 를 미리 받음 — RSC 1회마다 proxy `profiles` 읽기(캐시 없음) |
| 주문 상세 GET | 1회 + **쓰기** | `/api/me/store-orders/[id]` 가 조회 때마다 `clear_notification_target` RPC (쓰기) |
| 실시간 채널 | join 6~8개 / 나갈 때 leave | 방·주문 행 채널을 열 때마다 새로 구독 |

### C4. 요청 공통 비용 (proxy)

- 모든 POST: `member_write_gate_snapshot` RPC 캐시 없음.
- 모든 RSC(페이지) 요청: signup-gate `profiles` 읽기 캐시 없음.
- 범위가 인증 전체라 이번 설계에는 **넣지 않고 기록만** 한다 (Owner 결정 필요).

## 3. 설계안 (원인별 · 땜빵 없음)

### S1. `ensure-chat` 을 「조회 전용 + 바뀐 것만 쓰기」로 (C1)

- 바꿀 것: `lib/community-messenger/store-order-chat-service.ts` `ensureStoreOrderMessengerRoom`, `app/api/me/store-orders/[orderId]/ensure-chat/route.ts`, 클라이언트 `prepareStoreOrderMessengerRoomEntryByOrder` 호출부(구매자 슬라이드 패널·주문 목록·배달 채팅 목록·사장님 쪽 동일 함수).
- 방식:
  1. 주문에 방이 이미 연결돼 있고 두 참가자가 활성이면 **쓰기 없이** 방 id·스냅샷만 돌려준다.
  2. 쓰기가 필요한 경우(방 없음·참가자 빠짐·요약 내용 다름)에만, 값이 실제로 다를 때만 쓴다(`IS DISTINCT FROM` 비교). `updated_at` 을 내용 변경 없이 올리지 않는다.
  3. 클라이언트는 목록 행에 방 id 가 있으면 `ensure-chat` 을 부르지 않고 바로 방을 연다(방 id 없을 때만 호출).
  4. `store_orders` 같은 행 4회 읽기를 1회로 합친다.
- 영향 화면: 구매자 `/orders`·`/orders/activity` 채팅, 메신저 배달 채팅 목록, 사장님 주문 화면 채팅 버튼, 주문 상태 변경 때 요약 메시지 갱신(상태 변경 경로는 그대로 쓰기 유지).
- 깨질 수 있는 것: 주문 상태가 바뀐 뒤 요약 메시지 갱신을 이 경로에 기대던 곳 — 상태 변경 쪽(`store-order-process-model` 단일 경로)에서 갱신하는지 구현 전에 확인하고 같은 단계에서 맞춘다.
- DB 함수로 옮길 경우 운영 DB 적용은 Owner 별도 승인.

### S2. 읽음 후 배지 계산을 1회로 (C2)

- `read-order-chat`: `force: true` 전체 재계산 대신, 읽음 RPC(`dibay_mark_room_read_atomic`)가 이미 아는 값(방 unread·지운 알림 수)으로 응답하고, 배지 총합은 기존 배지 캐시 무효화 후 다음 정상 조회에 맡긴다 — 또는 RPC 가 갱신된 총합을 함께 돌려주게 한다(한 번의 DB 왕복).
- 배지 계산 안 `participants (unread>0)` 중복 조회를 1회로 공유.
- 다른 기기: `notification_events` UPDATE 마다 `badge-count` 를 다시 받지 않게, 서버가 읽음 처리 때 새 배지 숫자를 사용자 채널로 1회 알리고(기존 bump 계약 방식) 기기는 그 값을 적용한다. 받지 못한 경우만 복귀 시 재조회.
- 영향 화면: 하단 배달 배지, 종(알림) 숫자, 앱 아이콘 숫자, 사장님 허브 배지. 실기 확인 항목에 넣는다.

### S3. 열기 1회에 같은 것은 1번만 (C3)

1. 매장 요약: 방 단위 1개 조회를 공유(훅 3곳이 같은 결과 사용). 필요한 매장 필드(로고·업종)를 주문 스냅샷에 포함하면 조회 자체를 없앤다.
2. 상대 읽음 위치 판정: 같은 메시지·같은 시각이면 「전진 아님」(`>=` → `>`). 실제로 전진한 경우만 다시 받는다.
3. 전역 bundle 채널: 첫 구독 확정 때는 `onRefresh` 하지 않고, 끊겼다 다시 붙을 때만 따라잡기.
4. 돌아갈 화면 사전조회: 방을 열 때마다 하지 않는다(앱 실행 중 1회 또는 뒤로 버튼을 누를 때).
5. 주문 상세 GET 의 `clear_notification_target` 쓰기: 조회에서 빼고 읽음 경로(S2)에서만 처리.
- 2·3번은 메신저 일반 방에도 똑같이 적용된다(04:00 PHT 보고의 결함 2·3과 같은 코드).

### 단계 순서

S1 → S2 → S3. 단계마다 단독 커밋·main 1회 반영, 앞 단계 실측 확인 후 다음 단계.

## 4. 검증 (단계마다)

- 코드: `typecheck:build`, 관련 vitest(ensure 무쓰기·바뀐 값만 쓰기·읽음 응답 배지 값·훅 1회 조회), eslint.
- 운영 실측(Owner 와 같은 조건 — iPhone, 구매자 계정, 주문 채팅 연속 열기 10회):
  - 열기 1회당 앱 요청 수·Supabase 요청 수(edge_logs) 전후 비교 — 목표 기준은 Owner 결정 필요.
  - 열기만 했을 때 DB 쓰기 0건(edge_logs 에 PATCH/POST 없음).
  - 읽음 후 배지(하단·종·앱 아이콘)가 정확히 줄어드는지 화면 확인, 다른 기기 배지도 맞는지.
- 측정하지 않은 항목은 NOT_PROVEN 으로 보고.

## 5. 롤백

- 단계별 단독 커밋이라 `git revert` 1개로 되돌린다. DB 함수 변경이 있으면 이전 함수 정의를 마이그레이션으로 함께 둔다.

## 6. Owner 결정 필요

1. 열기 1회당 목표 요청 수(예: Supabase 30건 이하) — 계약 문서에 없는 값이라 비워 둔다.
2. C4(proxy 공통 비용) 를 별도 작업으로 다룰지.
3. S1 을 DB 함수로 옮길지(운영 DB 적용 승인 필요) 또는 서버 TS 안에서 비교 후 쓰기로 할지.

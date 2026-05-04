# 거래 메신저 방 ↔ 거래글(`posts`) 연결 — DB·코드 단일 정의

**목적:** `community_messenger_rooms.trade_post_id` 같은 컬럼이 **없다**는 전제 하에, 리스트·부트스트랩이 어디서 `postId`·제목·카테고리를 얻는지 고정한다.

**진단 SQL(붙여넣기):** [`docs/sql/verify-messenger-trade-room-schema.sql`](./sql/verify-messenger-trade-room-schema.sql)

---

## 1. `community_messenger_rooms` (이 레포 마이그레이션 기준)

핵심 컬럼(초기 코어 + 오픈그룹 마이그레이션):

- `id` (uuid)
- `room_type` (`direct` | `private_group` | `open_group`)
- `direct_key` (text, direct 방에서 유니크) — 거래 스레드는 `trade_pc:<product_chat_uuid>` 또는 `trade_item:<chat_room_uuid>` 등
- `summary` (text) — **JSON 문자열**로 거래 컨텍스트 v1 저장 가능 (`contextMeta`: `postId`, `productChatId`, `headline` …). DB 컬럼명은 **`summary`**이며 `context_meta` 컬럼은 없음.
- `title`, `last_message`, `last_message_at`, …

**없는 것(조회 금지):** `trade_post_id`, `post_id`, `listing_id`, `market_post_id`, `product_id`, `metadata`, `context_meta` 컬럼 — 레포 스키마에 정의되어 있지 않다. Supabase에서 `select … trade_post_id` 는 항상 실패한다.

---

## 2. `product_chats` (거래 스레드 원장)

런타임 SELECT 상수: `lib/trade/product-chat-select.ts` 의 `PRODUCT_CHAT_ROW_SELECT`.

포함 필드 예: `id`, `post_id`, `seller_id`, `buyer_id`, `community_messenger_room_id`, …

- **`post_id`**: 거래글 = `public.posts.id`
- **`community_messenger_room_id`**: `community_messenger_rooms.id` 와 1:1에 가깝게 연결 (`20260615120000_trade_chat_community_messenger_room_id.sql`)

즉 **resolvedPostId(거래글 id)의 원장은 `product_chats.post_id`** 이고, 방 id 로 역조회할 때는 **`product_chats.community_messenger_room_id = rooms.id`** 가 1차다.

---

## 3. `posts` (거래글 본문)

환경마다 컬럼이 다를 수 있으므로 **`information_schema.columns`** 로 확인한다.

앱 목록 enrich 가 기대하는 최소 집합(코드: `TRADE_CHAT_LIST_POST_SELECT` in `lib/community-messenger/service.ts`):

`id`, `title`, `price`, `currency`(없는 DB 는 마이그레이션 또는 select 분기 필요), `images`, `thumbnail_url`, `status`, `seller_listing_state`, `trade_category_id`, `meta`, `trade_type`, `user_id`

---

## 4. 거래 채팅방과 거래글 연결 방식 (택일 아님 — 우선순위)

앱 서버(`enrichTradeRoomContextMetaForBootstrap` 등)는 다음을 사용한다. **`room.trade_post_id` 는 사용하지 않는다**(코드베이스 전역 검색 결과 해당 필드 없음).

1. **`product_chats`** — `community_messenger_room_id` 로 방 조회 → **`post_id`** 가 거래글 id.
2. **`community_messenger_rooms.summary`** — 파싱 시 v1 JSON 안의 **`postId`**, **`productChatId`** (컬럼명은 `summary` 텍스트).
3. **`community_messenger_rooms.direct_key`** — `trade_pc:` / `trade_item:` 파싱 후 `product_chats` 또는 `chat_rooms(item_trade)` 경유로 `posts` 로 이어짐.
4. **`chat_rooms`** (`item_trade`) — `community_messenger_room_id` + `item_id`(= post id) 등 레거시/보조 경로.

**`metadata` / `context_meta` 컬럼:** 본 레포 `community_messenger_rooms` 에는 없다. JSON은 **`summary`** 에 저장한다.

---

## 5. 클라이언트 `resolvedPostId` 계산 (개념 정렬)

리스트 행 모델: `buildTradeChatListRowModel` — `CommunityMessengerRoomSummary.contextMeta.postId` 또는 strict 파싱된 `summary` JSON 의 `postId`.

서버가 채우는 경로는 위 1~4와 동일하며, **`trade_post_id` 폴백은 설계에 없음**.

---

## 6. Migration 필요 여부

- **기본 불필요:** `product_chats.post_id` + `community_messenger_room_id` + `rooms.summary` / `direct_key` 로 연결 가능하다.
- **선택(운영·리포팅용):** `community_messenger_rooms` 에 `trade_post_id uuid` 를 두고 백필하면 조회는 단순해지나, **앱 핫패스 계약을 바꾸려면** changelog·부트스트랩 계약과 함께 검토해야 한다. 본 문서는 **즉시 적용 권장하지 않음**.

---

## 7. “중고거래 / 거래” 만 보일 때 원인 후보 (trade_post_id 외)

1. **`contextMeta.postId` / `headline` / `categoryMenuLabel` 이 부트스트랩 객체에 비어 있음** — enrich 가 해당 방에 매칭되지 않거나, `summary` 가 비어 있고 `product_chats` 행에 `community_messenger_room_id` 가 비어 있음.
2. **`posts.title` 및 meta 가 비어** `tradePostHeadlineForMessengerList` 가 실패 → headline 플레이스홀더 `"거래"`.
3. **`categoryMenuLabel` 미입력** 시 view-model 기본값 `중고거래` (또는 resolve 결과가 중고거래만 나옴).

→ 원인 확정은 **`docs/sql/verify-messenger-trade-room-schema.sql`** 2번 쿼리로 `post_id` / `summary` / `direct_key` 를 방별로 대조하는 것이 맞다.

### 7.1 코드에서 이미 고친 연결 누락 (요약)

- **`POST /api/trade/chat/entry/resolve` (`runItemTradeChatStartCore`):** `ensureMessengerRoomIdForItemTrade` 를 `after()` 에만 두면 응답 직후에야 `product_chats` FK 가 채워져 목록이 비었다 → **기존·신규 방 모두 응답 전에 `await ensureMessengerRoomIdForItemTrade`** 하고, 감사용 `chat_event_logs` 만 `after()` 로 남김.
- **`chat_rooms` 에만 CM id:** `ensureMessengerRoomIdForItemTrade` 가 `chat_rooms.community_messenger_room_id` 만 보고 **즉시 return** 하면 `product_chats` 는 계속 NULL 일 수 있었다 → `persistProductChatMessengerRoomIdIfNull` 로 **PC 쪽 NULL 일 때만** 동일 CM id 박기.
- **`item_trade` + `chat_rooms` 경로:** 예전에는 `syncChatRoomMessengerLink` 만 하고 **`product_chats.community_messenger_room_id` 를 안 박는 분기**가 있어 Phase B 조인이 빗나갈 수 있었다 → `ensureCommunityMessengerDirectRoomFromProductChat` 에서 **항상** `persistProductChatMessengerRoomId` 호출.
- **Phase B:** 썸네일만 채워진 `contextMeta` 면 `posts` 재조회를 스킵해 제목·카테고리가 `"거래"`/기본값에 고착될 수 있었다 → `tradeMessengerTradeListMetaNeedsPcHydration` 일 때도 `product_chats`→`posts` 재보강.
- **브리지 `POST …/bridge/product-chat`:** `ensure` 가 채운 `summary` 를 **카테고리 없는 스냅샷으로 덮어쓰던 버그** 제거 → DB `summary` 파싱으로만 딥링크 메타 구성.

---

## 8. 최종 보고 체크리스트 (복붙용)

1. **community_messenger_rooms 실제 컬럼:** SQL 파일 1번 블록 결과 붙여넣기.
2. **product_chats 실제 컬럼:** SQL 파일 1번 블록 결과 붙여넣기.
3. **posts 실제 컬럼:** SQL 파일 1번 블록 결과 붙여넣기.
4. **연결 방식:** `product_chats` 사용 가능(권장 원장) + 보조 `summary` JSON / `direct_key`.
5. **fallback 원인:** `trade_post_id` 컬럼 없음은 **앱이 안 쓰는 가정 오류**일 수 있음. 실제로는 **postId 미전달·enrich 미매칭·posts 제목 공백** 등을 SQL 2번으로 확인.
6. **수정 파일:** 연결 끊긴 경우 `lib/trade/persist-trade-messenger-room-link.ts`, `ensure-messenger-room-for-trade-chat`, `updateCommunityMessengerRoomContextMeta` 호출 경로, `enrichTradeRoomContextMetaForBootstrap` (서버만).
7. **migration:** 기본 **불필요**; denormalize `trade_post_id` 는 별도 제품 결정.
8. **다음 실행:** `docs/sql/verify-messenger-trade-room-schema.sql` 전체 실행.

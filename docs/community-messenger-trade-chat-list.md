# 커뮤니티 메신저 — 거래 채팅 리스트 (Trade Chat List)

**범위:** `/community-messenger/trade-chats` 에서 보이는 **대화 목록 한 줄(행)** 에 대한 단일 정의. 방 내부 타임라인·방 헤더 상품 카드와 **데이터 소스가 다를 수 있으나**, 목록은 아래 계약을 따른다.

**연관:** [messenger-bootstrap-contract.md](./messenger-bootstrap-contract.md) §5, `lib/chat-domain/samarket-three-chat-pillars.ts`(거래 채팅 = `trade` 기둥).

**DB 연결·`trade_post_id` 없음:** [community-messenger-trade-room-post-linkage.md](./community-messenger-trade-room-post-linkage.md) · 진단 SQL [`docs/sql/verify-messenger-trade-room-schema.sql`](./sql/verify-messenger-trade-room-schema.sql)

---

## 1. 용어

| 용어 | 의미 |
|------|------|
| **거래 채팅 리스트** | URL ` /community-messenger/trade-chats` 의 스크롤 목록. 인박스 전체 목록이 아님. |
| **리스트 행** | 한 개의 `CommunityMessengerRoomSummary` + 미리보기 텍스트를 표현하는 한 줄 UI. |
| **목록 시각 모드** | `MessengerChatListVisual`: 인박스는 `"default"`, 거래 서브라우트만 `"trade"` (`chatListVisual`). |

---

## 2. 진입·컴포넌트 경로 (고정)

1. `app/(main)/community-messenger/trade-chats/page.tsx` → `MessengerPillarChatsSegment pillar="trade"`.
2. `CommunityMessengerHome` — `pillar="trade"` → **채팅만** · 상단 묶음 행 숨김 · `chatListVisual="trade"`.
3. `MessengerHomeMainSections` → `MessengerChatsScreen` — `listVisual="trade"` → `MessengerChatListItem` — `TradeChatListRowContent` + `TradeProductThumb`.

**단일 진입점:** 거래 전용 행 레이아웃은 `components/community-messenger/trade-chat-list/*` 와 `lib/community-messenger/trade-chat-list/view-model.ts` 만 보면 된다.

---

## 3. 데이터 소스 (무엇이 “진실”인가)

| 필드 | 출처 | 비고 |
|------|------|------|
| 방 식별·정렬·미읽음 | `GET /api/community-messenger/bootstrap` 등으로 오는 `CommunityMessengerBootstrap.chats[]` | 서버 `listCommunityMessengerMyChatsAndGroups` + `enrichTradeRoomContextMetaForBootstrap` |
| 거래 탭에 **포함할 방** | `useCommunityMessengerHomeState` + `communityMessengerRoomIsTrade` | `contextMeta.kind === "trade"` **또는** `messengerDirectKey` 가 `trade_pc:` / `trade_item:` (DB `direct_key`) |
| 행 카테고리 칩·제목·가격·상태·썸네일·판매자명 | 우선 **`room.contextMeta`** (v1 trade). **1행 칩**은 **`categoryMenuLabel`**(5대 메뉴)만. **4행**은 **`sellerDisplayName`**(서버 enrich: `product_chats.seller_id`→`profiles`, 없으면 `posts.user_id`). `headline`·`priceLabel`·`productCategoryLabel`(leaf) 등은 제목·기타와 정합 | DB `community_messenger_rooms.summary` 문자열과 불일치할 수 있음 → 아래 §4 |
| **썸네일·제목이 가리키는 상품(원장)** | `messengerDirectKey` 가 `trade_pc:` / `trade_item:` 이면 **해당 ID로** `product_chats` 또는 `chat_rooms(item_trade)` → `posts` 를 조회해 `contextMeta` 를 **우선** 채운다(`enrichTradeRoomContextMetaFromDirectKeys`) | JSON `productChatId`·peer-최신추정(Phase D)과 **섞이면** 잘못된 글 썸네일이 붙을 수 있어, direct_key 가 있으면 그 경로를 단일 기준으로 쓴다 |

---

## 4. 확정 원인 (썸네일이 안 나오던 이유)

1. **파싱 소스 불일치**  
   목록 ViewModel이 **`room.summary`(DB 컬럼 문자열)** 만 `parseCommunityMessengerRoomContextMeta`에 넣었다.  
   실제로는 부트스트랩이 **`room.contextMeta` 객체만** 채우고 `summary` 컬럼은 비어 있거나 예전 텍스트인 경우가 많아, **썸네일/`postId`가 모델에 반영되지 않았다.**

2. **클라이언트 URL**  
   메타에 **스토리지 상대 경로**만 있으면 `resolvePostImagePublicUrl`은 **`NEXT_PUBLIC_SUPABASE_URL` 없으면** 브라우저에서 유효한 `https://…` 가 되지 않아 `<img>` 가 깨질 수 있다.

3. **pillar 분류**  
   예전에는 제목에 한글 `"거래"` 포함 여부 등으로만 추정해, **`direct_key` 가 거래 스레드인데도** 탭 분류가 어긋날 수 있었다. → **`messengerDirectKey`** 로 보완.

---

## 5. 목록 행 계약 (리스트 부분 정의)

**`listVisual === "trade"` 일 때 한 행은 다음을 만족한다.**

1. **레이아웃(당근식):** 좌측 `TradeProductThumb`(56px, radius 12px, 소형 카테고리 pill) + 중앙 3행 + 우측 시간·unread(`min-w-[56px]`, `shrink-0`, 시간 truncate 금지).
2. **본문 1행:** `{상대명} · {상품명}` (semibold, 1줄 truncate). 가격은 1행에 넣지 않음.
3. **본문 2행:** 마지막 메시지 preview (#6B7280).
4. **본문 3행:** `판매/구매`(선택) · 가격 · **상태 badge**(배경색 구분). 진행=녹색·예약=노랑·완료=회색. **우측 별도 상태 badge 없음.**
5. **필터:** 상단 progress 칩 **없음**(전체 목록). 더보기 페이지네이션만 유지.
6. **ViewModel:** `buildTradeChatListRowModel(room, t, viewerUserId?)` — `rolePrefix`, `statusTone`, `listingState` 등.
7. **썸네일·postId·realtime unread·최신순 정렬:** 기존과 동일.
8. **페이지(더보기):** 초기 **15건**만 렌더. 하단 「더보기」→ 시계방향 버퍼 스피너 → +15건. 필터 변경 시 visibleCount 리셋. `forceFlatList` 로 문서 스크롤 유지(가상 스크롤 비활성).
9. **meta hydrate:** 거래 탭(`pillar=trade`)은 **pillar 목록 방만**·배치 **15건** 상한.

---

## 6. 서버 보강 (목록용 메타가 비었을 때)

부트스트랩 경로에서 `enrichTradeRoomContextMetaForBootstrap` 이 `product_chats` · `chat_rooms` · 판매자·구매자 쌍 등으로 **`contextMeta`**(썸네일·제목·`productCategoryLabel`·`categoryMenuLabel`)을 채운 뒤, **동일 함수 마지막**에 `sellerDisplayName` 을 배치 주입한다(`product_chats.seller_id` 우선, 없으면 `posts.user_id` + `profiles` 최소 select). `productCategoryLabel` 은 해당 ID의 카테고리 행 `name` 이고, `categoryMenuLabel` 은 동일 글·카테고리 메타로 **대메뉴 5분류**를 산출한다. 제목(`headline`)은 `posts.title` 이 비면 `posts.meta` 의 흔한 키(`listing_title` 등)를 보조로 쓴다.

추가로, 클라이언트는 거래 탭에서 **`POST /api/community-messenger/trade-chat-list-meta`** 로 동일 로직을 배치 호출해 `contextMeta` 를 병합할 수 있다 (부트스트랩 레이스·구 데이터 대비).

---

## 7. 관련 파일 (유지보수 시）

| 역할 | 경로 |
|------|------|
| ViewModel·파싱·postId·listingState | `lib/community-messenger/trade-chat-list/view-model.ts`, `trade-chat-list-resolve.ts` |
| 필터 | `trade-chat-list-filters.ts`, `TradeChatListFilterBar.tsx` |
| 시간 포맷(짧은) | `trade-chat-list-timestamp.ts` |
| 클라 페이지·더보기 | `trade-chat-list-pagination.ts`, `use-trade-chat-list-client-pagination.ts`, `TradeChatListLoadMoreFooter.tsx` |
| 대메뉴 5분류·leaf 표시명 | `category-menu-label.ts`, `trade-post-row-fields.ts` |
| 썸네일 UI·폴백 fetch | `components/community-messenger/trade-chat-list/TradeProductThumb.tsx` |
| 행 본문 레이아웃 | `components/community-messenger/trade-chat-list/TradeChatListRowContent.tsx` |
| 행 조립 | `components/community-messenger/MessengerChatListItem.tsx` |
| 서버 썸네일 URL | `app/api/community-messenger/trade-post-thumbnail/route.ts` |
| 배치 메타 보강 | `app/api/community-messenger/trade-chat-list-meta/route.ts`, `lib/community-messenger/use-trade-chat-list-meta-hydration.ts` |
| pillar 분류 | `lib/community-messenger/messenger-room-domain.ts` |
| 부트스트랩 enrich | `lib/community-messenger/service.ts` (`enrichTradeRoomContextMetaForBootstrap`, `hydrateTradeChatListContextMetaForRoomIds`) |

---

## 8. 회귀 체크

- 거래 탭에서 행이 비거나 썸네일만 비면: §4 원인을 다시 의심한다.
- `buildTradeChatListRowModel` 을 수정할 때 **`tradeListParseSource`(contextMeta 우선)**, `categoryChipLabel`(`productCategoryLabel` 우선)·`postId` 출력을 깨뜨리지 않는다.
- `TradeProductThumb`: 직접 URL 오류 후 서버 URL 성공 시 **`failed` 상태가 플레이스홀더를 유지하지 않도록** 한다.

# 커뮤니티 메신저 — 거래 채팅 리스트 (Trade Chat List)

**범위:** `/community-messenger/trade-chats` 에서 보이는 **대화 목록 한 줄(행)** 에 대한 단일 정의. 방 내부 타임라인·방 헤더 상품 카드와 **데이터 소스가 다를 수 있으나**, 목록은 아래 계약을 따른다.

**연관:** [messenger-bootstrap-contract.md](./messenger-bootstrap-contract.md) §5, `lib/chat-domain/samarket-three-chat-pillars.ts`(거래 채팅 = `trade` 기둥).

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
| 행 제목·가격·상태·썸네일 경로 | 우선 **`room.contextMeta`** (v1 trade). 부트스트랩 객체에는 메모리 보강값이 실릴 수 있음 | DB `community_messenger_rooms.summary` 문자열과 불일치할 수 있음 → 아래 §4 |
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

1. **레이아웃:** 아바타 영역은 `TradeProductThumb`(상품 썸네일 또는 「거래」 플레이스홀더). 텍스트는 `TradeChatListRowContent` 의 3줄 규격.
2. **상품 텍스트:** `buildTradeChatListRowModel(room)` 파생 — 제목·가격 문자열·상태 뱃지용 문자열.
3. **썸네일 URL 결정 순서 (클라이언트):**
   - `contextMeta` / 직렬화 파싱 결과의 `thumbnailUrl` 등 후보 → `resolveTradeChatListThumbnailDisplayUrl`.
   - 여전히 비었거나 이미지 로드 실패 시, **`postId`가 있으면** `GET /api/community-messenger/trade-post-thumbnail?postId=` 로 서버가 **공개 URL** 을 확정 (환경변수는 서버에서만 사용).
4. **`postId`:** `buildTradeChatListRowModel` 가 `contextMeta`·파싱 결과에서 채운다. 폴백 API의 필수 입력.
5. **스와이프·롱프레스·네비:** `MessengerChatListItem` 공통. 거래 리스트만의 예외 분기를 두지 않는다.

**금지:** 거래 리스트만을 위해 방 안 헤더와 다른 “네 번째” 상품 데이터 원장을 새로 두지 않는다. 부족하면 **동일 `posts` / 동일 메타 계약**으로 보강한다.

---

## 6. 서버 보강 (목록용 메타가 비었을 때)

부트스트랩 경로에서 `enrichTradeRoomContextMetaForBootstrap` 이 `product_chats` · `chat_rooms` · 판매자·구매자 쌍 등으로 **`contextMeta`(썸네일 포함)** 을 채운다.

추가로, 클라이언트는 거래 탭에서 **`POST /api/community-messenger/trade-chat-list-meta`** 로 동일 로직을 배치 호출해 `contextMeta` 를 병합할 수 있다 (부트스트랩 레이스·구 데이터 대비).

---

## 7. 관련 파일 (유지보수 시）

| 역할 | 경로 |
|------|------|
| ViewModel·파싱·postId | `lib/community-messenger/trade-chat-list/view-model.ts` |
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
- `buildTradeChatListRowModel` 을 수정할 때 **`tradeListParseSource`(contextMeta 우선)** 과 `postId` 출력을 깨뜨리지 않는다.
- `TradeProductThumb`: 직접 URL 오류 후 서버 URL 성공 시 **`failed` 상태가 플레이스홀더를 유지하지 않도록** 한다.

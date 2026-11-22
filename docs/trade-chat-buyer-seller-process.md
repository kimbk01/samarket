# 거래 채팅 — 구매자·판매자 프로세스 (코드 기준 + 제품 의도)

**거래 B 개정 (Owner 2026-10-28, Facebook Marketplace 방식):** 판매자는 **판매중 → 판매완료만** 한다.
예약·문의중 단계, 구매자 지정, 구매 확정, 후기, 판매완료 되돌리기는 **없다**. 데이터(`transaction_reviews`·예전 방 상태)는 보존한다.

**거래 평가 개정 (Owner 2026-11-16 「거래 평가 살리기」) — 결정됨 · 구현됨(CREW REP S5, 2026-11-22 정정):** 구매자 지정·구매 확정·예약·되돌리기가 없는 것은 **그대로 유지**한다.
대신 **실제로 대화한 거래 상대끼리만** 서로 「거래 평가」(좋아요·보통·아쉬워요 + 태그)를 남길 수 있다. 판매자·구매자 양방향이며, 구매자가 판매자를 확인하는 CREW REP 거래 신뢰(T)의 유일한 원천이다.
자격·공개·이의제기·악용 방지 규칙의 단일 정의는 **`docs/audit/crew-rep-manner-battery-audit-design-2026-11-16.md` §7**. 평가 경로 `app/api/trade/product-chat/[roomId]/rating`(GET 자격·POST 제출)와 거래방 평가 줄이 동작한다 — 자격 판정 `lib/trade/trade-rating.ts` `evaluateTradeRatingEligibility`(E1~E7).
알림(감사 P3, 2026-11-22): 판매완료 → 평가 자격이 되는 대화 상대에게, 평가 저장(공개 전) → 받은 사람에게 — `lib/trade/notify-trade-sold-and-rating.server.ts`.

같은 글·같은 구매자당 거래 채팅 스레드는 하나만 유지하고, 여러 구매자는 각각 별도 스레드를 갖는다 — 세부 규칙·DB 앵커는 **`docs/trade-chat-room-identity.md`** 참고.

## 1. 제품 의도 (요약)

| 구간 | 구매자 | 판매자 |
|------|--------|--------|
| **판매중** | 상세 **채팅하기**로 새 방·기존 방 진입, 찜, 신고 | 채팅 응답. 내 물품 ⋮ · 상세 ⋯ · 메신저 거래방 줄에서 **「판매완료로 변경」** |
| **판매완료** | **기존 방은 이어서 들어감**. 새 방은 어드민 「판매 완료 후 채팅 허용」일 때만 | 상태 메뉴 없음(되돌리기 없음) |

- 판매완료 = 글 단위 한 경로 `POST /api/posts/[postId]/owner-status { listing: "sold" }`. 구매자를 지정하지 않는다(앱 밖 거래 포함).
- 판매완료 시 그 글의 모든 거래방에 시스템 메시지·상태 방송(`applySellerListingChangeSideEffectsServer`).

## 2. 코드 매핑

### 상세 글 — 채팅 CTA
- **`components/post/PostDetailView.tsx`** — `chatBlockedByCompleted = completed && !existingTradeRoomId && !allowChatAfterSold`.
- 서버 **`lib/trade/item-trade-chat-start-core.ts`** — 기존 방은 판매완료와 관계없이 이어 준다. 새 방은 판매완료면 어드민 설정이 켜졌을 때만.
  새 방 생성 직전에 가입 완료 검사(`requireSignupCompleteForUser`)와 생성 횟수 제한(`enforceTradeChatNewRoomQuota`, 분당 25).

### 판매자 — 판매완료
- **`POST /api/posts/[postId]/owner-status`** — `{ listing: "sold" }` 만. `{ listing: "selling" }` 400 `sold_is_final`, 예약 400 `reserved_not_supported`.
- **`POST /api/posts/[postId]/seller-listing-state`** — 예약 요청 400 `reserved_not_supported`. 판매완료 이후 변경 불가(`canSellerListingTransition`).
- 화면: `MyProductActions`(내 물품 ⋮), `PostDetailSellerMoreSheet`(상세 ⋯), `CommunityMessengerTradeProcessSection`(메신저 거래방 줄).

### 닫힌 회원 경로 (410 `trade_sold_only`)
- `POST /api/trade/product-chat/[roomId]/seller-complete` — 구매자 지정 판매완료
- `POST /api/trade/product-chat/[roomId]/buyer-confirm` — 구매 확정
- `POST /api/chat/rooms/[roomId]/trade-status` — 방 단위 거래 단계
- 후기 경로(`submit-review` 등)는 A 단계에서 410 `reviews_removed`.
- 운영자 경로(`/api/admin/trade-flow/*`)는 그대로.

## 3. 남아 있는 것 (동작 영향 없음, 기록)
- 예약 기반 차단 함수(`lib/trade/reserved-item-chat.ts`) — 예약 쓰기가 막혀 항상 거짓.
- 예전 채팅 화면(`ChatDetailView`)의 단계 메뉴·`TradeFlowBanner` — 거래 방은 `/chats/[roomId]` 에서 항상 메신저로 redirect 되어 사용자에게 보이지 않는다.
- `PurchaseHistoryCard` — 어디에서도 렌더하지 않는다.
- 이미 `seller_marked_done` 인 방(운영 2건)은 상태만 남는다.

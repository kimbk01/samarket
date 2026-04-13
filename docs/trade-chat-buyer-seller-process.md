# 거래 채팅 — 구매자·판매자 프로세스 (코드 기준 + 제품 의도)

메신저로 거래 채팅을 옮길 때 **동일 동작을 유지**하기 위한 단일 참고 문서.  
폴백: 문제 시 기존 거래 채팅 경로(`/mypage/trade/chat`, `/chats/...`) 유지.

## 1. 제품 의도 (요약)

| 구간 | 구매자 | 판매자 |
|------|--------|--------|
| **판매중·문의중** (`inquiry` / `negotiating`) | 상세 **채팅하기**로 신규·기존 방 진입 | 동일 글에 대해 채팅·단계 조작 |
| **예약중** (`reserved`) | **예약자만** 새 채팅 시도 가능(타인 차단). 기존 방은 이어가기 | 예약·단계는 채팅/글 상태로 관리 |
| **판매완료** (`sold` / `completed`) | 상세 **채팅하기 비활성**(설정 예외 제외) | 거래 마무리 후 후속 조작은 채팅·API 정책 따름 |
| **채팅 안** | 메시지·구매자 확인·후기·문제 접수 | **거래 단계·판매완료·글 상태** 등 **진행 주도** |
| **거래 종료 후** | **후기·평가** → 신뢰/매너(온도) 반영 | (판매자 후기 정책은 API·제품 정의 따름) |

## 2. 코드 매핑

### 상세 글 — 채팅 CTA

- **`components/post/PostDetailView.tsx`**
  - `showChat`: 카테고리·타입·`chatEnabled`
  - `isSold` + `allowChatAfterSold`(앱 설정): **판매완료 시 버튼 비활성** 기본
  - `chatBlockedByOtherReservation`: `shouldBlockNewItemChatForBuyer` — **예약중인데 내가 예약자가 아님** → 신규 채팅 차단
  - 버튼 `disabled`: `(isSold && !allowChatAfterSold) || chatCtaBusy || chatBlockedByOtherReservation`
  - 진입: `createOrGetChatRoom` → `tradeHubChatRoomHref` → **거래 허브** `/mypage/trade/chat/...`

### 예약·타 구매자 차단

- **`lib/trade/reserved-item-chat.ts`**
  - `shouldBlockNewItemChatForBuyer` — `seller_listing_state === reserved` 이고 `roomBuyerId`(시도하는 사용자) ≠ `reserved_buyer_id` 이면 차단
  - 채팅방 내 메시지 차단: `shouldBlockItemTradeMessagingForReservation`

### 판매 단계 라벨·DB

- **`lib/products/seller-listing-state.ts`**
  - `inquiry` 판매중 · `negotiating` 문의중 · `reserved` 예약중 · `completed` 거래완료
  - API: `POST /api/posts/[id]/seller-listing-state` (판매자)

### 판매자 전용 — 거래 진행

- **`POST /api/chat/rooms/[roomId]/trade-status`** — 판매자만, `chat_rooms.trade_status` + 글 `posts.status` 동기화
- **`POST /api/trade/product-chat/[roomId]/seller-complete`** — 판매자만 거래완료 처리

### 구매자 전용 — 확인·후기·이슈

- **`POST .../buyer-confirm`** — 구매자 거래완료 확인 (신뢰 점수 등)
- **`POST .../submit-review`** — 구매자 후기
- **`POST .../buyer-issue`** — 구매자 분쟁 접수

### 채팅 UI — 역할 분기

- **`components/chats/ChatDetailView.tsx`** — `amISeller`에 따라 CTA·패널·거래 UI 분기

## 3. 말로만 있던 것 vs 코드에서 확인된 것

| 항목 | 상태 |
|------|------|
| 판매중~문의중 채팅 가능 | ✅ `inquiry`/`negotiating`은 예약 차단·판매완료만 아니면 CTA 허용 |
| 예약중 비예약자 채팅 불가 | ✅ `reserved_buyer_id` + `shouldBlockNewItemChatForBuyer` |
| 판매완료 채팅 비활성 | ✅ `post.status === sold"` + `allowChatAfterSold`가 아니면 비활성 |
| 판매자가 채팅에서 진행 주도 | ✅ trade-status·seller-listing-state·seller-complete 등 |
| 구매자 후기 → 매너/배터리 | ✅ buyer-confirm·submit-review·trust delta (해당 API 내부) |

## 4. 주의 (엣지·설정)

- **`allowChatAfterSold === true`** 이면 판매완료 후에도 CTA가 살아날 수 있음 — 운영 설정으로만 켬.
- **예약중**인데 `reserved_buyer_id`가 비어 있으면 `shouldBlockNewItemChatForBuyer`가 약해질 수 있음 — 데이터 정합성 유지 필요.
- **메신저 단일화** 후에도 위 **비즈니스 규칙은 동일**해야 하며, 진입 URL만 `/community-messenger/...`로 바꿀 경우 **동일 조건으로 CTA·라우팅**을 맞출 것.

## 5. 변경 시 체크리스트

- [ ] 상세 채팅 CTA 비활성 조건 = `PostDetailView`와 동일?
- [ ] 예약자/비예약자 분기 = `reserved-item-chat` 로직 재사용 또는 동일 구현?
- [ ] 채팅 내 판매자/구매자 API 권한 = 기존과 동일?
- [ ] 폴백 경로(거래 허브) 문서화·플래그?

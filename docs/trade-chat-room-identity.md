# 거래 채팅 — 방 식별·중복 방지 (제품 기준)

## 규칙

1. **상품(글) × 구매자당 채팅 스레드는 하나** — 동일 판매 글에 대해 한 구매자는 하나의 거래 채팅만 사용한다.
2. **여러 회원이 같은 글에 문의할 수 있다** — 구매자 A, B, C는 각각 **서로 다른** 1:1 스레드를 갖는다(규칙 1은 “같은 구매자”에 대해서만 적용).
3. **동일 상품 + 동일 구매자 = 방 1개** — `item_id`·`seller_id`·`buyer_id` 조합에 대해 `item_trade` 방이 **여러 개 생기면 안 된다**. 동시 요청 race 는 DB 유니크 제약 + API 재조회로 흡수한다.
4. **UI** — 메신저 거래 방·목록에서 **조회자가 판매자인지 구매자인지**에 따라 `--messenger-trade-*` 틴트로 배경을 구분한다(접근성: 색만으로 의미를 전부 전달하지 않는다).

## 구현 앵커

- `POST /api/chat/item/start` — 기존 `chat_rooms` 조회 후 없을 때만 insert; 유니크 충돌 시 기존 방으로 응답.
- `product_chats` — `(post_id, seller_id, buyer_id)` 유니크(기존).
- `chat_rooms` — `room_type = 'item_trade'` 일 때 `(item_id, seller_id, buyer_id)` 유니크 인덱스(마이그레이션).
- 메신저 `direct_key` — `trade_item:` / `trade_pc:` 로 친구 DM 과 분리(`lib/community-messenger/service.ts`).

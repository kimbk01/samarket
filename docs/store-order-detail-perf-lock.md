# Store order detail GET — read-only perf lock

`GET /api/me/store-orders/[orderId]` — 구매자 주문 상세 스냅샷.

**계약:** 응답 JSON shape·주문/채팅 unread semantics·realtime·UI·mark_read·bootstrap lite **불변**.

## 구조 (2026-05-21)

| 경로 | 역할 |
|------|------|
| `GET .../store-orders/[orderId]` | **read-only** — `get_buyer_store_order_detail_snapshot` 1 RTT (miss 시 legacy 병렬) |
| `GET .../stores/[storeId]/orders/[orderId]` | **read-only** — `get_owner_store_order_detail_snapshot` (gate+order+items+delivery+review) |
| `POST .../store-orders/[orderId]/ensure-chat` | room ensure + summary (mutation) |
| `POST /api/me/store-orders` | 주문 생성 시 ensure (기존) |
| 상태 전환 | `appendStoreOrderMessengerStatusTransition` → ensure |
| 채팅 진입 RSC | `ensureStoreOrderMessengerRoom` on chat pages |

**GET 금지:** `ensureStoreOrderMessengerRoom`, participant upsert, room update, summary append, unread sync.

## Dev 로그

```text
[store-order-detail-perf] { snapshot_via: rpc_snapshot|legacy_parallel, db_round_trips, rpc_wall_ms, auth_ms, order_fetch_ms, items_fetch_ms, ... ensure_skipped: 1 }
```

회귀 시 `[store-order-detail-perf-lock]` warn (`ensure_still_running_on_get`).

## SLO (참고)

| 환경 | cold GET | warm GET |
|------|----------|----------|
| local_linked | ≤ **500ms** (WARN) | ≤ **150ms** |
| prod_same_region | ≤ **250ms** 목표 | ≤ **100ms** |

`ensure_room_ms > 0` on GET → **구조 FAIL**.

## 검증

1. Dev Network: `GET /api/me/store-orders/{id}` — `ensure_skipped: 1`, wall ≤500ms (linked, no compile).
2. 레거시 `room_id` 없음: 채팅 탭/페이지 또는 `POST .../ensure-chat` 후 `room_id` 반영.
3. `order_chat_ready` = `Boolean(community_messenger_room_id)` on GET.

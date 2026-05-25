# Store Order Detail Regression Lock

Buyer store order detail on `GET /api/me/store-orders/[orderId]`.

**Purpose:** prevent re-introduction of request-time order detail monolith aggregate bottlenecks (SOD1).

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Order + items + store + delivery + review parallel chain | 5 RTT cold | **1 RTT:** `get_store_order_detail_snapshot` or counter PK read |
| Repeated order/item/profile/payment joins | Per-wave PostgREST | Precomputed in unified RPC bundle |
| Payment / refund / rider merge at request time | Client-side merge chain | Bundled in RPC payload |
| Timeline / unread merge on detail GET | Separate fetches | Bundled in RPC (events route unchanged) |
| Ownership re-validation chain | Repeated buyer filter joins | RPC `SECURITY DEFINER` + buyer gate |

## Forbidden patterns

- Multiple aggregate queries on cold snapshot path (max **1** DB round trip for detail body)
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on detail hot path
- Sequential `await` for independent order/items/delivery/review on snapshot path
- Request-time aggregate recompute when unified RPC exists
- Legacy 5-RTT parallel detail as normal when RPC deployed
- Reconnect full detail recompute (use snapshot refresh + MRC1 merge rules)
- Fallback as steady-state path when RPC + counter table exist

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `store_order_detail_snapshots` |
| Snapshot counter miss / stale serve | **1** RPC | `get_store_order_detail_snapshot` |
| Legacy fallback | **5** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| DB snapshot counter | `(order_id, viewer_user_id, viewer_scope)` | 8s fresh + event refresh | `store-order-detail-snapshot.ts` |
| Single-flight | `sod1-order-detail-snapshot:{orderId}:{buyerId}` | in-flight only | `store-order-detail-snapshot.ts` |
| Events read cache | `orderId` | route TTL | `store-order-events-read-cache.ts` |

## Snapshot ownership

- **Write:** order status / payment / refund / rider / timeline / unread events → `invalidateStoreOrderDetailSnapshot` → `scheduleStoreOrderDetailSnapshotRefresh`
- **Read:** `tryLoadBuyerStoreOrderDetailFromSnapshot` → counter row → unified RPC → legacy fallback
- **Semantics:** unchanged `{ ok, order, items, delivery, review, review_status, can_submit_review, order_chat_ready }` — UI unchanged

## Invalidation flow (required events)

1. Order create (`POST /api/me/store-orders`)
2. Order accept / reject / preparing / delivering / complete (owner PATCH via `applyStoreOrderStatusTransition`)
3. Buyer cancel / refund request / hide (`PATCH` / `DELETE` detail route)
4. Payment update (`recordStoreOrderPaid` events via `createStoreOrderEvent`)
5. Refund approve/reject (admin + buyer flows)
6. Rider assign/change (delivery milestone events)
7. Chat unread change (bundled in RPC refresh)
8. Timeline append (`createStoreOrderEvent` + `invalidateStoreOrderEventsReadCache`)

## Timeline semantics lock

- Detail GET body does **not** include timeline (separate `GET .../events` route — unchanged)
- RPC bundles timeline for counter refresh only; response assembler ignores for API shape
- Event ordering: `created_at ASC` in RPC bundle (same as events read cache)

## Payment / refund semantics lock

- `payment_status`, `payment_amount`, buyer payment method fields — sourced from order row via `get_buyer_store_order_detail_snapshot`
- Refund state derived from `order_status` (`refund_requested`, `refunded`) — no separate refund table merge on hot path
- Delivery public fields: buyer sanitization (`delivered_receiver_hint` masking) — CPU-only in assemble

## Reconnect rules (MRC1 — do not break)

- `snapshot_version` monotonic merge on client realtime paths
- Stale reconnect discard — do not overwrite fresher snapshot with older reconnect payload
- Cross-tab consistency — no full detail recompute on reconnect
- Duplicate realtime discard

## Regression guards

Runtime: `lib/stores/store-order-detail-snapshot-regression-guard.ts`

Log tags: `[store-order-detail-regression-alert]`, `[store-order-detail-monolith-analysis]`, `[store-order-detail-snapshot-rpc-design]`, `[store-order-detail-snapshot-fallback]`

Verify: `npm run verify:store-order-detail-snapshot-rpc`, `npm run verify:store-order-detail-snapshot-e2e`

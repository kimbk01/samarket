import { describe, expect, it, beforeEach } from "vitest";
import { isStoreOrderEventVisibleToBuyer } from "@/lib/stores/store-order-event-audience";
import type { StoreOrderEventRow } from "@/lib/stores/store-order-events";
import {
  peekStoreOrderEventsReadCacheMeta,
  setStoreOrderEventsReadCache,
  storeOrderEventsReadCacheKey,
  writeThroughStoreOrderEventsReadCache,
} from "@/lib/stores/store-order-events-read-cache";

const ORDER = "order-qa-1";
const OWNER = "owner-user";
const BUYER = "buyer-user";

function evt(partial: Partial<StoreOrderEventRow> & Pick<StoreOrderEventRow, "id" | "event_type">): StoreOrderEventRow {
  return {
    id: partial.id,
    order_id: ORDER,
    store_id: "store-1",
    actor_user_id: null,
    actor_role: "system",
    event_type: partial.event_type,
    from_status: null,
    to_status: null,
    message: null,
    dedupe_key: null,
    metadata: partial.metadata ?? {},
    created_at: partial.created_at ?? "2026-05-24T10:00:00.000Z",
  };
}

describe("store-order-events-read-cache QA", () => {
  beforeEach(() => {
    const g = globalThis as {
      __samarketStoreOrderEventsReadCache?: Map<string, unknown>;
      __samarketStoreOrderEventsCacheOps?: Map<string, unknown>;
    };
    delete g.__samarketStoreOrderEventsReadCache;
    delete g.__samarketStoreOrderEventsCacheOps;
  });

  it("1) write-through append makes new event visible on cache_hit=1 poll", () => {
    const key = storeOrderEventsReadCacheKey({ orderId: ORDER, viewerUserId: OWNER, audience: "owner" });
    const e1 = evt({ id: "e1", event_type: "order_created", created_at: "2026-05-24T10:00:00.000Z" });
    setStoreOrderEventsReadCache(key, { ok: true, events: [e1] });

    const e2 = evt({ id: "e2", event_type: "order_accepted", created_at: "2026-05-24T10:01:00.000Z" });
    writeThroughStoreOrderEventsReadCache(ORDER, e2);

    const hit = peekStoreOrderEventsReadCacheMeta(key, ORDER);
    expect(hit.hit).toBe(true);
    expect(hit.body?.events.map((e) => (e as StoreOrderEventRow).id)).toEqual(["e1", "e2"]);
  });

  it("2) write-through does not duplicate events with the same id", () => {
    const key = storeOrderEventsReadCacheKey({ orderId: ORDER, viewerUserId: OWNER, audience: "owner" });
    const e1 = evt({ id: "e1", event_type: "order_created" });
    setStoreOrderEventsReadCache(key, { ok: true, events: [e1] });

    writeThroughStoreOrderEventsReadCache(ORDER, e1);
    writeThroughStoreOrderEventsReadCache(ORDER, e1);

    const hit = peekStoreOrderEventsReadCacheMeta(key, ORDER);
    expect(hit.body?.events).toHaveLength(1);
  });

  it("3) buyer cache skips owner-only events on write-through", () => {
    const ownerKey = storeOrderEventsReadCacheKey({ orderId: ORDER, viewerUserId: OWNER, audience: "owner" });
    const buyerKey = storeOrderEventsReadCacheKey({ orderId: ORDER, viewerUserId: BUYER, audience: "buyer" });
    setStoreOrderEventsReadCache(ownerKey, { ok: true, events: [evt({ id: "e1", event_type: "order_created" })] });
    setStoreOrderEventsReadCache(buyerKey, { ok: true, events: [evt({ id: "e1", event_type: "order_created" })] });

    const ownerOnly = evt({
      id: "e-owner",
      event_type: "order_payment_completed_owner",
      created_at: "2026-05-24T10:02:00.000Z",
    });
    expect(isStoreOrderEventVisibleToBuyer(ownerOnly)).toBe(false);

    writeThroughStoreOrderEventsReadCache(ORDER, ownerOnly);

    const ownerHit = peekStoreOrderEventsReadCacheMeta(ownerKey, ORDER);
    const buyerHit = peekStoreOrderEventsReadCacheMeta(buyerKey, ORDER);
    expect(ownerHit.body?.events.map((e) => (e as StoreOrderEventRow).id)).toContain("e-owner");
    expect(buyerHit.body?.events.map((e) => (e as StoreOrderEventRow).id)).not.toContain("e-owner");
  });

  it("4) setStoreOrderEventsReadCache merges with write-through (no stale overwrite)", () => {
    const key = storeOrderEventsReadCacheKey({ orderId: ORDER, viewerUserId: OWNER, audience: "owner" });
    const e1 = evt({ id: "e1", event_type: "order_created", created_at: "2026-05-24T10:00:00.000Z" });
    setStoreOrderEventsReadCache(key, { ok: true, events: [e1] });

    const e2 = evt({ id: "e2", event_type: "order_accepted", created_at: "2026-05-24T10:01:00.000Z" });
    writeThroughStoreOrderEventsReadCache(ORDER, e2);

    // stale DB fetch completes after insert — must not drop e2
    setStoreOrderEventsReadCache(key, { ok: true, events: [e1] }, "read_fetch_stale");

    const hit = peekStoreOrderEventsReadCacheMeta(key, ORDER);
    expect(hit.hit).toBe(true);
    expect(hit.body?.events.map((e) => (e as StoreOrderEventRow).id)).toEqual(["e1", "e2"]);
  });
});

/**
 * v4 W1 API-01 — 오너 주문 지표 캐시 누수 회귀 방지.
 * 소유자 A 요청으로 캐시가 찬 직후(5초 TTL 안) 다른 로그인 사용자 B 가 같은 매장을 요청하면
 * 캐시 적중 없이 403 이어야 하고, 매출·주문 수가 응답에 실리면 안 된다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "owner-a";
const OTHER = "user-b";
const STORE = "store-1";

let currentUser: string | null = OWNER;
const fetchCounts = vi.fn();
const pendingQuery = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({
  getRouteUserId: async () => currentUser,
}));

const fakeSb = {
  from: (table: string) => {
    pendingQuery(table);
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: { id: "order-latest" }, error: null }),
    };
    return chain;
  },
};
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fakeSb }));

vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async (_sb: unknown, userId: string, storeId: string) =>
    userId === OWNER
      ? {
          ok: true,
          store: { id: storeId, owner_user_id: OWNER, approval_status: "approved", owner_can_edit_store_identity: true },
        }
      : { ok: false, status: 403, error: "forbidden" },
}));

vi.mock("@/lib/stores/fetch-owner-store-order-counts", () => ({
  fetchOwnerStoreOrderCountsWithMeta: (...args: unknown[]) => fetchCounts(...args),
}));

vi.mock("@/lib/stores/delivery-summary-snapshot-cache", () => ({
  invalidateDeliverySummarySnapshotCache: () => {},
}));
vi.mock("@/lib/delivery/owner/owner-store-orders-list-snapshot-refresh", () => ({
  scheduleOwnerStoreOrdersListSnapshotRefresh: () => {},
}));

import { EMPTY_OWNER_STORE_OPS_SNAPSHOT } from "@/lib/stores/owner-store-ops-snapshot";
import { GET } from "@/app/api/me/stores/[storeId]/order-counts/route";
import {
  invalidateStoreOrderCountsCache,
  peekStoreOrderCountsCacheHit,
  primeStoreOrderCountsCache,
} from "@/lib/stores/store-order-counts-cache";
import { invalidateOwnerStoreOwnershipCache } from "@/lib/stores/owner-store-ownership-cache";

const req = () => new Request(`http://localhost/api/me/stores/${STORE}/order-counts`);
const ctx = { params: Promise.resolve({ storeId: STORE }) };

beforeEach(() => {
  currentUser = OWNER;
  fetchCounts.mockReset();
  pendingQuery.mockReset();
  invalidateOwnerStoreOwnershipCache();
  invalidateStoreOrderCountsCache(STORE, null, { scheduleListRefresh: false });
  fetchCounts.mockResolvedValue({
    via: "delivery_summary_snapshot",
    snapshot: { ...EMPTY_OWNER_STORE_OPS_SNAPSHOT, today_completed_sales_amount: 12345, today_order_count: 7 },
  });
});

describe("API-01 오너 지표 캐시 — 소유자 검증 우선 + user+store 키", () => {
  it("소유자 A 로 캐시가 찬 직후 다른 사용자 B 는 캐시 적중 없이 403, 지표 미노출", async () => {
    const a = await GET(req(), ctx);
    expect(a.status).toBe(200);
    expect((await a.json()).today_completed_sales_amount).toBe(12345);
    expect(peekStoreOrderCountsCacheHit(STORE, OWNER)).toBe(true);

    currentUser = OTHER;
    const b = await GET(req(), ctx);
    expect(b.status).toBe(403);
    const body = await b.json();
    expect(body.ok).toBe(false);
    expect(body).not.toHaveProperty("today_completed_sales_amount");
    expect(body).not.toHaveProperty("today_order_count");
    // 지표 조회·pending 주문 조회 모두 실행되지 않음 (검증 실패 시 즉시 종료)
    expect(fetchCounts).toHaveBeenCalledTimes(1);
  });

  it("캐시 키는 user+store — B 키로는 A 의 캐시가 보이지 않는다", () => {
    primeStoreOrderCountsCache(STORE, OWNER, { ok: true, ...EMPTY_OWNER_STORE_OPS_SNAPSHOT });
    expect(peekStoreOrderCountsCacheHit(STORE, OWNER)).toBe(true);
    expect(peekStoreOrderCountsCacheHit(STORE, OTHER)).toBe(false);
  });

  it("매장 단위 무효화(소유자 id 없이 호출)는 해당 매장의 모든 사용자 캐시를 지운다", () => {
    primeStoreOrderCountsCache(STORE, OWNER, { ok: true, ...EMPTY_OWNER_STORE_OPS_SNAPSHOT });
    primeStoreOrderCountsCache("store-2", OWNER, { ok: true, ...EMPTY_OWNER_STORE_OPS_SNAPSHOT });
    invalidateStoreOrderCountsCache(STORE, null, { scheduleListRefresh: false });
    expect(peekStoreOrderCountsCacheHit(STORE, OWNER)).toBe(false);
    expect(peekStoreOrderCountsCacheHit("store-2", OWNER)).toBe(true);
  });

  it("소유자 본인의 두 번째 요청은 캐시 적중(지표 재조회 없음)", async () => {
    await GET(req(), ctx);
    const again = await GET(req(), ctx);
    expect(again.status).toBe(200);
    expect(fetchCounts).toHaveBeenCalledTimes(1);
  });
});

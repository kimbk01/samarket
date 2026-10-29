/**
 * v4 W1 고객 me/* — API-13 신고 quota · API-10 오류 원문 미노출 · API-18 구매자 이벤트 actor_user_id 제거.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const RAW = 'insert or update on table "store_reports" violates foreign key constraint "secret_fk"';
const state = vi.hoisted(() => ({
  insertError: null as null | { message: string },
  buyerOk: true,
  userSeq: 0,
}));

vi.mock("@/lib/http/rate-limit-redis", () => ({
  getOptionalRateLimitRedis: () => null,
  rateLimitIncrCount: async () => 0,
  rateLimitPttlMs: async () => 0,
  rateLimitRedisStorageKey: (k: string) => k,
}));
vi.mock("@/lib/auth/server-guards", () => ({
  requireAuth: async () => ({ ok: true, userId: `buyer-${state.userSeq}` }),
  validateActiveSession: async () => ({ ok: true, profile: {} }),
  requirePhoneVerified: async () => ({ ok: true }),
}));
vi.mock("@/lib/auth/ensure-api-route-auth-gate", () => ({
  ensureApiRouteAuthGate: async () => ({
    ok: true,
    userId: `buyer-${state.userSeq}`,
    auth_ms: 0,
    auth_cache_hit: 0,
    auth_source: "test",
  }),
}));
vi.mock("@/lib/stores/store-order-event-ownership-cache", () => ({
  resolveStoreOrderEventOwnershipCached: async () => ({
    ok: true,
    buyerOk: state.buyerOk,
    audience: state.buyerOk ? "buyer" : "owner",
    ownership_ms: 0,
    ownership_cache_hit: 0,
  }),
}));

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "gte", "limit", "order", "insert"]) c[k] = () => c;
  c.maybeSingle = async () => result;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}
const fakeSb = {
  from: (table: string) => {
    if (table === "stores") return chain({ data: { id: "s1", approval_status: "approved", is_visible: true }, error: null });
    if (table === "store_order_events") {
      return chain({
        data: [
          {
            id: "e1",
            order_id: "o1",
            store_id: "s1",
            actor_user_id: "owner-secret-uid",
            actor_role: "owner",
            event_type: "order_accepted",
            metadata: {},
            created_at: "2026-10-29T00:00:00Z",
          },
        ],
        error: null,
      });
    }
    // store_reports: 최근 중복 조회 = 없음, insert = state.insertError
    const c = chain({ data: null, error: null });
    c.insert = () => chain({ data: state.insertError ? null : { id: "r1" }, error: state.insertError });
    return c;
  },
};
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fakeSb }));

import { POST as postReport } from "@/app/api/me/store-reports/route";
import { GET as getEvents } from "@/app/api/me/store-orders/[orderId]/events/route";
import { invalidateStoreOrderEventsReadCache } from "@/lib/stores/store-order-events-read-cache";

const report = () =>
  postReport(
    new Request("http://localhost/api/me/store-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ store_slug: "shop", target_type: "store", reason_type: "spam", message: "x" }),
    }) as never
  );

beforeEach(() => {
  state.userSeq += 1;
  state.insertError = null;
  state.buyerOk = true;
  invalidateStoreOrderEventsReadCache();
});

describe("API-13 매장 신고 quota", () => {
  it("사용자당 시간당 40회 초과 = 429 report_rate_limited", async () => {
    for (let i = 0; i < 40; i += 1) {
      expect((await report()).status).not.toBe(429);
    }
    const limited = await report();
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("report_rate_limited");
  });
});

describe("API-10 고객 오류 원문 미노출", () => {
  it("신고 insert 실패 → 500 save_failed, DB 원문 미포함", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.insertError = { message: RAW };
    const res = await report();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "save_failed" });
    expect(text).not.toContain("secret_fk");
  });
});

describe("API-18 구매자 주문 이벤트 actor_user_id 제거", () => {
  const ctx = { params: Promise.resolve({ orderId: "o1" }) };
  it("구매자 응답(조회·캐시 적중 모두)에 actor_user_id 없음, actor_role 유지", async () => {
    for (let i = 0; i < 2; i += 1) {
      const res = await getEvents(new Request("http://localhost/x"), ctx);
      const text = await res.text();
      expect(text).not.toContain("owner-secret-uid");
      const body = JSON.parse(text) as { events: Array<Record<string, unknown>> };
      expect(body.events).toHaveLength(1);
      expect(body.events[0]).not.toHaveProperty("actor_user_id");
      expect(body.events[0].actor_role).toBe("owner");
    }
  });

  it("오너(비구매자) 응답은 기존 원장 그대로", async () => {
    state.buyerOk = false;
    const res = await getEvents(new Request("http://localhost/x"), ctx);
    const body = (await res.json()) as { events: Array<Record<string, unknown>> };
    expect(body.events[0].actor_user_id).toBe("owner-secret-uid");
  });
});

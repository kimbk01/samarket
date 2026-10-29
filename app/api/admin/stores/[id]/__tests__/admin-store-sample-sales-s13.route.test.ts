/** 3-C S-13 — 샘플 매장 판매 승인: DB 트리거 예외(sample_store_cannot_sell)는 500 update_failed 가 아니라 409 + 사유. */
import { describe, expect, it, vi } from "vitest";

let upsertError: { message: string } | null = null;

function makeSb() {
  return {
    from(table: string) {
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () =>
          table === "stores"
            ? { data: { id: "store-9", approval_status: "approved", slug: "s", store_name: "샘플", owner_user_id: null }, error: null }
            : { data: null, error: null },
        upsert: async () => ({ error: upsertError }),
      };
      return b;
    },
  };
}

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" } }),
}));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "admin-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/admin-business/admin-store-decision", async () => {
  const rules = await vi.importActual<Record<string, unknown>>("@/lib/admin-business/admin-store-decision-rules");
  return { ...rules, safeNotifyOwnerStoreDecision: vi.fn(async () => true) };
});
vi.mock("@/lib/admin-business/load-business-control-center-detail", () => ({ loadBusinessControlCenterDetail: vi.fn() }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({ bumpStorePublicSharedCacheGeneration: vi.fn() }));
vi.mock("@/lib/stores/store-home-feed-server-cache", () => ({ clearStoreHomeFeedServerCache: vi.fn() }));
vi.mock("@/lib/stores/store-public-cache-invalidate-server", () => ({ invalidateStorePublicCachesForSlugOnServer: vi.fn() }));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({ invalidateMeStoresListServerCache: vi.fn() }));

import { PATCH } from "@/app/api/admin/stores/[id]/route";

const ctx = { params: Promise.resolve({ id: "store-9" }) };
const req = (body: unknown) =>
  new Request("http://localhost/api/admin/stores/store-9", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

describe("3-C S-13 sample sales approval", () => {
  it("트리거 예외 → 409 sample_store_cannot_sell", async () => {
    upsertError = { message: "sample_store_cannot_sell" };
    const res = await PATCH(req({ action: "approve_sales", reason: "테스트 승인" }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "sample_store_cannot_sell" });
  });

  it("그 밖의 DB 오류는 기존대로 500 update_failed", async () => {
    upsertError = { message: "connection reset" };
    const res = await PATCH(req({ action: "approve_sales", reason: "테스트 승인" }), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("update_failed");
  });
});

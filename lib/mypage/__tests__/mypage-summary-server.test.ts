import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadMypageSummaryFieldsServer,
  type MypageSummaryDeps,
} from "@/lib/mypage/mypage-summary.server";
import { filterMyProductsByListingAxis } from "@/lib/products/my-product-listing-filter";
import { customerWalletPresentationTab } from "@/lib/stores/customer-coupon-wallet-view";
import { isGiftWalletOwnedStatus } from "@/lib/gift-certificate/load-gift-wallet";
import type { Product } from "@/lib/types/product";

const sb = {} as never;

const posts = [
  { id: "p1", status: "active", sellerListingState: "selling" },
  { id: "p2", status: "active", sellerListingState: "sold" },
  { id: "p3", status: "hidden", sellerListingState: "selling" },
  { id: "p4", status: "active", sellerListingState: "reserved" },
];

const okDeps = (): MypageSummaryDeps => ({
  loadMyPosts: vi.fn(async () => ({ ok: true as const, posts: posts as never })),
  loadFavoritePosts: vi.fn(async () => ({ ok: true as const, items: [{ id: "a" }, { id: "b" }] as never })),
  listPriceOffers: vi.fn(async () => ({
    ok: true as const,
    value: [{ status: "pending" }, { status: "accepted" }, { status: "pending" }] as never,
  })) as never,
  listCommunityPosts: vi.fn(async () => ({ ok: true as const, posts: [{ id: "c1" }] as never })),
  loadStoreOrderTabCounts: vi.fn(async () => ({
    ok: true as const,
    counts: { all: 9, active: 3, completed: 5, cancelled: 1 } as never,
  })),
  loadPointSummary: vi.fn(async () => ({ ok: true as const, summary: { balance: -120 } as never })),
  loadCouponCards: vi.fn(async () => ({
    ok: true as const,
    cards: [{ bucket: "available" }, { bucket: "expiring" }, { bucket: "redeemed" }, { bucket: "expired" }] as never,
  })),
  loadGiftSummary: vi.fn(async () => ({ ok: true as const, summary: { owned: 2, receivedPending: 1 } })),
  loadTrust: vi.fn(async () => ({ trust_score: 72, manner_score: 40 })),
  loadBanner: vi.fn(async () => null),
});

describe("mypage-summary.server — every field = destination screen function", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("computes each field with the same function/filter the destination screen uses", async () => {
    const deps = okDeps();
    const fields = await loadMypageSummaryFieldsServer(sb, " u1 ", { deps });

    // 판매중 = /mypage/products 판매중 필터
    expect(fields.salesActiveCount).toEqual({
      status: "ok",
      value: filterMyProductsByListingAxis(posts as unknown as Product[], "active").length,
    });
    expect(fields.favoritesCount).toEqual({ status: "ok", value: 2 });
    expect(fields.offersReceivedPending).toEqual({ status: "ok", value: 2 });
    expect(deps.listPriceOffers).toHaveBeenCalledWith(sb, { userId: "u1", role: "seller" });
    expect(fields.communityPostsCount).toEqual({ status: "ok", value: 1 });
    expect(fields.storeOrdersActiveCount).toEqual({ status: "ok", value: 3 });
    // 포인트 = 금액 → 음수 그대로
    expect(fields.pointsBalance).toEqual({ status: "ok", value: -120 });
    // 쿠폰 보유 = 쿠폰 화면 보유 탭(held)
    const cards = [{ bucket: "available" }, { bucket: "expiring" }, { bucket: "redeemed" }, { bucket: "expired" }];
    expect(fields.couponsAvailableCount).toEqual({
      status: "ok",
      value: cards.filter((c) => customerWalletPresentationTab(c.bucket) === "held").length,
    });
    expect(deps.loadCouponCards).toHaveBeenCalledWith(sb, { buyerUserId: "u1", tab: "all" });
    expect(fields.giftCertificatesOwned).toEqual({ status: "ok", value: 2 });
    expect(fields.trust).toEqual({ status: "ok", value: { trust_score: 72, manner_score: 40 } });
    expect(fields.banner).toEqual({ status: "ok", value: null });
    // S46 진행중 탭 구현 전
    expect(fields.adsActiveCount).toEqual({ status: "hidden" });
  });

  it("partial failure → only that field `unavailable`, never 0", async () => {
    const deps: MypageSummaryDeps = {
      ...okDeps(),
      loadMyPosts: vi.fn(async () => ({ ok: false as const, error: "db" })),
      loadFavoritePosts: vi.fn(async () => {
        throw new Error("network");
      }),
      listCommunityPosts: vi.fn(async () => ({ ok: false as const, error: "posts_query_failed" as const })),
      loadPointSummary: vi.fn(async () => ({ ok: false as const, error: "points_balance_unavailable" })),
      loadTrust: vi.fn(async () => {
        throw new Error("profile");
      }),
    };
    const fields = await loadMypageSummaryFieldsServer(sb, "u1", { deps });
    expect(fields.salesActiveCount).toEqual({ status: "unavailable" });
    expect(fields.favoritesCount).toEqual({ status: "unavailable" });
    expect(fields.communityPostsCount).toEqual({ status: "unavailable" });
    expect(fields.pointsBalance).toEqual({ status: "unavailable" });
    expect(fields.trust).toEqual({ status: "unavailable" });
    // 나머지는 정상
    expect(fields.offersReceivedPending).toEqual({ status: "ok", value: 2 });
    expect(fields.storeOrdersActiveCount).toEqual({ status: "ok", value: 3 });
    for (const f of Object.values(fields)) {
      if (f.status === "ok") continue;
      expect(f).not.toHaveProperty("value");
    }
  });

  it("field timeout → unavailable (other fields unaffected)", async () => {
    const deps: MypageSummaryDeps = {
      ...okDeps(),
      loadGiftSummary: vi.fn(() => new Promise(() => {})) as never,
    };
    const fields = await loadMypageSummaryFieldsServer(sb, "u1", { deps, timeoutMs: 20 });
    expect(fields.giftCertificatesOwned).toEqual({ status: "unavailable" });
    expect(fields.favoritesCount).toEqual({ status: "ok", value: 2 });
  });

  it("gift owned status set = gift screen 「보유」 tab (available ACTIVE + locked GIFT_LOCKED)", () => {
    expect(isGiftWalletOwnedStatus("ACTIVE")).toBe(true);
    expect(isGiftWalletOwnedStatus("GIFT_LOCKED")).toBe(true);
    expect(isGiftWalletOwnedStatus("FULLY_REDEEMED")).toBe(false);
    expect(isGiftWalletOwnedStatus("PARTIALLY_REDEEMED")).toBe(false);
  });
});

describe("GET /api/me/mypage-summary route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("401 when not authenticated", async () => {
    vi.doMock("@/lib/auth/api-session", () => ({
      requireAuthenticatedUserId: async () => ({
        ok: false,
        response: new Response(JSON.stringify({ ok: false }), { status: 401 }),
      }),
    }));
    const { GET } = await import("@/app/api/me/mypage-summary/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("503 when service client missing", async () => {
    vi.doMock("@/lib/auth/api-session", () => ({
      requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
    }));
    vi.doMock("@/lib/supabase/resolve-service-supabase-for-api", () => ({
      resolveServiceSupabaseForApi: () => null,
    }));
    const { GET } = await import("@/app/api/me/mypage-summary/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("200 with fields + no-store; 500 only when every field failed", async () => {
    vi.doMock("@/lib/auth/api-session", () => ({
      requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
    }));
    vi.doMock("@/lib/supabase/resolve-service-supabase-for-api", () => ({
      resolveServiceSupabaseForApi: () => ({}),
    }));
    const load = vi.fn();
    vi.doMock("@/lib/mypage/mypage-summary.server", () => ({ loadMypageSummaryFieldsServer: load }));
    const { GET } = await import("@/app/api/me/mypage-summary/route");

    load.mockResolvedValueOnce({
      salesActiveCount: { status: "ok", value: 0 },
      pointsBalance: { status: "unavailable" },
      adsActiveCount: { status: "hidden" },
    });
    const ok = await GET();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("private, no-store");
    const body = (await ok.json()) as { ok: boolean; viewerId: string; fields: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.viewerId).toBe("u1");
    expect(body.fields.salesActiveCount).toEqual({ status: "ok", value: 0 });
    expect(body.fields.pointsBalance).toEqual({ status: "unavailable" });

    load.mockResolvedValueOnce({
      salesActiveCount: { status: "unavailable" },
      pointsBalance: { status: "unavailable" },
      adsActiveCount: { status: "hidden" },
    });
    const allFail = await GET();
    expect(allFail.status).toBe(500);
  });
});

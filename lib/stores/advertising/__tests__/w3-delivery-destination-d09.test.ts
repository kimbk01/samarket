/**
 * D-09 (2026-11-07) — 배달 배너 관리자 「목적지 수정」도 DS-6 검사(매장 slug DB 대조 · 사장님 유료 3종만).
 * 예전에는 「/ 로 시작」만 봐서 다른 매장 주소·배달 밖 경로도 저장됐다.
 */
import { describe, expect, it } from "vitest";
import { adminUpdateBannerDestination } from "@/lib/stores/advertising/admin-delivery-ad-writer";

const UPDATED = "2026-11-01T00:00:00Z";

function makeDb(campaign: Record<string, unknown>, store: Record<string, unknown> | null) {
  const updates: Array<{ table: string; row: Record<string, unknown> }> = [];
  const sb = {
    updates,
    from(table: string) {
      let mode: "select" | "update" | "insert" = "select";
      let row: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: () => q,
        update: (r: Record<string, unknown>) => {
          mode = "update";
          row = r;
          return q;
        },
        insert: (r: Record<string, unknown>) => {
          mode = "insert";
          row = r;
          return q;
        },
        maybeSingle: async () => ({
          data: table === "stores" ? store : campaign,
          error: null,
        }),
        then(res: (v: unknown) => void) {
          if (mode === "update") updates.push({ table, row });
          return res({ data: null, error: null });
        },
      };
      return q;
    },
  };
  return sb;
}

const base = { adminUserId: "a1", campaignId: "c1", expectedUpdatedAt: UPDATED };

describe("D-09 adminUpdateBannerDestination", () => {
  it("사장님 유료 배너: 다른 매장 주소 → invalid_destination · 저장 없음", async () => {
    const sb = makeDb(
      { id: "c1", store_id: "s1", creative_id: null, cta_href: "/stores/aa11", updated_at: UPDATED, campaign_source: "OWNER_PAID" },
      { slug: "aa11" }
    );
    const res = await adminUpdateBannerDestination(sb as never, { ...base, ctaHref: "/stores/bb22" });
    expect(res).toMatchObject({ ok: false, error: "invalid_destination", detail: "store_destination_mismatch" });
    expect(sb.updates.filter((u) => u.table === "store_banner_ad_campaigns")).toHaveLength(0);
  });

  it("외부 주소 → invalid_destination", async () => {
    const sb = makeDb(
      { id: "c1", store_id: "s1", creative_id: null, cta_href: null, updated_at: UPDATED, campaign_source: "OWNER_PAID" },
      { slug: "aa11" }
    );
    const res = await adminUpdateBannerDestination(sb as never, { ...base, ctaHref: "https://evil.example/x" });
    expect(res).toMatchObject({ ok: false, error: "invalid_destination" });
  });

  it("매장 없는 자체 배너: 배달 밖 경로(/philife) → invalid_destination", async () => {
    const sb = makeDb(
      { id: "c1", store_id: null, creative_id: null, cta_href: null, updated_at: UPDATED, campaign_source: "DIBAY_FIRST_PARTY" },
      null
    );
    const res = await adminUpdateBannerDestination(sb as never, { ...base, ctaHref: "/philife" });
    expect(res).toMatchObject({ ok: false, error: "invalid_destination" });
  });

  it("사장님 유료 배너인데 매장 없음 → 저장 거부", async () => {
    const sb = makeDb(
      { id: "c1", store_id: null, creative_id: null, cta_href: null, updated_at: UPDATED, campaign_source: "OWNER_PAID" },
      null
    );
    const res = await adminUpdateBannerDestination(sb as never, { ...base, ctaHref: "/stores/browse" });
    expect(res).toMatchObject({ ok: false, error: "destination_not_ready", detail: "store_required" });
  });

  it.each(["/stores/aa11", "/stores/aa11#menu", "/stores/aa11?tab=promo"])("그 매장 3종 %s → 저장", async (href) => {
    const sb = makeDb(
      { id: "c1", store_id: "s1", creative_id: null, cta_href: null, updated_at: UPDATED, campaign_source: "OWNER_PAID" },
      { slug: "aa11" }
    );
    const res = await adminUpdateBannerDestination(sb as never, { ...base, ctaHref: href });
    expect(res).toEqual({ ok: true });
    const upd = sb.updates.find((u) => u.table === "store_banner_ad_campaigns");
    expect(upd?.row.cta_href).toBe(href);
  });

  it("ctaType(store_menu) → 그 매장 메뉴 주소로 저장", async () => {
    const sb = makeDb(
      { id: "c1", store_id: "s1", creative_id: null, cta_href: null, updated_at: UPDATED, campaign_source: "OWNER_PAID" },
      { slug: "aa11" }
    );
    const res = await adminUpdateBannerDestination(sb as never, { ...base, ctaType: "store_menu" });
    expect(res).toEqual({ ok: true });
    expect(sb.updates.find((u) => u.table === "store_banner_ad_campaigns")?.row.cta_href).toBe("/stores/aa11#menu");
  });

  it("매장 없는 자체 배너: 이벤트 주소 → 저장", async () => {
    const sb = makeDb(
      { id: "c1", store_id: null, creative_id: null, cta_href: null, updated_at: UPDATED, campaign_source: "DIBAY_FIRST_PARTY" },
      null
    );
    const res = await adminUpdateBannerDestination(sb as never, { ...base, ctaHref: "/events/e1" });
    expect(res).toEqual({ ok: true });
  });
});

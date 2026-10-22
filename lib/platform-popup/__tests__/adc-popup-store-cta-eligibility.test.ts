import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  popupStoreCtaLegacyStoreId,
  rewritePopupStoreCtaTargetToSlug,
} from "@/lib/platform-popup/popup-store-cta-target";
import { loadPlatformPopupCandidates } from "@/lib/platform-popup/load-popup-candidates";
import { resolvePopupAd, type PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import { resolveDibaySurface } from "@/lib/platform-popup/resolve-dibay-surface";

const STORE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STORE_HIDDEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STORE_GONE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = new Date("2026-10-22T03:00:00.000Z");

type Row = Record<string, unknown>;

/** Minimal chainable Supabase fake: select / eq / in / order / limit → filtered rows. */
function fakeClient(tables: Record<string, Row[]>) {
  const sb = {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const builder = {
        select: () => builder,
        eq(col: string, v: unknown) {
          filters.push((r) => r[col] === v);
          return builder;
        },
        in(col: string, vs: unknown[]) {
          filters.push((r) => vs.includes(r[col]));
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: () =>
          Promise.resolve({ data: (tables[table] ?? []).find((r) => filters.every((f) => f(r))) ?? null, error: null }),
        then(resolve: (v: { data: Row[]; error: null }) => unknown) {
          const data = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return sb;
}

function campaign(id: string, extra: Row): Row {
  return {
    id,
    status: "active",
    approval_status: "approved",
    priority: 1,
    start_at: "2026-10-01T00:00:00.000Z",
    end_at: "2026-11-01T00:00:00.000Z",
    timezone: "Asia/Manila",
    cta_type: "store",
    cta_target: "x",
    external_url: null,
    cta_label: null,
    title: null,
    body: null,
    suppression_mode: "TODAY",
    suppression_duration_seconds: null,
    presentation_type: null,
    frequency_mode: null,
    owner_store_id: null,
    ...extra,
  };
}

function tablesFor(campaigns: Row[]): Record<string, Row[]> {
  return {
    platform_popup_campaigns: campaigns,
    platform_popup_creatives: campaigns.map((c) => ({
      id: `cr-${c.id}`,
      campaign_id: c.id,
      status: "ready",
      aspect_w: 36,
      aspect_h: 25,
      asset_path: "p",
      asset_url: "https://x/p.webp",
      alt_text: null,
      creative_mode: null,
    })),
    platform_popup_campaign_surfaces: campaigns.map((c) => ({ campaign_id: c.id, surface: "GLOBAL" })),
    stores: [
      { id: STORE_A, slug: "kimbap-a", approval_status: "approved", is_visible: true },
      { id: STORE_HIDDEN, slug: "hidden-b", approval_status: "approved", is_visible: false },
    ],
  };
}

function winnerHref(candidates: PlatformPopupCandidate[]): string | null {
  const r = resolvePopupAd({ pathname: "/stores", now: NOW, candidates });
  return r.ok && r.winner ? r.winner.href : null;
}

describe("ADC-01 — popup store CTA is a slug path, legacy UUID resolved at serving", () => {
  it("detects UUID store targets (store + internal_page #menu / ?tab=promo)", () => {
    expect(popupStoreCtaLegacyStoreId({ ctaType: "store", ctaTarget: STORE_A })).toBe(STORE_A);
    expect(popupStoreCtaLegacyStoreId({ ctaType: "store", ctaTarget: "kimbap-a" })).toBeNull();
    expect(
      popupStoreCtaLegacyStoreId({ ctaType: "internal_page", ctaTarget: `/stores/${STORE_A}#menu` })
    ).toBe(STORE_A);
    expect(popupStoreCtaLegacyStoreId({ ctaType: "internal_page", ctaTarget: "/market" })).toBeNull();
    expect(popupStoreCtaLegacyStoreId({ ctaType: "external_url", ctaTarget: STORE_A })).toBeNull();
  });

  it("rewrites to slug and keeps #menu / ?tab=promo", () => {
    const r = (ctaType: string, ctaTarget: string) =>
      rewritePopupStoreCtaTargetToSlug({ ctaType, ctaTarget, storeId: STORE_A, slug: "kimbap a" });
    expect(r("store", STORE_A)).toBe("kimbap a");
    expect(r("internal_page", `/stores/${STORE_A}#menu`)).toBe("/stores/kimbap%20a#menu");
    expect(r("internal_page", `/stores/${STORE_A}?tab=promo`)).toBe("/stores/kimbap%20a?tab=promo");
    // other store's UUID is not rewritten with this store's slug
    expect(
      rewritePopupStoreCtaTargetToSlug({
        ctaType: "store",
        ctaTarget: STORE_HIDDEN,
        storeId: STORE_A,
        slug: "kimbap-a",
      })
    ).toBe(STORE_HIDDEN);
  });

  it("owner writer stores the slug (no `cta_target: storeId`)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/platform-popup/owner-request-writer.ts", "utf8");
    expect(src).not.toMatch(/cta_target:\s*storeId/);
    expect(src).toContain("cta_target: storeSlug");
    expect(src).toContain("ownerPopupCtaTargetWithStoreSlug");
  });

  it("serving: legacy `/stores/<uuid>` row lands on `/stores/<slug>`; missing store → not served", async () => {
    const sb = fakeClient(
      tablesFor([
        campaign("legacy", { cta_type: "store", cta_target: STORE_A, owner_store_id: STORE_A }),
      ])
    );
    const candidates = await loadPlatformPopupCandidates(sb, {});
    expect(candidates[0]!.ctaTarget).toBe("kimbap-a");
    expect(winnerHref(candidates)).toBe("/stores/kimbap-a");

    const menuSb = fakeClient(
      tablesFor([
        campaign("menu", {
          cta_type: "internal_page",
          cta_target: `/stores/${STORE_A}#menu`,
          owner_store_id: STORE_A,
        }),
      ])
    );
    expect(winnerHref(await loadPlatformPopupCandidates(menuSb, {}))).toBe("/stores/kimbap-a#menu");

    const goneSb = fakeClient(tablesFor([campaign("gone", { cta_type: "store", cta_target: STORE_GONE })]));
    expect(winnerHref(await loadPlatformPopupCandidates(goneSb, {}))).toBeNull();
  });
});

describe("ADC-02 — popup serving applies the banner store eligibility (ADS-06)", () => {
  it("hidden / missing linked store → popup not served; admin popup without store unaffected", async () => {
    const sb = fakeClient(
      tablesFor([
        campaign("hidden", { cta_type: "store", cta_target: "hidden-b", owner_store_id: STORE_HIDDEN }),
        campaign("menu-hidden", {
          cta_type: "internal_page",
          cta_target: "/stores/hidden-b#menu",
          owner_store_id: STORE_HIDDEN,
          priority: 5,
        }),
      ])
    );
    const candidates = await loadPlatformPopupCandidates(sb, {});
    expect(candidates.every((c) => c.ownerStoreEligible === false)).toBe(true);
    expect(winnerHref(candidates)).toBeNull();

    const adminSb = fakeClient(
      tablesFor([campaign("admin", { cta_type: "internal_page", cta_target: "/market" })])
    );
    const adminCandidates = await loadPlatformPopupCandidates(adminSb, {});
    expect(adminCandidates[0]!.ownerStoreEligible).toBeUndefined();
    expect(winnerHref(adminCandidates)).toBe("/market");
  });

  it("eligible linked store keeps serving", async () => {
    const sb = fakeClient(
      tablesFor([campaign("ok", { cta_type: "store", cta_target: "kimbap-a", owner_store_id: STORE_A })])
    );
    const candidates = await loadPlatformPopupCandidates(sb, {});
    expect(candidates[0]!.ownerStoreEligible).toBe(true);
    expect(winnerHref(candidates)).toBe("/stores/kimbap-a");
  });
});

describe("ADC-11 — per-store cart / checkout is popup-blocked like /stores/cart", () => {
  it("ORDER_CRITICAL", () => {
    expect(resolveDibaySurface("/stores/kimbap-a/cart")).toBe("ORDER_CRITICAL");
    expect(resolveDibaySurface("/stores/kimbap-a/cart/")).toBe("ORDER_CRITICAL");
    expect(resolveDibaySurface("/stores/kimbap-a/checkout")).toBe("ORDER_CRITICAL");
    expect(resolveDibaySurface("/stores/kimbap-a")).toBe("DELIVERY");
    expect(resolveDibaySurface("/stores/kimbap-a/p/123")).toBe("DELIVERY");
  });
});

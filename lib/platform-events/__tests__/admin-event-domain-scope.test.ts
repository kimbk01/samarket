import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/platform-popup/admin-campaign-loader", () => ({
  // 배달 범위 팝업 = p-del · p-global, 거래 범위 = p-global
  loadPlatformPopupDomainCampaignIds: async (_sb: unknown, scope: string) => ({
    ok: true,
    ids: scope === "delivery" ? ["p-del", "p-global"] : ["p-global"],
  }),
}));

import { loadPlatformEventIdsForDomainScope } from "@/lib/platform-events/admin-event-domain-scope";

const EVENTS = [
  { id: "e-store", source_store_id: "s1", cta_type: null },
  { id: "e-cta-store", source_store_id: null, cta_type: "store" },
  { id: "e-trade-banner", source_store_id: null, cta_type: null },
  { id: "e-del-popup", source_store_id: null, cta_type: null },
  { id: "e-global-popup", source_store_id: null, cta_type: null },
  { id: "e-none", source_store_id: null, cta_type: "internal_page" },
];
const DISTS = [
  { content_id: "e-trade-banner", channel_ref_type: "feed_ad_campaign", channel_ref_id: "f1", config: { domain: "trade" } },
  { content_id: "e-del-popup", channel_ref_type: "platform_popup_campaign", channel_ref_id: "p-del", config: {} },
  { content_id: "e-global-popup", channel_ref_type: "platform_popup_campaign", channel_ref_id: "p-global", config: {} },
  { content_id: "e-none", channel_ref_type: null, channel_ref_id: null, config: {} },
];

function fakeSb(): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => {
        if (table === "platform_events") return Promise.resolve({ data: EVENTS, error: null });
        return { eq: () => Promise.resolve({ data: DISTS, error: null }) };
      },
    }),
  } as unknown as SupabaseClient;
}

describe("이벤트 도메인 판정 (재감사 B · 원장 변경 없음)", () => {
  it("배달 = 매장 출처·매장 이동·배달/전체 노출 팝업 + 도메인 신호 없는 이벤트", async () => {
    const r = await loadPlatformEventIdsForDomainScope(fakeSb(), "delivery");
    expect(r.ok && [...r.ids].sort()).toEqual(["e-cta-store", "e-del-popup", "e-global-popup", "e-none", "e-store"]);
  });

  it("거래 = 거래 배너·전체 노출 팝업 + 신호 없는 이벤트 (배달 신호 이벤트 제외)", async () => {
    const r = await loadPlatformEventIdsForDomainScope(fakeSb(), "trade");
    expect(r.ok && [...r.ids].sort()).toEqual(["e-global-popup", "e-none", "e-trade-banner"]);
  });

  it("커뮤니티 = 전체 노출 팝업 + 신호 없는 이벤트", async () => {
    const r = await loadPlatformEventIdsForDomainScope(fakeSb(), "community");
    expect(r.ok && [...r.ids].sort()).toEqual(["e-global-popup", "e-none"]);
  });
});

/**
 * 감사 결함 8건 (Owner 「8건 수정 진행」 2026-11-10) — 한국 주소·통화·주소 SSOT.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildTradeFeedLocationOrFilter,
  resolveTradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { validateRestrictedMetaPatch } from "@/lib/trade/trade-lifecycle-policy";

const read = (p: string) => readFileSync(p, "utf8");

describe("감사 결함 8건", () => {
  it("1 거래 목록 — 한국 지역은 유효, PostgREST 값은 따옴표", () => {
    const c = resolveTradeFeedLocationConstraint("kr:11680");
    expect(c.kind).toBe("lgu");
    if (c.kind === "lgu") {
      expect(c.canonicalId).toBe("KR:11680");
      expect(buildTradeFeedLocationOrFilter(c)).toContain('trade_lgu_id.eq."KR:11680"');
    }
    expect(resolveTradeFeedLocationConstraint("KR:99999").kind).toBe("invalid");
  });
  it("2 관리자 거래 지역 — KR 코드 허용 + 따옴표", () => {
    const src = read("lib/admin/trade-admin/trade-posts-query.ts");
    expect(src).toContain("/^KR:\\d{5}$/.test(lguRaw)");
    expect(src).toContain('lguKr ? `"${f.lguId}"` : f.lguId');
  });
  it("3 ₩ 글 표시 — 메신저·홈·관리자", () => {
    const svc = read("lib/community-messenger/service.ts");
    expect(svc).toContain("meta_currency:meta->>currency");
    expect(svc).toContain("normalizeTradePriceCurrency(post?.meta_currency)");
    expect(read("components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx")).toContain('tradeContext.product.currency || "PHP"');
    expect(read("components/home-hub/HomeTradeRow.tsx")).toContain("resolveTradePostCurrency(meta");
    expect(read("components/admin/trade/kit/TradeAdminKit.tsx")).toContain('normalizeTradePriceCurrency(currency) === "KRW"');
    expect(read("lib/admin/trade-admin/trade-posts-query.ts")).toContain("meta_currency:meta->>currency");
  });
  it("4 예전 글 수정 — 통화 미선택이면 저장 안 함 · 제한 단계 통화 변경은 핵심 조건 안내", () => {
    const form = read("components/write/trade/TradeWriteForm.tsx");
    expect(form).toContain("const writePriceCurrency = !editPostId || normalizeTradePriceCurrency(currency) != null;");
    expect(form).toContain("...(writePriceCurrency ? { currency: priceCurrency } : {})");
    const jobs = read("components/write/trade/generic/JobsExtendedWriteFields.tsx");
    expect(jobs).toContain("if (writePriceCurrency) meta = { ...meta, currency };");
    const base = { title: "a", price: 100, content: "x", meta: {} as Record<string, unknown> };
    const r = validateRestrictedMetaPatch("used", base as never, { ...base, meta: { currency: "KRW" } } as never);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).not.toContain("currency");
  });
  it("5 지도 확인 — 해석 실패면 저장 막음 · 핀 해석 1곳", () => {
    const src = read("components/addresses/AddressMapConfirmClient.tsx");
    expect(src).toContain("disabled={!draft || resolving || pinUnresolved}");
    expect(src).toContain("await resolveCurrentPinCanonicalAddress(lat, lng)");
    expect(src).not.toContain("resolveKrPinDraft");
    expect(read("lib/addresses/resolve-current-pin-canonical-address.ts")).toContain("if (isKoreaLatLng(lat, lng))");
    expect(read("lib/addresses/canonical-address-resolver.ts")).not.toContain("isKoreaLatLng(");
  });
  it("6 배달 첫 화면 — 한국 대표면 not_service_area 예측", async () => {
    const { predictDeliveryViewerGateFromClientState } = await import("@/lib/stores/delivery-viewer-gate-first-paint");
    const gate = predictDeliveryViewerGateFromClientState({
      membershipStatus: "member",
      addressSnapshot: {
        ok: true,
        status: 200,
        defaults: { master: { id: "a", appRegionId: null, fullAddress: "", countryCode: "KR", canonicalLguId: "KR:11680" } },
        neighborhoodFromLife: null,
      } as never,
    });
    expect(gate).toBe("not_service_area");
  });
  it("7 지역 캠페인 — 저장값 없는 대표 주소도 계산값으로 포함", () => {
    const src = read("lib/admin/notification-campaigns/campaign-target-scan.ts");
    expect(src).toContain("canonical_lgu_id.is.null");
    expect(src).toContain("function campaignRowMatchesLgu");
    expect(src.match(/campaignRowMatchesLgu\(r, lgu\)/g)?.length).toBe(2);
  });
  it("8 매장 시/군 — 저장값 → 저장 계산 → 예전 보조 순서 한 곳", () => {
    const src = read("lib/stores/store-location-columns.server.ts");
    expect(src).toContain("export function resolveStoreHomeLguIdForStore");
    for (const p of [
      "lib/delivery/service-area/build-service-area-editor-payload.ts",
      "app/api/admin/stores/[id]/delivery-service-areas/route.ts",
      "app/api/me/stores/[storeId]/delivery-service-areas/route.ts",
    ]) {
      expect(read(p)).toContain("resolveStoreHomeLguIdForStore(");
    }
  });
});

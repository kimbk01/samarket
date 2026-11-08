import { readFileSync } from "node:fs";
import { withCatalogCopy } from "@/lib/i18n/__tests__/support/source-with-catalog-copy";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OWNER_GIFT_REDEMPTIONS_MAX_LIMIT,
  OWNER_GIFT_REDEMPTIONS_PAGE_SIZE,
  ownerGiftRedemptionSummaryFromGroups,
  parseOwnerGiftRedemptionPageParams,
} from "@/lib/gift-certificate/owner-gift-money-ops";

const sp = (q: string) => new URLSearchParams(q);

describe("C-6 사장님 상품권 사용 내역 — 쪽 나눔 파라미터", () => {
  it("기본값: 전체 · 0 · 20줄", () => {
    expect(parseOwnerGiftRedemptionPageParams(sp(""))).toEqual({
      filter: "all",
      offset: 0,
      limit: OWNER_GIFT_REDEMPTIONS_PAGE_SIZE,
    });
  });
  it("모르는 상태·음수·과대 값은 안전한 값으로", () => {
    const p = parseOwnerGiftRedemptionPageParams(sp("status=hack&offset=-5&limit=9999"));
    expect(p).toEqual({ filter: "all", offset: 0, limit: OWNER_GIFT_REDEMPTIONS_MAX_LIMIT });
    expect(parseOwnerGiftRedemptionPageParams(sp("limit=abc")).limit).toBe(OWNER_GIFT_REDEMPTIONS_PAGE_SIZE);
  });
  it("limit=0 은 합계만 (목록 없음)", () => {
    expect(parseOwnerGiftRedemptionPageParams(sp("status=refund&offset=40&limit=0"))).toEqual({
      filter: "refund",
      offset: 40,
      limit: 0,
    });
  });
});

describe("C-6 합계 = 기간 전체 (DB 상태 칸 묶음 · P-9)", () => {
  it("건수는 칸별 · 금액은 환불을 뺀 합 · 확정/대기 수익 분리", () => {
    const s = ownerGiftRedemptionSummaryFromGroups([
      { reversed: false, recognized: true, count: 25, redeemed: 2500, fee: 250, net: 2250 },
      { reversed: false, recognized: false, count: 7, redeemed: 700, fee: 70, net: 350 },
      { reversed: true, recognized: true, count: 3, redeemed: 300, fee: 30, net: 270 },
    ]);
    expect(s.counts).toEqual({ all: 35, pending: 7, recognized: 25, refund: 3 });
    expect(s.recognizedMerchantNet).toBe(2250);
    expect(s.pendingMerchantNet).toBe(350);
    // 환불 칸은 합계에서 빠진다
    expect(s.redeemedGross).toBe(3200);
    expect(ownerGiftRedemptionSummaryFromGroups(null).counts.all).toBe(0);
  });
});

describe("C-6 화면·API 계약 (소스)", () => {
  const read = (rel: string) => withCatalogCopy(readFileSync(resolve(process.cwd(), rel), "utf8"));
  const route = read("app/api/me/stores/[storeId]/gift-certificates/redemptions/route.ts");
  const panel = read("components/business/owner/OwnerGiftMoneyOpsPanel.tsx");

  it("API: 사장 권한 · 매장 범위 · 전체 합계 · total", () => {
    expect(route).toContain("getCachedStoreIfOwner(sb, userId, sid)");
    // P-9 — 합계·거르기·쪽 = DB 1회, 매장 범위는 권한 확인된 sid
    expect(route).toContain('sb.rpc("owner_gift_redemption_page"');
    expect(route).toContain("p_store_id: sid");
    expect(route).toContain("ownerGiftRedemptionSummaryFromGroups(pageObj.groups)");
    expect(route).toContain("total: paged.total");
    expect(route).not.toContain("GIFT_REDEMPTIONS_PERIOD_CAP = 500");
  });

  it("화면: 요청 순서 보호 · 오류 문구와 다시 시도 · 쪽 이동 · 서버 코드 미노출", () => {
    expect(panel).toContain("seq !== requestSeq.current");
    expect(panel).toContain("상품권 사용 내역을 불러오지 못했습니다.");
    expect(panel).toContain("다시 시도");
    expect(panel).toContain("<LedgerPager");
    expect(panel).not.toMatch(/\{redemptionJson\??\.error\}/);
    expect(panel).not.toContain("aggregateOwnerRedemptionKpis(");
    expect(panel).toContain("formatManilaDateTime(row.createdAt)");
  });
});

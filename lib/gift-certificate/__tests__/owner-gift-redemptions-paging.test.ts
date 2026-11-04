import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OWNER_GIFT_REDEMPTIONS_MAX_LIMIT,
  OWNER_GIFT_REDEMPTIONS_PAGE_SIZE,
  ownerGiftRedemptionMatchesFilter,
  pageOwnerGiftRedemptions,
  parseOwnerGiftRedemptionPageParams,
  summarizeOwnerGiftRedemptionPeriod,
} from "@/lib/gift-certificate/owner-gift-money-ops";

const sp = (q: string) => new URLSearchParams(q);
const row = (id: string, reversed: boolean, recognized: boolean, net = 90) => ({
  id,
  reversed,
  recognized,
  redeemedAmount: 100,
  platformFeeAmount: 10,
  merchantNetAmount: net,
});

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

describe("C-6 합계 = 기간 전체 (현재 쪽 아님)", () => {
  const rows = [
    ...Array.from({ length: 25 }, (_, i) => row(`rc${i}`, false, true)),
    ...Array.from({ length: 7 }, (_, i) => row(`pd${i}`, false, false, 50)),
    ...Array.from({ length: 3 }, (_, i) => row(`rf${i}`, true, true)),
  ];

  it("상태 거르기 규칙", () => {
    expect(ownerGiftRedemptionMatchesFilter(row("a", true, true), "refund")).toBe(true);
    expect(ownerGiftRedemptionMatchesFilter(row("a", true, true), "recognized")).toBe(false);
    expect(ownerGiftRedemptionMatchesFilter(row("a", false, false), "pending")).toBe(true);
    expect(ownerGiftRedemptionMatchesFilter(row("a", false, true), "all")).toBe(true);
  });

  it("합계·건수는 쪽과 무관하게 전체 행", () => {
    const s = summarizeOwnerGiftRedemptionPeriod(rows);
    expect(s.counts).toEqual({ all: 35, pending: 7, recognized: 25, refund: 3 });
    expect(s.recognizedMerchantNet).toBe(25 * 90);
    expect(s.pendingMerchantNet).toBe(7 * 50);
    // 환불 행은 합계에서 빠진다
    expect(s.redeemedGross).toBe(32 * 100);
  });

  it("쪽 자르기 — total 은 거른 뒤 전체 건수", () => {
    const first = pageOwnerGiftRedemptions(rows, { filter: "recognized", offset: 0, limit: 20 });
    expect(first.total).toBe(25);
    expect(first.rows).toHaveLength(20);
    const second = pageOwnerGiftRedemptions(rows, { filter: "recognized", offset: 20, limit: 20 });
    expect(second.rows.map((r) => r.id)).toEqual(["rc20", "rc21", "rc22", "rc23", "rc24"]);
    expect(pageOwnerGiftRedemptions(rows, { filter: "all", offset: 0, limit: 0 })).toEqual({ rows: [], total: 35 });
  });
});

describe("C-6 화면·API 계약 (소스)", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
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

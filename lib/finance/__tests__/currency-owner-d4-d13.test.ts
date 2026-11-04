/**
 * 2단계 사장님 화면 D-4~D-9 · D-13 (docs/audit/currency-remaining-defects-design-2026-11-04.md §2).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { cashTiles } from "@/components/business/owner/OwnerWalletHistory";
import {
  CASH_CATEGORY_KINDS,
  categoryKinds,
  ledgerMetaOrderId,
  loadWalletHistoryPage,
  type CashPeriodSummary,
} from "@/lib/finance/wallet-period-history";
import { cashHistoryDetailHref } from "@/lib/finance/owner-cash-history-detail-href";
import {
  ownerWalletHistoryUrlPrefix,
  parseOwnerWalletHistoryUrlState,
  writeOwnerWalletHistoryUrlState,
} from "@/lib/finance/owner-wallet-history-url-state";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** 체인 쿼리 가짜 — 표마다 고정 응답, 호출 기록 */
function fakeSb(tables: Record<string, { data: unknown[]; count?: number; error?: unknown }>) {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  const sb = {
    from(table: string) {
      const call = { table, ops: [] as Array<[string, unknown[]]> };
      calls.push(call);
      const res = tables[table] ?? { data: [] };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lt", "in", "order", "range", "limit"]) {
        b[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return b;
        };
      }
      b.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: res.data, count: res.count ?? res.data.length, error: res.error ?? null }).then(ok);
      return b;
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

describe("D-6 Cash 내역 「자세히」 — 그 건으로", () => {
  const hrefs = {
    convertHref: "/stores/owner/finance?storeId=s1&section=convert",
    settlementsHref: "/stores/owner/settlements?storeId=s1",
  };

  it("충전 줄 → 충전 신청 focus · 수수료 줄 → 정산 order_no · 전환 줄 → 전환 화면", () => {
    expect(
      cashHistoryDetailHref(
        { entryKind: "TOP_UP", relatedType: "business_cash_charge_request", relatedId: "c-1", orderNo: null },
        hrefs
      )
    ).toBe(`${hrefs.convertHref}&focus=c-1`);
    for (const k of ["SALE_FEE", "SALE_FEE_SETTLEMENT", "SALE_FEE_REVERSAL"]) {
      expect(cashHistoryDetailHref({ entryKind: k, relatedType: "store_order", relatedId: "o", orderNo: "SO-1 2" }, hrefs)).toBe(
        `${hrefs.settlementsHref}&order_no=SO-1+2`
      );
    }
    expect(
      cashHistoryDetailHref({ entryKind: "CONVERT_FROM_STORE_POINTS", relatedType: null, relatedId: null, orderNo: null }, hrefs)
    ).toBe(hrefs.convertHref);
    // 연결 정보가 없으면 첫 화면 (지어내지 않음)
    expect(cashHistoryDetailHref({ entryKind: "TOP_UP", relatedType: null, relatedId: null, orderNo: null }, hrefs)).toBe(
      hrefs.convertHref
    );
    expect(cashHistoryDetailHref({ entryKind: "SALE_FEE", relatedType: null, relatedId: null, orderNo: null }, hrefs)).toBe(
      hrefs.settlementsHref
    );
    expect(cashHistoryDetailHref({ entryKind: "AD_SPEND", relatedType: null, relatedId: null, orderNo: null }, hrefs)).toBeUndefined();
  });

  it("내역 API — 수수료 줄에만 주문번호, 이 쪽 줄 주문 id 만 한 번에 조회", async () => {
    const ledger = [
      { id: "l3", entry_kind: "SALE_FEE", direction: "debit", amount_minor: 100, balance_after_minor: 800, related_type: "store_order", related_id: "o1", created_at: "2026-11-03T03:00:00Z", meta: { order_id: "o1" } },
      { id: "l2", entry_kind: "SALE_FEE_REVERSAL", direction: "credit", amount_minor: 100, balance_after_minor: 900, related_type: "store_order", related_id: "o2", created_at: "2026-11-03T02:00:00Z", meta: { order_id: "o2" } },
      { id: "l1", entry_kind: "TOP_UP", direction: "credit", amount_minor: 800, balance_after_minor: 800, related_type: "business_cash_charge_request", related_id: "c1", created_at: "2026-11-03T01:00:00Z", meta: { order_id: "zz" } },
    ];
    const { sb, calls } = fakeSb({
      business_cash_ledger: { data: ledger },
      store_orders: { data: [{ id: "o1", order_no: "A-1" }, { id: "o2", order_no: "A-2" }] },
    });
    const page = await loadWalletHistoryPage(sb, {
      storeId: "s1",
      wallet: "cash",
      range: { fromIso: null, toIso: null },
      kinds: null,
      offset: 0,
      limit: 20,
    });
    expect(page).not.toBeNull();
    const byId = new Map(page!.rows.map((r) => [r.id, r]));
    expect(byId.get("l3")?.orderNo).toBe("A-1");
    expect(byId.get("l2")?.orderNo).toBe("A-2");
    expect(byId.get("l1")?.orderNo).toBeUndefined();
    const orderCalls = calls.filter((c) => c.table === "store_orders");
    expect(orderCalls).toHaveLength(1);
    const inOp = orderCalls[0]!.ops.find(([m]) => m === "in");
    expect(inOp?.[1]).toEqual(["id", ["o1", "o2"]]);
    expect(orderCalls[0]!.ops).toContainEqual(["eq", ["store_id", "s1"]]);
  });

  it("주문 조회 실패면 주문번호 없이 줄은 그대로", async () => {
    const { sb } = fakeSb({
      business_cash_ledger: {
        data: [{ id: "l1", entry_kind: "SALE_FEE", direction: "debit", amount_minor: 1, balance_after_minor: 0, created_at: "2026-11-03T01:00:00Z", meta: { order_id: "o1" } }],
      },
      store_orders: { data: [], error: { message: "x" } },
    });
    const page = await loadWalletHistoryPage(sb, { storeId: "s1", wallet: "cash", range: { fromIso: null, toIso: null }, kinds: null, offset: 0, limit: 20 });
    expect(page!.rows).toHaveLength(1);
    expect(page!.rows[0]!.orderNo).toBeUndefined();
  });

  it("meta.order_id 읽기", () => {
    expect(ledgerMetaOrderId({ order_id: " o1 " })).toBe("o1");
    expect(ledgerMetaOrderId({})).toBeNull();
    expect(ledgerMetaOrderId(null)).toBeNull();
  });

  it("Cash 충전 신청 focus — API 가 이 매장 신청 1건, 화면이 강조 표시 (Coin 출금 focus 와 같은 방식)", () => {
    const api = src("app/api/me/stores/[storeId]/business-cash/route.ts");
    expect(api).toContain('searchParams.get("focus")');
    expect(api).toMatch(/\.eq\("store_id", sid\)\.eq\("id", focusId\)\.maybeSingle\(\)/);
    expect(api).toContain("topUpFocus:");
    const view = src("components/business/owner/OwnerBusinessCashView.tsx");
    expect(view).toContain('qs.set("focus", focusId)');
    expect(view).toContain("data-owner-cash-topup-focus");
    expect(view).toContain('scrollIntoView({ block: "center" })');
  });
});

describe("D-7 Cash 칸 거르기 셋으로", () => {
  it("adSpend · partnerSpend · adRefund 따로, 「광고 지출」 탭 ads 는 유지", () => {
    expect(categoryKinds("cash", "adSpend")).toEqual(["AD_SPEND"]);
    expect(categoryKinds("cash", "partnerSpend")).toEqual(["PARTNER_SPEND"]);
    expect(categoryKinds("cash", "adRefund")).toEqual(["AD_REFUND", "PARTNER_REFUND"]);
    expect(CASH_CATEGORY_KINDS.ads).toEqual(["AD_SPEND", "AD_REFUND", "PARTNER_SPEND", "PARTNER_REFUND"]);
  });

  it("Cash 탭 세 칸의 거르기가 서로 다름 (하나를 누르면 하나만 눌림)", () => {
    const s = { adSpendMinor: 1, partnerSpendMinor: 2, refundMinor: 3 } as unknown as CashPeriodSummary;
    const tiles = cashTiles({ ...s, topupMinor: 0, fromConversionMinor: 0, saleFeeMinor: 0, outstandingCollectionMinor: 0, saleFeeReversalMinor: 0, adjustmentCreditMinor: 0, adjustmentDebitMinor: 0, otherCreditMinor: 0, otherDebitMinor: 0 } as CashPeriodSummary, true, false);
    const cat = (k: string) => tiles.find((t) => t.key === k)?.category;
    expect([cat("ad"), cat("partner"), cat("refund")]).toEqual(["adSpend", "partnerSpend", "adRefund"]);
    const cats = tiles.map((t) => t.category).filter(Boolean);
    expect(new Set(cats).size).toBe(cats.length);
  });
});

describe("D-13 내역 기간·칸·쪽 주소 상태", () => {
  it("접두가 coin·cash·광고 탭마다 다름", () => {
    const ps = [ownerWalletHistoryUrlPrefix("coin", false), ownerWalletHistoryUrlPrefix("cash", false), ownerWalletHistoryUrlPrefix("cash", true)];
    expect(new Set(ps).size).toBe(3);
  });

  it("쓰기 → 읽기 그대로 · 다른 키 보존 · 기본값은 생략", () => {
    const opts = { wallet: "cash" as const, adsOnly: false };
    const qs = writeOwnerWalletHistoryUrlState(
      "?storeId=s1&section=cash&coin_page=3",
      { period: { period: "custom", fromDay: "2026-10-01", toDay: "2026-10-31" }, category: "adSpend", page: 2 },
      opts
    );
    const sp = new URLSearchParams(qs);
    expect(sp.get("storeId")).toBe("s1");
    expect(sp.get("coin_page")).toBe("3");
    expect(parseOwnerWalletHistoryUrlState(sp, opts)).toEqual({
      period: { period: "custom", fromDay: "2026-10-01", toDay: "2026-10-31" },
      category: "adSpend",
      page: 2,
    });
    expect(
      writeOwnerWalletHistoryUrlState("?storeId=s1&cash_page=4", { period: { period: "this_month", fromDay: "", toDay: "" }, category: null, page: 0 }, opts)
    ).toBe("storeId=s1");
  });

  it("잘못된 값은 기본값 · 「광고 지출」 탭은 ads 고정·칸 주소 안 씀 · 누적(all) 없음", () => {
    const sp = new URLSearchParams("cash_period=all&cash_cat=nope&cash_page=-1&cash_from=2026-02-31");
    expect(parseOwnerWalletHistoryUrlState(sp, { wallet: "cash", adsOnly: false })).toEqual({
      period: { period: "this_month", fromDay: "", toDay: "" },
      category: null,
      page: 0,
    });
    const ads = { wallet: "cash" as const, adsOnly: true };
    expect(parseOwnerWalletHistoryUrlState(new URLSearchParams("ads_cat=adSpend"), ads).category).toBe("ads");
    expect(writeOwnerWalletHistoryUrlState("", { period: { period: "today", fromDay: "", toDay: "" }, category: "ads", page: 1 }, ads)).toBe(
      "ads_period=today&ads_page=2"
    );
  });

  it("화면 — replaceState 로 기록, 「자세히」는 next/link", () => {
    const view = src("components/business/owner/OwnerWalletHistory.tsx");
    expect(view).toContain("parseOwnerWalletHistoryUrlState(searchParams");
    expect(view).toContain("window.history.replaceState(null");
    const row = src("components/currency/CurrencyHistoryRow.tsx");
    expect(row).toContain('import Link from "next/link"');
    expect(row).not.toMatch(/<a href=\{detailHref\}/);
  });
});

describe("D-4 · D-5 · D-8 · D-9 화면 계약", () => {
  it("D-4 정산 — 서버 오류 코드 미표시 · Cash·지급 실패면 그 탭 비움", () => {
    const v = src("components/business/owner/OwnerStoreSettlementsView.tsx");
    expect(v).not.toMatch(/json\.error \?\?|cj\.error \?\?|pj\.error \?\?/);
    expect(v).toMatch(/!cashRes\.ok \|\| !cj\.ok\) \{\s*setError\(t\("store_owner_err_load_list"\)\);\s*setCash\(null\);/);
    expect(v).toMatch(/!payableRes\.ok \|\| !pj\.ok\) \{\s*setError\(t\("store_owner_err_load_list"\)\);\s*setPayable\(null\);/);
    expect(v).toContain('setError(t("mypage_comp_login_required"))');
    expect(v).toContain('setError(t("store_owner_no_permission"))');
  });

  it("D-5 내역 — 조용한 재조회가 아니면 시작 때 data=null", () => {
    const v = src("components/business/owner/OwnerWalletHistory.tsx");
    expect(v).toMatch(/if \(!silent\) \{\s*setData\(null\);/);
    expect(v).toContain("void load(true)");
  });

  it("D-8 미납 합계 — totalsComplete=false 면 숫자 대신 문구", () => {
    const v = src("components/business/owner/OwnerStoreFinanceView.tsx");
    expect(v).toContain("setSaleFeeTotalsComplete(json.saleFeeObligations?.totalsComplete !== false)");
    expect(v).toContain("합계를 불러오지 못했습니다");
    expect(v).toContain("Couldn't load the total");
  });

  it("D-9 출금 — approved_at 읽고 「승인됨 (지급 대기)」 뒤 시각", () => {
    const api = src("app/api/me/stores/[storeId]/finance/withdrawals/route.ts");
    expect(api).toMatch(/created_at, approved_at, paid_at/);
    const panel = src("components/business/owner/OwnerCoinWithdrawalPanel.tsx");
    expect(panel).toContain('row.status.toUpperCase() === "APPROVED" && phtShort(row.approved_at)');
  });
});

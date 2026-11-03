/**
 * 재감사 C-1 — 관리자 재무 화면 기간 계산 합계 (Owner 「코인 전환 얼마? 코인 출금 얼마??」 2026-11-03).
 * 값 = 운영 DB 형태(2026-11-04 SELECT): Cash amount_minor 부호 없음 + direction · Coin amount 부호 있음 ·
 * 출금 지급 줄(WITHDRAWAL_COMPLETE) 금액 0 · 전환 Cash 입금 줄 meta.sp_debited.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adFundingSumCells,
  adminFinanceRangeText,
  conversionSumCells,
  outstandingSumCells,
  parseAdFundingSums,
  parseOutstandingSums,
  parseUnifiedTxSums,
  unifiedTxSumCells,
} from "@/lib/finance/admin-finance-period-sums";

const RPC_SUMS = [
  { wallet: "CASH", entry_kind: "CONVERT_FROM_STORE_POINTS", direction: "credit", count: 6, amount: 21300, coin_out: 213 },
  { wallet: "CASH", entry_kind: "AD_SPEND", direction: "debit", count: 20, amount: 2211400, coin_out: 0 },
  { wallet: "COIN", entry_kind: "WITHDRAWAL_COMPLETE", direction: "credit", count: 4, amount: 0, coin_out: 0 },
  { wallet: "COIN", entry_kind: "WITHDRAWAL_REQUEST", direction: "debit", count: 10, amount: -18, coin_out: 0 },
  { wallet: "COIN", entry_kind: "ADMIN_ADJUST", direction: "credit", count: 3, amount: 3, coin_out: 0 },
  { wallet: "COIN", entry_kind: "ADMIN_ADJUST", direction: "debit", count: 3, amount: -1, coin_out: 0 },
];

describe("통합 거래 · Coin 전환 합계", () => {
  it("구 DB 함수(키 없음) → null — 합계 줄 숨김", () => {
    expect(parseUnifiedTxSums(undefined)).toBeNull();
  });

  it("종류별 칸: Cash 는 방향으로 부호, Coin 은 부호 그대로, 같은 종류 입·출은 한 칸(순값)", () => {
    const cells = unifiedTxSumCells(parseUnifiedTxSums(RPC_SUMS)!, true);
    const byKey = Object.fromEntries(cells.map((c) => [c.key, c]));
    expect(byKey["CASH:AD_SPEND"].amount).toBe("−₱22,114.00");
    expect(byKey["CASH:AD_SPEND"].count).toBe(20);
    expect(byKey["CASH:CONVERT_FROM_STORE_POINTS"].amount).toBe("+₱213.00");
    expect(byKey["COIN:WITHDRAWAL_REQUEST"].amount?.startsWith("−")).toBe(true);
    expect(byKey["COIN:ADMIN_ADJUST"].count).toBe(6);
    expect(byKey["COIN:ADMIN_ADJUST"].amount?.startsWith("+")).toBe(true);
    // 지갑 순서 Cash → Coin
    expect(cells[0].key.startsWith("CASH:")).toBe(true);
  });

  it("출금 지급 줄은 금액 대신 건수 + 「신청 때 차감」 설명 (원장 금액 0)", () => {
    const c = unifiedTxSumCells(parseUnifiedTxSums(RPC_SUMS)!, true).find((x) => x.key === "COIN:WITHDRAWAL_COMPLETE")!;
    expect(c.amount).toBeNull();
    expect(c.count).toBe(4);
    expect(c.note).toContain("신청 때 차감");
  });

  it("Coin 전환 화면: 전환한 Coin · 받은 Cash (전환 Cash 입금 줄만)", () => {
    const cells = conversionSumCells(parseUnifiedTxSums(RPC_SUMS)!, true);
    expect(cells.map((c) => [c.key, c.count])).toEqual([
      ["coin_out", 6],
      ["cash_in", 6],
    ]);
    expect(cells[1].amount).toBe("₱213.00");
    expect(cells[0].amount).toContain("213");
  });
});

describe("광고 지출 · 미납 합계", () => {
  it("출처·상태별 칸 — Cash(₱, centavo) · Point · 팝업은 건수만", () => {
    const cells = adFundingSumCells(
      parseAdFundingSums([
        { source: "platform_popup_campaigns", status: "ended", count: 23, amount: 0 },
        { source: "delivery_ad_canonical_bc_fundings", status: "SECURED", count: 16, amount: 1679000 },
        { source: "feed_ad_requests", status: "ended", count: 41, amount: 367000 },
      ])!,
      true
    );
    expect(cells.map((c) => c.key)).toEqual([
      "delivery_ad_canonical_bc_fundings:SECURED",
      "feed_ad_requests:ended",
      "platform_popup_campaigns:ended",
    ]);
    expect(cells[0].amount).toBe("₱16,790.00");
    expect(cells[0].label).toContain("결제 확보");
    expect(cells[1].amount).toContain("367");
    expect(cells[2].amount).toBeNull();
  });

  it("미납 합계 칸 이름 = 표 열 이름(관리자 회계 용어 유지)", () => {
    const s = parseOutstandingSums({ count: 3, due_minor: 5000, paid_minor: 1500, outstanding_minor: 3500 })!;
    expect(outstandingSumCells(s, true).map((c) => [c.label, c.amount])).toEqual([
      ["Fee Due", "₱50.00"],
      ["Cash Paid", "₱15.00"],
      ["Remaining", "₱35.00"],
    ]);
    expect(parseOutstandingSums(null)).toBeNull();
  });

  it("기간 글자", () => {
    expect(adminFinanceRangeText({}, true)).toBe("전체 기간");
    expect(adminFinanceRangeText({ date: "today" }, true)).toBe("오늘");
    expect(adminFinanceRangeText({ from: "2026-11-01", to: "2026-11-04" }, true)).toBe("2026-11-01 ~ 2026-11-04");
    expect(adminFinanceRangeText({ from: "2026-11-01" }, true)).toBe("2026-11-01");
  });
});

describe("SQL·화면 연결", () => {
  const mig = readFileSync("supabase/migrations/20271104150000_admin_finance_period_sums.sql", "utf8");
  it("목록 함수는 기존 키(total·rows) 유지 + 합계 키 추가 · service_role 만", () => {
    expect(mig).toContain("'sums_by_kind'");
    expect(mig).toContain("'sums_by_source'");
    expect(mig).toContain("'total', (SELECT count(*) FROM f)");
    expect(mig).toMatch(/admin_finance_ad_funding_page\(uuid, uuid, text, timestamptz, timestamptz, integer, integer\) TO service_role/);
    expect(mig).toMatch(/admin_finance_outstanding_sums\(uuid\) TO service_role/);
    expect(mig).toMatch(/admin_point_ledger_sums\(uuid, text, timestamptz, timestamptz\) TO service_role/);
    expect(mig).not.toMatch(/TO (anon|authenticated)/);
  });
  it("다섯 화면이 합계 줄을 그린다 (조회 중·실패 땐 숨김)", () => {
    for (const f of [
      "components/finance/AdminFinanceTransactionsView.tsx",
      "components/finance/AdminFinanceConversionsView.tsx",
      "components/finance/AdminFinanceAdsView.tsx",
      "components/finance/AdminFinanceOutstandingView.tsx",
      "components/admin/points/AdminPointLedgerPage.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("<AdminFinancePeriodSums");
      expect(src, f).toMatch(/!(list\.)?loading && !(list\.)?error/);
    }
  });
});

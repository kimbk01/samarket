import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { orderLedgerChainDesc, pickLedgerChainLatest, type LedgerChainView } from "@/lib/finance/ledger-chain-order";
import {
  moneyOutcomeFromNotificationRow,
  moneyOutcomeMatchesScope,
} from "@/lib/notifications/money-outcome-signal";
import {
  customPeriodInputState,
  parseOwnerMoneyPeriodParams,
  parseOwnerStoreCommissionLedgerQuery,
  parseStoreCommissionPeriodParams,
} from "@/lib/stores/commission/store-commission-ledger-query";
import { cashTiles, coinTiles } from "@/components/business/owner/OwnerWalletHistory";
import type { CashPeriodSummary, CoinPeriodSummary } from "@/lib/finance/wallet-period-history";

type Row = { id: string; createdAt: string; signed: number; balanceAfter: number };
const view = (r: Row): LedgerChainView => r;
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("재감사 R2 — 같은 시각 원장 줄 순서 (잔액 사슬)", () => {
  it("운영 형태: Cash 충전 + 미납 자동 납부 같은 시각 — id 순서와 상관없이 마지막 = 납부 후 잔액", () => {
    // 2026-09-02 00:33:48Z 매장 19085860: 0 → 전환 +10000(10000) → 미납 납부 −2500(7500)
    const at = "2026-09-02T00:33:48.329Z";
    const settle = { id: "a", createdAt: at, signed: -2500, balanceAfter: 7500 };
    const convert = { id: "b", createdAt: at, signed: 10000, balanceAfter: 10000 };
    expect(pickLedgerChainLatest([settle, convert], view)?.id).toBe("a");
    expect(pickLedgerChainLatest([convert, settle], view)?.id).toBe("a");
    expect(orderLedgerChainDesc([settle, convert], view).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("3줄 묶음 (운영 2026-09-07): 충전 +10000 → 납부 −7300 → 납부 −6300", () => {
    const at = "2026-09-07T15:13:28.922Z";
    const rows = [
      { id: "x", createdAt: at, signed: -6300, balanceAfter: 15700 },
      { id: "y", createdAt: at, signed: -7300, balanceAfter: 8400 },
      { id: "z", createdAt: at, signed: 10000, balanceAfter: 22000 },
    ];
    // 앞선 잔액 12000: +10000 → 22000, −6300 → 15700, −7300 → 8400
    expect(orderLedgerChainDesc(rows, view, 12000).map((r) => r.id)).toEqual(["y", "x", "z"]);
  });

  it("사슬이 순환해 정해지지 않으면 앞선 잔액으로 시작을 고른다 (운영 포인트 −1/+1 쌍)", () => {
    const at = "2026-09-17T15:30:44.901Z";
    const minus = { id: "m", createdAt: at, signed: -1, balanceAfter: 6 };
    const plus = { id: "p", createdAt: at, signed: 1, balanceAfter: 7 };
    expect(pickLedgerChainLatest([minus, plus], view, 7)?.id).toBe("p");
    expect(pickLedgerChainLatest([minus, plus], view, 6)?.id).toBe("m");
    // 앞선 잔액을 모르면 들어온 순서 그대로 (지어내지 않음)
    expect(pickLedgerChainLatest([minus, plus], view)?.id).toBe("m");
  });

  it("시작·종료 잔액·페이지 모두 사슬 정렬을 쓴다", () => {
    const src = read("lib/finance/wallet-period-history.ts");
    expect(src).toContain("pickLedgerChainLatest");
    // 쪽 = 경계 묶음까지 채운 사슬 정렬 (P-7 · `sliceLedgerChainPage` 안에서 orderLedgerChainDesc)
    expect(src).toContain("sliceLedgerChainPage(");
    expect(src).not.toMatch(/const last = all\.rows\[all\.rows\.length - 1\]/);
  });
});

describe("재감사 R1 — 처리 결과 알림 신호 (N-3 FAIL)", () => {
  const storeId = "076bffda-3048-4bfb-80ae-985a69105f4a";
  it("Cash 충전 반려(매장 단위) — Realtime 어댑터 행(meta=legacyMeta)에서 매장 신호", () => {
    const sig = moneyOutcomeFromNotificationRow({
      event_kind: "delivery_ad_business_cash_charge_rejected",
      meta: { kind: "delivery_ad_business_cash_charge_rejected", store_id: storeId },
    });
    expect(sig).toEqual({ kind: "delivery_ad_business_cash_charge_rejected", storeId });
    expect(moneyOutcomeMatchesScope(sig!, { storeId })).toBe(true);
    expect(moneyOutcomeMatchesScope(sig!, { storeId: "other" })).toBe(false);
    expect(moneyOutcomeMatchesScope(sig!, { storeId: null })).toBe(false);
  });

  it("원본 notification_events 행(display_payload.legacyMeta)도 같은 신호", () => {
    const sig = moneyOutcomeFromNotificationRow({
      display_payload: { legacyMeta: { kind: "store_coin_withdrawal_rejected", store_id: storeId } },
    });
    expect(sig).toEqual({ kind: "store_coin_withdrawal_rejected", storeId });
  });

  it("회원 포인트 충전 결과 → 회원 화면만, 채팅 등 다른 알림은 신호 없음", () => {
    const sig = moneyOutcomeFromNotificationRow({ meta: { kind: "user_point_charge_rejected" } });
    expect(sig).toEqual({ kind: "user_point_charge_rejected", storeId: null });
    expect(moneyOutcomeMatchesScope(sig!, { storeId: null })).toBe(true);
    expect(moneyOutcomeMatchesScope(sig!, { storeId })).toBe(false);
    expect(moneyOutcomeFromNotificationRow({ meta: { kind: "community_chat" } })).toBeNull();
  });

  it("Coin 출금 반려·지급 완료 알림 — 관리자 경로가 보낸다", () => {
    const route = read("app/api/admin/coin-withdrawals/route.ts");
    expect(route).toContain('outcome: "rejected"');
    expect(route).toContain('outcome: "paid"');
    const sql = read("supabase/migrations/20271104120000_owner_coin_withdrawal_outcome_kinds.sql");
    expect(sql).toContain("'store_coin_withdrawal_rejected'");
    expect(sql).toContain("'store_coin_withdrawal_paid'");
  });

  it("사장님 돈 화면 7곳이 매장 범위 신호를 듣는다", () => {
    for (const f of [
      "components/business/owner/OwnerStoreFinanceView.tsx",
      "components/business/owner/OwnerBusinessCashView.tsx",
      "components/business/owner/OwnerCoinWithdrawalPanel.tsx",
      "components/business/owner/OwnerCoinConvertSection.tsx",
      "components/business/owner/OwnerStoreSettlementsView.tsx",
      "components/business/owner/OwnerGiftMoneyOpsPanel.tsx",
      "components/stores/owner/dashboard/OwnerFinanceHomeCards.tsx",
    ]) {
      // E-3 — 매장 범위 + 그 화면에 영향 주는 종류 묶음
      expect(read(f), f).toMatch(/useRefetchOnNotificationArrival\([^)]*\{ storeId, kinds: STORE_[A-Z_]+_KINDS \}\)/);
    }
  });
});

describe("재감사 R4 — 기간 입력", () => {
  const sp = (q: string) => new URLSearchParams(q);
  it("사장님: 날짜가 빠진 「직접」은 누적이 아니라 이번 달", () => {
    expect(parseOwnerMoneyPeriodParams(sp("period=custom")).period).toBe("this_month");
    expect(parseOwnerMoneyPeriodParams(sp("period=custom&from=2026-11-01")).period).toBe("this_month");
    const q = parseOwnerStoreCommissionLedgerQuery(sp("period=custom"), new Date("2026-11-03T04:00:00Z"));
    expect(q.period).toBe("this_month");
    expect(q.fromIso).toBe("2026-10-31T16:00:00.000Z");
  });
  it("없는 날짜는 버리고, 뒤바뀐 날짜는 바로잡는다", () => {
    expect(parseStoreCommissionPeriodParams(sp("period=custom&from=2026-02-31&to=2026-03-02")).fromDay).toBeNull();
    const p = parseStoreCommissionPeriodParams(sp("period=custom&from=2026-11-10&to=2026-11-01"));
    expect([p.fromDay, p.toDay]).toEqual(["2026-11-01", "2026-11-10"]);
  });
  it("화면 입력 상태 — 둘 다 있어야 조회, 시작 > 종료 안내", () => {
    expect(customPeriodInputState("", "2026-11-01")).toBe("incomplete");
    expect(customPeriodInputState("2026-11-10", "2026-11-01")).toBe("inverted");
    expect(customPeriodInputState("2026-11-01", "2026-11-10")).toBe("ok");
  });
});

describe("재감사 R3 — 합계 칸 부호 (잔액 영향대로)", () => {
  const coin = (sums: Partial<CoinPeriodSummary["sums"]>): CoinPeriodSummary => ({
    wallet: "coin",
    opening: 0,
    closing: 0,
    sums: { earned: 0, converted: 0, withdrawn: 0, reversed: 0, adjusted: 0, other: 0, ...sums },
    withdrawalPaid: 0,
    rowCount: 0,
    reconciled: true,
  });
  const tile = (tiles: { key: string; value: string }[], key: string) => tiles.find((t) => t.key === key)?.value;

  it("출금 순값이 환원(음수)이면 +로 — 이전에는 −로 표시", () => {
    expect(tile(coinTiles(coin({ withdrawn: -5 }), true), "withdrawn")).toMatch(/^\+/);
    expect(tile(coinTiles(coin({ withdrawn: 5 }), true), "withdrawn")).toMatch(/^−/);
  });
  it("분류표 밖 종류는 「기타」 칸으로 (칸 합 = 종료 − 시작)", () => {
    expect(tile(coinTiles(coin({ other: 3 }), true), "other")).toMatch(/^\+/);
    expect(coinTiles(coin({}), true).some((t) => t.key === "other")).toBe(false);
  });
  it("Cash 판매 수수료 — 환급이 더 크면 + (「−-₱」 금지), 2자리", () => {
    const base = {
      wallet: "cash", openingMinor: 0, closingMinor: 0, topupMinor: 0, fromConversionMinor: 0, saleFeeMinor: 100,
      outstandingCollectionMinor: 0, saleFeeReversalMinor: 2350, adSpendMinor: 0, partnerSpendMinor: 0, refundMinor: 0,
      adjustmentCreditMinor: 0, adjustmentDebitMinor: 0, otherCreditMinor: 0, otherDebitMinor: 0, creditMinor: 0,
      debitMinor: 0, rowCount: 0, reconciled: true,
    } as CashPeriodSummary;
    const v = tile(cashTiles(base, true, false), "fee")!;
    expect(v.startsWith("+")).toBe(true);
    expect(v).toContain("22.50");
    expect(v).not.toContain("−-");
  });
});

/**
 * 금융 P0 (Owner 2026-11-03 승인) — 코드 단위 검증.
 * DB 함수(DB-1·DB-2) 동작은 scripts/qa/finance-p0-local-pg 의 격리 PostgreSQL 검증이 담당한다.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readBalanceOrNull } from "@/lib/currency/currency-display-contract";
import {
  classifyCoinLedgerAmount,
  computeCoinLedgerRecentWindowSums,
  sumCoinLedgerContributions,
} from "@/lib/stores/owner-finance-recent-window";
import {
  buildCashLedgerIntegrityReport,
  orderCashLedgerRowsForChain,
} from "@/lib/finance/cash-ledger-chain-integrity";
import { refundPointsAfterFailedPurchase } from "@/lib/points/refund-points-after-failed-purchase";
import {
  loadStoreBusinessCashBalance,
  loadStoreEconomicPointsBalance,
} from "@/lib/stores/advertising/canonical-business-cash-writer";
import { ownerCoinConvertReason } from "@/components/business/owner/OwnerCoinConvertSection";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

function balanceSb(result: { data: unknown; error: { message: string } | null }) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => result };
  return { from: () => chain } as never;
}

describe("P0-1 — 조회 실패 ≠ 잔액 0", () => {
  it("loaders return null on query error, 0 only when the account row is absent", async () => {
    expect(await loadStoreBusinessCashBalance(balanceSb({ data: null, error: { message: "timeout" } }), "s1")).toEqual({
      balanceMinor: null,
      currency: "PHP",
    });
    expect(await loadStoreBusinessCashBalance(balanceSb({ data: null, error: null }), "s1")).toEqual({
      balanceMinor: 0,
      currency: "PHP",
    });
    expect(await loadStoreEconomicPointsBalance(balanceSb({ data: null, error: { message: "x" } }), "s1")).toEqual({ balance: null });
    expect(await loadStoreEconomicPointsBalance(balanceSb({ data: { balance: -10 }, error: null }), "s1")).toEqual({ balance: -10 });
  });

  it("readBalanceOrNull keeps 0 and negatives, maps missing/invalid to null", () => {
    expect(readBalanceOrNull(0)).toBe(0);
    expect(readBalanceOrNull(-38)).toBe(-38);
    expect(readBalanceOrNull(null)).toBeNull();
    expect(readBalanceOrNull(undefined)).toBeNull();
    expect(readBalanceOrNull("12")).toBeNull();
  });

  it("owner/admin finance UIs no longer coerce balances with `|| 0` / `?? 0`", () => {
    for (const rel of [
      "components/business/owner/OwnerStoreFinanceView.tsx",
      "components/business/owner/OwnerBusinessCashView.tsx",
      "components/stores/owner/dashboard/OwnerFinanceHomeCards.tsx",
      "components/business/owner/OwnerGiftMoneyOpsPanel.tsx",
    ]) {
      const src = read(rel);
      expect(src).not.toMatch(/storePoints\?\.balance\) \|\| 0/);
      expect(src).not.toMatch(/businessCash\?\.balanceMinor\) \|\| 0/);
    }
    expect(read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx")).not.toContain("amount={cashBalanceMinor ?? 0}");
    expect(read("components/admin/finance/AdminStoreFinancePanels.tsx")).not.toContain("data?.cash?.balanceMinor ?? 0");
  });

  it("conversion policy is never invented (no rate 1 fallback)", () => {
    const writer = read("lib/stores/advertising/canonical-business-cash-writer.ts");
    expect(writer).not.toContain("loadBusinessCashConversionRate");
    expect(read("lib/finance/conversion-policy.ts")).toContain("if (!Number.isFinite(rate) || rate <= 0) return null;");
  });
});

describe("P0-2 — Coin 순출금·REVERSAL 집계 단일 규칙", () => {
  const rows = [
    { entryKind: "SALE_EARN", amount: 100 },
    { entryKind: "WITHDRAWAL_REQUEST", amount: -30 },
    { entryKind: "WITHDRAWAL_RELEASE", amount: 30 }, // 반려 환원
    { entryKind: "WITHDRAWAL_REQUEST", amount: -20 },
    { entryKind: "WITHDRAWAL_COMPLETE", amount: 0 },
    { entryKind: "CONVERT_TO_BUSINESS_CASH", amount: -10 },
    { entryKind: "REVERSAL", amount: -100 },
    { entryKind: "ADMIN_ADJUST", amount: 5 },
  ];

  it("rejected withdrawal nets to 0; reversal is separate; identity holds exactly", () => {
    const s = sumCoinLedgerContributions(rows);
    expect(s).toEqual({ earned: 100, converted: 10, withdrawn: 20, reversed: 100, adjusted: 5, other: 0 });
    const closing = rows.reduce((a, r) => a + r.amount, 0);
    expect(0 + s.earned - s.converted - s.withdrawn - s.reversed + s.adjusted + s.other).toBe(closing);
    expect(closing).toBe(-25); // 음수 Coin(환불 빚) 그대로
  });

  it("matches the owner recent-window sums (same rule everywhere)", () => {
    const w = computeCoinLedgerRecentWindowSums(rows);
    const s = sumCoinLedgerContributions(rows);
    expect(w.withdrawn).toBe(s.withdrawn);
    expect(w.reversed).toBe(s.reversed);
    expect(w.converted).toBe(s.converted);
  });

  it("unknown kinds are surfaced as `other`, not dropped", () => {
    expect(classifyCoinLedgerAmount("SOMETHING_NEW", 7).other).toBe(7);
  });

  it("statements no longer use startsWith('WITHDRAWAL') + abs", () => {
    expect(read("lib/finance/store-statement/load-store-statement.ts")).not.toContain('kind.startsWith("WITHDRAWAL")');
    const daily = read("lib/finance/daily-statement/load-daily-statement.ts");
    expect(daily).not.toContain('kind.startsWith("WITHDRAWAL")');
    expect(daily).toContain("row.coinReversed += c.reversed");
  });
});

describe("P0-3 — 결제 실패 후 환급 확인", () => {
  const input = {
    userId: "u1",
    amount: 300,
    relatedType: "ad_application" as const,
    refundRelatedId: "ad-1",
    description: "신청 실패 환불",
  };

  it("refund ok → ok", async () => {
    const sb = { rpc: vi.fn(async () => ({ data: { ok: true, duplicate: false, ledger_id: "l1", balance_after: 300 }, error: null })) };
    expect(await refundPointsAfterFailedPurchase(sb as never, input)).toEqual({ ok: true, duplicate: false, balanceAfter: 300 });
  });

  it("retry with the same key returns duplicate (no double refund)", async () => {
    const sb = { rpc: vi.fn(async () => ({ data: { ok: true, duplicate: true, balance_after: 300 }, error: null })) };
    expect(await refundPointsAfterFailedPurchase(sb as never, input)).toMatchObject({ ok: true, duplicate: true });
  });

  it("persistent failure → refund_pending + audit row, same deterministic key", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const sb = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "db down" } })),
      from: vi.fn(() => ({
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row);
          return { error: null };
        },
      })),
    };
    const r = await refundPointsAfterFailedPurchase(sb as never, input);
    expect(r).toEqual({ ok: false, refundPending: true, error: "db down", refundKey: "ad_application:ad-1" });
    expect(sb.rpc).toHaveBeenCalledTimes(3);
    for (const call of sb.rpc.mock.calls as unknown as unknown[][]) {
      expect((call[1] as { p_related_id: string }).p_related_id).toBe("ad-1");
    }
    expect(inserts[0]).toMatchObject({ action_type: "point_refund_pending", related_id: "ad_application:ad-1" });
  });

  it("ad routes check the refund result instead of fire-and-forget", () => {
    expect(read("app/api/ads/apply/route.ts")).toContain('error: "refund_pending"');
    expect(read("lib/ads/renew-feed-ad-campaign.ts")).toContain('error: "refund_pending"');
  });
});

describe("P0-4 — 관리자 실지급 = 원자 RPC, 허위 성공 금지", () => {
  it("uses apply_community_point_reward and never TS credit + separate execution insert", () => {
    const src = read("lib/point-executions/execute-point-reward-server.ts");
    expect(src).toContain('sb.rpc("apply_community_point_reward"');
    expect(src).not.toContain("creditUserPoints");
    expect(src).not.toContain("insertPointRewardLog");
    expect(src).toContain('"already_processed"');
  });

  it("route requires a real target (no post-test-* fake source) and returns outcome", () => {
    const route = read("app/api/admin/point-executions/reward/route.ts");
    expect(route).not.toContain("post-test-${");
    expect(route).toContain("targetId_required");
    expect(route).toContain("verifyRewardTargetOwnedByUser");
    expect(route).toContain("outcome: result.outcome");
    const page = read("components/admin/point-executions/AdminPointExecutionPage.tsx");
    expect(page).not.toContain('defaultValue="post-test-1"');
    expect(page).toContain('json.outcome === "already_processed"');
  });
});

describe("P0-5 — 전환 확인창은 서버 값만", () => {
  it("no client-side balance subtraction in the convert UI", () => {
    const section = read("components/business/owner/OwnerCoinConvertSection.tsx");
    expect(section).not.toMatch(/storePointsBalance\s*-\s*quote\.requestedPoints/);
    expect(section).not.toMatch(/businessCashBalanceMinor\s*\+\s*quote\.expectedBusinessCashMinor/);
    expect(section).toContain("coinTo: (quote.coinAfter ?? 0)");
    expect(section).toContain("open={confirmOpen && quote != null && quote.canConvert}");
    expect(read("components/business/owner/OwnerBusinessCashView.tsx")).not.toContain("popup_convert_coin_amounts");
  });

  it("every preview blocker / convert error has an owner sentence", () => {
    for (const code of [
      "conversion_disabled", "amount_required", "below_minimum", "invalid_unit", "daily_count_limit",
      "weekly_count_limit", "monthly_count_limit", "daily_coin_limit", "monthly_coin_limit", "interval_limit",
      "insufficient_store_points", "credit_zero", "stale_rate", "rate_missing", "forbidden", "idempotency_conflict",
    ]) {
      expect(ownerCoinConvertReason(code, "ko", { minimumCoin: 10, conversionUnit: 5, available: 0 })).not.toBe("");
    }
    expect(ownerCoinConvertReason("below_minimum", "ko", { minimumCoin: 10 })).toContain("10 Coin");
  });

  it("withdrawal panel blocks when balance unknown or ≤ 0", () => {
    const panel = read("components/business/owner/OwnerCoinWithdrawalPanel.tsx");
    expect(panel).toContain("const canWithdraw = availableCoin != null && availableCoin > 0;");
    expect(panel).toContain("disabled={busy || !canWithdraw}");
    expect(read("app/api/me/stores/[storeId]/finance/withdrawals/route.ts")).toContain('error: "balance_unavailable"');
  });
});

describe("P0-6 — Cash 원장 무결성 (FAIL 숨기지 않음)", () => {
  const t = (s: number) => `2026-09-01T00:00:${String(s).padStart(2, "0")}Z`;

  it("same-timestamp rows are ordered to satisfy the chain (no false breaks)", () => {
    const rows = [
      { id: "a", entry_kind: "TOP_UP", direction: "credit", amount_minor: 1000, balance_after_minor: 1000, created_at: t(1) },
      { id: "c", entry_kind: "SALE_FEE_SETTLEMENT", direction: "debit", amount_minor: 200, balance_after_minor: 2800, created_at: t(2) },
      { id: "b", entry_kind: "TOP_UP", direction: "credit", amount_minor: 2000, balance_after_minor: 3000, created_at: t(2) },
    ];
    expect(orderCashLedgerRowsForChain(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
    const rep = buildCashLedgerIntegrityReport({ balanceMinor: 2800, rows });
    expect(rep.status).toBe("PASS");
    expect(rep.breaks).toEqual([]);
  });

  it("QA direct-write pattern stays FAIL with the diff shown (suspected cause is a note only)", () => {
    const rows = [
      { id: "a", entry_kind: "CONVERT_FROM_STORE_POINTS", direction: "credit", amount_minor: 1000, balance_after_minor: 39000, created_at: t(1) },
      { id: "b", entry_kind: "SALE_FEE", direction: "debit", amount_minor: 2000, balance_after_minor: 0, created_at: t(2) },
    ];
    const rep = buildCashLedgerIntegrityReport({ balanceMinor: 0, rows });
    expect(rep.status).toBe("FAIL");
    expect(rep.balanceVsLedgerSumDiffMinor).toBe(1000);
    expect(rep.breaks).toHaveLength(1);
    expect(rep.breaks[0].suspected_cause).toBe("qa_direct_balance_write_pattern");
  });

  it("unknown balance is UNAVAILABLE, never PASS", () => {
    expect(buildCashLedgerIntegrityReport({ balanceMinor: null, rows: [] }).status).toBe("UNAVAILABLE");
  });
});

describe("P1 — 회원·관리자 포인트 표시", () => {
  it("gift certificate / store discount are no longer 「기타 조정」", async () => {
    const { normalizePointFinancialCategory, pointFinancialCategoryTitle } = await import("@/lib/points/point-financial-history");
    expect(normalizePointFinancialCategory("spend", "gift_certificate_purchase")).toBe("GIFT_CERTIFICATE");
    expect(pointFinancialCategoryTitle("GIFT_CERTIFICATE").fallbackTitleKo).toBe("상품권 구매");
    expect(normalizePointFinancialCategory("spend", "store_order_discount")).toBe("STORE_ORDER_DISCOUNT");
    expect(normalizePointFinancialCategory("refund", "store_order_discount")).toBe("REFUND");
  });

  it("POINT tokens are blue, not the brand/cash green", () => {
    const css = read("app/design-tokens.css");
    expect(css).toContain("--currency-point-accent: #2563eb;");
    expect(css).not.toContain("--currency-point-accent: var(--sam-primary);");
  });

  it("admin adjust shows the server ledger result, duplicate is not 「완료」", () => {
    const panel = read("components/admin/points/AdminPointAdjustPanel.tsx");
    expect(panel).toContain("json.duplicate === true");
    expect(panel).toContain("if (!json.ledgerId || json.balanceAfter == null)");
    const ledger = read("components/admin/points/AdminPointLedgerPage.tsx");
    for (const col of ['"거래 ID"', '"이전 잔액"', '"처리 주체"', '"원천 거래"']) expect(ledger).toContain(col);
  });
});

describe("Owner 2026-11-03 — Coin 지급 명칭 = 「Coin 출금」 단일", () => {
  it("owner/admin Coin withdrawal surfaces never say 「환전」", () => {
    for (const rel of [
      "components/finance/OwnerFinanceNav.tsx",
      "components/business/owner/OwnerCoinWithdrawalPanel.tsx",
      "components/business/owner/OwnerStoreFinanceView.tsx",
      "components/admin/finance/AdminFinanceControlPlane.tsx",
      "lib/admin/domain-control/finance-operator-ops.ts",
    ]) {
      expect(read(rel), rel).not.toContain("환전");
    }
    const nav = read("lib/i18n/catalog/business-admin-nav.ts");
    for (const key of ["owner_finance_withdraw_title", "owner_finance_withdraw_submit", "owner_finance_withdraw_history"]) {
      const line = nav.split("\n").find((l) => l.includes(`${key}:`)) ?? "";
      expect(line, key).not.toContain("환전");
    }
    expect(read("lib/finance/product-decision-lock.ts")).toContain('COIN_WITHDRAWAL_LABEL_KO = "Coin 출금 신청"');
  });
});

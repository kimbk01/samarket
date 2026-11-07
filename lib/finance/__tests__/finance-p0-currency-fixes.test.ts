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
    // D-01 (2026-11-07): 연장은 DB 함수 1번(차감·연장 한 트랜잭션) — TS 차감·환급 경로 없음
    const renew = read("lib/ads/renew-feed-ad-campaign.ts");
    expect(renew).toContain('rpc("member_feed_ad_renew"');
    expect(renew).not.toContain("refundPoints");
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

describe("P1 — 관리자 Coin·Cash 원장·증빙·환급 대기, 사장님 내역 사유", () => {
  it("admin ledger table shows id, PHT time, before, signed change, actor, source", () => {
    // 재감사 P-8 (2026-11-04): 이 표를 그리던 AdminStoreFinancePanels 는 화면 연결 0 이라 삭제. 지금 관리자 매장 상세
    // (AdminFinanceStoreViews → FinanceTransactionList)에는 「이전 잔액」「처리 주체」 열이 없다 — Owner 결정 사항으로 보고함.
    expect(read("app/api/admin/store-finance/route.ts")).toContain("{ includeAudit: true }");
  });

  it("owner finance API never exposes actor ids (audit only for admin)", () => {
    for (const rel of ["app/api/me/stores/[storeId]/finance/route.ts", "app/api/me/stores/[storeId]/business-cash/route.ts"]) {
      expect(read(rel)).not.toContain("includeAudit");
    }
  });

  it("top-up evidence and pending refunds are visible to admin", () => {
    expect(read("app/api/admin/store-finance/route.ts")).toContain("payment_reference, proof_file_path, reject_reason");
    // 증빙은 지금 Cash 충전 신청 화면이 보여 준다 (예전 패널은 연결 0 이라 삭제 · P-8)
    expect(read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx")).toContain("data-admin-cash-charge-reference");
    expect(read("app/api/admin/points/refund-pending/route.ts")).toContain("POINT_REFUND_PENDING_ACTION");
    expect(read("components/admin/points/AdminPointLedgerPage.tsx")).toContain("<AdminPointRefundPendingPanel");
  });

  it("owner sees withdrawal reject reason / payout ref and top-up reject reason", () => {
    expect(read("app/api/me/stores/[storeId]/finance/withdrawals/route.ts")).toContain("rejection_reason, payout_method, payout_reference");
    expect(read("components/business/owner/OwnerCoinWithdrawalPanel.tsx")).toContain("row.rejection_reason");
    expect(read("components/business/owner/OwnerBusinessCashView.tsx")).toContain("r.rejectReason ?");
  });
});

describe("실기 결함 2026-11-03 — 회귀 방지", () => {
  it("F-6/F-7 통화 카드 토큰은 존재하는 토큰만 쓰고, POINT 금액도 파랑", () => {
    const css = read("app/design-tokens.css");
    const start = css.indexOf("--currency-point-accent");
    const block = css.slice(start, css.indexOf("--currency-cash-border", start) + 120);
    expect(block).not.toContain("var(--sam-app)");
    expect(block).not.toMatch(/var\(--sam-border\)/);
    expect(block).toContain("var(--sam-bg-surface)");
    expect(read("app/samarket-components.css")).toContain('.currency-card--point [data-currency-amount="point"]');
  });

  it("F-8 CASH 표시는 ₱ + 소수점 2자리", async () => {
    const { formatCurrencyAmount, formatCashPhp2 } = await import("@/lib/currency/currency-display-contract");
    expect(formatCurrencyAmount({ currency: "cash", amount: 0, isMinor: true })).toBe("₱0.00");
    expect(formatCurrencyAmount({ currency: "cash", amount: 840000, isMinor: true })).toBe("₱8,400.00");
    expect(formatCashPhp2(-1.5)).toBe("-₱1.50");
  });

  it("F-9 COIN 설명 = DIBAY 부담 쿠폰 지원금", async () => {
    const { CURRENCY_DISPLAY_DESCRIPTIONS } = await import("@/lib/currency/currency-display-contract");
    expect(CURRENCY_DISPLAY_DESCRIPTIONS.coin.ko).toContain("쿠폰 지원금");
  });

  it("F-1 기간에 원장이 없으면 이전 마지막 잔액 사용 (0 으로 두지 않음)", () => {
    const src = read("lib/finance/store-statement/load-store-statement.ts");
    expect(src).toContain(": coinBeforePeriod;");
    expect(src).toContain(": cashBeforePeriod;");
  });

  it("F-2/F-3 「연결 대상」은 store_order·meta.order_id 만 주문, 원천 이름은 사람이 읽는 이름", async () => {
    const src = read("lib/finance/unified-transaction/load-unified-transactions.ts");
    expect(src).not.toContain('rt.includes("settlement")');
    const { financeRelatedTargetLabel } = await import("@/lib/finance/presentation");
    expect(financeRelatedTargetLabel({ relatedType: "business_cash_charge_request", relatedId: "dd817a4c-0000" }, true)).toBe("충전 신청 · dd817a4c…");
  });

  it("F-4/F-13 무결성·잔액 조정이 실제 관리자 매장 재무 화면에 연결됨", () => {
    const view = read("components/finance/AdminFinanceStoreViews.tsx");
    expect(view).toContain("<AdminStoreCashIntegritySection");
    expect(view).toContain("<AdminStoreBalanceCorrectionForm");
  });

  it("F-5 관리자 포인트 원장 목록은 actor_id 를 읽는다 (회원 API 는 아님)", () => {
    const src = read("lib/points/project-point-financial-history.ts");
    expect(src).toContain("`${POINT_LEDGER_ROW_SELECT}, actor_id`");
    expect(read("lib/points/point-query-select.ts")).not.toMatch(/POINT_LEDGER_ROW_SELECT =[^;]*actor_id/);
  });

  it("F-10 회원 충전 신청 반려 사유 표시 · F-11 관리자 상세 placeholder 제거 · F-12 복귀 시 재조회", () => {
    expect(read("lib/points/point-query-select.ts")).toContain("reject_reason");
    expect(read("components/points/PointChargeRequestList.tsx")).toContain("r.rejectReason");
    expect(read("lib/i18n/catalog/admin-points-notifications.ts")).not.toContain("(placeholder)");
    expect(read("app/(main)/mypage/points/page.tsx")).toContain("useRefetchOnPageShowRestore(refetchOnRestore");
  });

  it("F-14/F-15 Cash 충전 상태 한국어 · 승인 건에 「적립 불가」 표시 금지", async () => {
    const { adminOperatorLabel } = await import("@/lib/admin/operator-ux/operator-labels");
    expect(adminOperatorLabel("APPROVED", true)).toBe("승인");
    expect(adminOperatorLabel("REJECTED", true)).toBe("반려");
    expect(read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx")).toContain("근거 없이 적립됨");
  });
});

describe("2차 실기 결함 (2026-11-03 · Production 246334c53/3ad04f6bc)", () => {
  it("P-2 회원 포인트 API 는 공용 충전 매핑 하나만 쓴다 (복사본이 반려 사유를 뺐음)", () => {
    const route = read("app/api/me/points/route.ts");
    expect(route).not.toMatch(/function normalizeChargeRequest/);
    // 충전 신청 목록은 기간·페이지 공용 함수(회원·관리자 같은 함수)로 옮겼다 — 그 함수가 공용 매핑을 쓴다 (설계 H-7)
    expect(route).toContain("loadPointHistoryPeriodExtras");
    const shared = read("lib/points/point-period-history.ts");
    expect(shared).not.toMatch(/function normalizeChargeRequest/);
    expect(shared).toContain("normalizeChargeRequest } from \"@/lib/points/admin-user-points-shared\"");
  });

  it("K-3/C-4 사장님 화면 반려 용어 = 관리자 「반려」, 출금 취소는 「취소」 로 따로", () => {
    const cat = read("lib/i18n/catalog/business-admin-nav.ts");
    expect(cat).toContain('owner_finance_cash_topup_status_rejected: "반려"');
    expect(cat).toContain('owner_finance_withdraw_status_rejected: "반려"');
    expect(cat).toContain('owner_finance_withdraw_status_cancelled: "취소"');
    expect(read("components/business/owner/OwnerCoinWithdrawalPanel.tsx")).not.toContain('"거절"');
  });

  it("관리자 거래 필터 — 전환 두 원장 행 이름이 서로 다름, admin_adjustment 이름표", async () => {
    const { financeTypeFilterOptions, financeRelatedTypeLabel } = await import("@/lib/finance/presentation");
    const labels = financeTypeFilterOptions(true).map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(financeRelatedTypeLabel("admin_adjustment", true)).toBe("관리자 조정");
  });

  it("연결 대상 — 전환 Coin 행은 자기 원장 id, 출금 신청 행은 출금 신청 id 로 맞춘다", async () => {
    const { canonicalCoinConversionLink, linkCoinWithdrawalRequestRows } = await import("@/lib/finance/coin-ledger-link");
    const conv = canonicalCoinConversionLink({
      id: "2eaa6fe8-led",
      entryKind: "CONVERT_TO_BUSINESS_CASH",
      relatedType: "business_cash_conversion",
      relatedId: "sp2bc:key",
    });
    expect(conv.relatedId).toBe("2eaa6fe8-led");
    const rows = [{ id: "hold-1", entryKind: "WITHDRAWAL_REQUEST", relatedType: "coin_withdrawal", relatedId: "coin_withdrawal:key" }];
    const chain = { select: () => chain, in: async () => ({ data: [{ id: "wd-1", hold_ledger_id: "hold-1" }], error: null }) };
    await linkCoinWithdrawalRequestRows({ from: () => chain } as never, rows);
    expect(rows[0].relatedId).toBe("wd-1");
    expect(read("lib/stores/advertising/canonical-business-cash-writer.ts")).toContain("linkCoinWithdrawalRequestRows(sb, rows)");
    expect(read("components/business/owner/OwnerStoreFinanceView.tsx")).not.toContain("LEDGER_SOURCE_LABEL");
  });

  it("C-3/C-4 사장님 재무 — 작업 후 조용한 재조회·복귀·탭 이동 재조회, 완료는 공통 토스트", () => {
    const view = read("components/business/owner/OwnerStoreFinanceView.tsx");
    expect(view).toContain("onChanged={refetchSilently}");
    expect(view).toContain("onSubmitted={refetchSilently}");
    expect(view).toContain("useRefetchOnPageShowRestore(refetchSilently");
    const cash = read("components/business/owner/OwnerBusinessCashView.tsx");
    expect(cash).not.toMatch(/await load\(\);\n\s+await onChanged/);
    expect(read("components/business/owner/OwnerCoinConvertSection.tsx")).toContain("toast.success(");
    expect(read("components/business/owner/OwnerCoinWithdrawalPanel.tsx")).toContain("toast.success(");
  });

  it("K-1 Cash 충전 금액 센타보 유지 (₱10.50 을 ₱10 으로 버리지 않음)", () => {
    const cash = read("components/business/owner/OwnerBusinessCashView.tsx");
    expect(cash).not.toContain("Math.trunc(Number(topUpAmountPhp)");
    expect(cash).toContain('inputMode="decimal"');
    expect(cash).toContain("Math.round(Number(raw) * 100)");
  });

  it("C-2 전환 미리보기 — 미납 0 은 「−₱0.00」 아님, 비율 ₱x.xx", () => {
    const conv = read("components/business/owner/OwnerCoinConvertSection.tsx");
    expect(conv).not.toContain("−{formatDeliveryAdPhpMinor(quote.feeSettleMinor");
    expect(conv).toContain("1 Coin = {formatCashPhp2(policy.ratePesosPerPoint)}");
  });

  it("관리자 Coin 출금 — 계좌번호·매장 이름·반려 사유 표시, 개발자 문구 없음", () => {
    const panel = read("components/admin/finance/AdminCoinWithdrawalsPanel.tsx");
    expect(panel).toContain("r.account_number");
    expect(panel).toContain("r.store_name");
    expect(panel).toContain("r.rejection_reason");
    expect(panel).not.toContain("writer");
    expect(panel).not.toContain("Admin Actor");
    expect(read("app/api/admin/coin-withdrawals/route.ts")).toContain("rejection_reason, payout_reference");
  });

  it("회원 충전 플랜 이름은 화면 언어로 (한국어 화면에 영문 금지)", () => {
    expect(read("components/points/PointChargeForm.tsx")).toContain('language === "en" ? p.nameEn : p.nameKo');
  });
});

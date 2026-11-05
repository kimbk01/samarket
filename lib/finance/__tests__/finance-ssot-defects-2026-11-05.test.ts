import { describe, expect, it } from "vitest";
import {
  appleRefundLedgerLabel,
  appleTransactionTail,
  cashTopUpStatusDisplay,
  coinWithdrawalStatusDisplay,
  financePayoutMethodDisplay,
  financeRefNo,
  financeTxNo,
  pointChargeStatusDisplay,
  pointChargeSubtitle,
} from "@/lib/finance/finance-display-labels";
import { financeTypeFilterOptions, financeTypeLabel } from "@/lib/finance/presentation";
import { normalizeOwnerFinanceSection } from "@/lib/finance/routes";
import { walletLedgerAdApplicationId, walletLedgerPublicReason } from "@/lib/finance/wallet-period-history";
import { financeAuditActionLabel, financeAuditTargetLabel } from "@/lib/admin/finance-audit-labels";
import { adminActorLabel } from "@/lib/admin/load-admin-actor-names";
import { toMemberChargeRequest } from "@/lib/points/admin-user-points-shared";
import { toMemberPointHistoryItem, withAdminAdjustPublicReason } from "@/lib/points/project-point-financial-history";
import { isHiddenCaptureAuditRow, pickPointLedgerChainTail } from "@/lib/points/point-period-history";
import { orderLedgerChainDesc } from "@/lib/finance/ledger-chain-order";
import { appleIapReconCsv, phtDayRange, summarizeAppleIapRecon } from "@/lib/apple-iap/apple-iap-reconciliation";
import type { PointFinancialHistoryItem } from "@/lib/points/point-financial-history";
import type { PointChargeRequest } from "@/lib/types/point";
import {
  withoutAdminActors,
  type StoreCommissionLedgerRow,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { BUSINESS_CASH_LEDGER_KIND_LABEL } from "@/lib/stores/commission/store-commission-contract";

describe("M-1 이름 SSOT — 입금 신청·입금 확인·충전 완료·출금 신청·출금 완료 구분", () => {
  it("Point 충전 상태", () => {
    expect(pointChargeStatusDisplay("pending")?.ko).toBe("입금 신청");
    expect(pointChargeStatusDisplay("waiting_confirm")?.ko).toBe("입금 확인 중");
    expect(pointChargeStatusDisplay("approved")?.ko).toBe("충전 완료");
    expect(pointChargeStatusDisplay("unknown")).toBeNull();
  });

  it("Cash 충전 CANCELLED 도 이름이 있다 (O-1)", () => {
    expect(cashTopUpStatusDisplay("CANCELLED")?.ko).toBe("취소");
    expect(cashTopUpStatusDisplay("APPROVED")?.en).toBe("Top-up complete");
  });

  it("Coin 출금 — 신청과 송금 완료가 다른 이름", () => {
    expect(coinWithdrawalStatusDisplay("REQUESTED")?.ko).toBe("출금 신청");
    expect(coinWithdrawalStatusDisplay("PAID")?.ko).toBe("출금 완료");
    expect(coinWithdrawalStatusDisplay("REJECTED")?.ko).toBe("반려 (Coin 환원)");
  });

  it("Apple 결제는 「입금 확인」으로 보이지 않는다", () => {
    const s = pointChargeSubtitle("apple_iap", "approved");
    expect(s.ko).toBe("Apple 결제 · 충전 완료");
    expect(s.ko).not.toContain("입금 확인");
    expect(pointChargeSubtitle("manual_confirm", "pending").ko).toBe("계좌 입금 · 입금 신청");
  });

  it("지급 수단 — 은행 송금", () => {
    expect(financePayoutMethodDisplay("bank")?.ko).toBe("은행 송금");
    expect(financePayoutMethodDisplay("gcash")?.en).toBe("GCash");
  });
});

describe("연결 번호 — 같은 거래는 같은 번호", () => {
  it("거래번호·참조번호·Apple 끝자리", () => {
    expect(financeTxNo("POINT", "a1b2c3d4-0000-0000-0000-000000000000")).toBe("PL-A1B2C3D4");
    expect(financeTxNo("CASH", "a1b2c3d4-0000")).toBe("BC-A1B2C3D4");
    expect(financeTxNo("COIN", "abc")).toBeNull();
    expect(financeRefNo("ffeeddcc-1111")).toBe("#FFEEDDCC");
    expect(appleTransactionTail("apple:2000000123456789")).toBe("…23456789");
  });

  it("Apple 환불 원장 줄은 고정 문구 (M-2 — 관리자 메모 아님)", () => {
    expect(appleRefundLedgerLabel("apple_iap_refund")?.ko).toBe("Apple 환불 회수");
    expect(appleRefundLedgerLabel("apple_iap_refund_reversal")?.ko).toBe("Apple 환불 취소 반영");
    expect(appleRefundLedgerLabel("admin_manual")).toBeNull();
  });

  it("광고 신청 id — 사용은 related_id, 환불은 멱등 키에서", () => {
    expect(walletLedgerAdApplicationId("AD_SPEND", "app-1", null)).toBe("app-1");
    expect(walletLedgerAdApplicationId("AD_REFUND", "fund-1", "bc_refund:banner:app-2")).toBe("app-2");
    expect(walletLedgerAdApplicationId("TOP_UP", "x", null)).toBeNull();
  });
});

describe("내부 메모·처리자 노출 차단", () => {
  const baseItem: PointFinancialHistoryItem = {
    ledgerId: "l1",
    userId: "u1",
    occurredAt: "2026-11-05T00:00:00Z",
    direction: "credit",
    amount: 100,
    signedAmount: 100,
    balanceAfter: 100,
    category: "ADMIN_CREDIT",
    titleKey: "k",
    fallbackTitleKo: "포인트 지급",
    fallbackTitleEn: "Point credit",
    subtitle: "Apple 환불 내부 메모",
    subtitleEn: "internal",
    relatedType: "apple_iap_refund",
    relatedId: "r1",
    entryType: "admin_adjust",
    description: "Apple 환불 내부 메모",
    actorType: "admin",
    actorId: "admin-uuid",
    relatedObject: null,
    promotion: null,
    deposit: null,
    adjustment: { reason: "Apple 환불 내부 메모", publicReason: "", actorType: "admin" },
    status: null,
  } as PointFinancialHistoryItem;

  it("회원 Point 내역 — 공개 사유가 없으면 운영팀, actorId 없음", () => {
    const m = toMemberPointHistoryItem(baseItem);
    expect(m.actorId).toBeNull();
    expect(m.description).toBe("");
    expect(m.subtitle).toBe("운영팀");
    expect(m.subtitleEn).toBe("DIBAY support");
    expect(m.adjustment?.reason).toBe("");
    expect(JSON.stringify(m)).not.toContain("내부 메모");
  });

  it("회원 Point 내역 — 수동 지급 공개 사유는 보인다", () => {
    const m = toMemberPointHistoryItem({
      ...baseItem,
      adjustment: { reason: "이벤트 보상", publicReason: "이벤트 보상", actorType: "admin" },
      description: "이벤트 보상",
    } as PointFinancialHistoryItem);
    expect(m.subtitle).toBe("이벤트 보상");
    expect(m.actorId).toBeNull();
  });

  it("예전 「사유 · 내부 메모」 원장 — 감사 기록의 공개 사유만, 조회 실패면 비움", () => {
    const legacy = {
      ...baseItem,
      relatedType: "admin_manual",
      description: "이벤트 보상 · 내부 확인용 메모",
      adjustment: { reason: "이벤트 보상 · 내부 확인용 메모", publicReason: "이벤트 보상 · 내부 확인용 메모", actorType: "admin" },
    } as PointFinancialHistoryItem;
    const fromAudit = toMemberPointHistoryItem(withAdminAdjustPublicReason(legacy, new Map([["l1", "이벤트 보상"]])));
    expect(fromAudit.subtitle).toBe("이벤트 보상");
    expect(JSON.stringify(fromAudit)).not.toContain("내부 확인용 메모");
    const failed = toMemberPointHistoryItem(withAdminAdjustPublicReason(legacy, null));
    expect(failed.subtitle).toBe("운영팀");
    expect(JSON.stringify(failed)).not.toContain("내부 확인용 메모");
  });

  it("회원 충전 신청 — 관리자 메모·처리자·검증 메모 제거", () => {
    const r = toMemberChargeRequest({
      id: "c1",
      adminMemo: "memo",
      approvedBy: "admin-1",
      processedBy: "admin-1",
      approvedByName: "op",
      processedByName: "op",
      verificationNote: "apple:raw",
    } as unknown as PointChargeRequest);
    expect(r).toEqual({ id: "c1" });
  });

  it("사장님 수수료 원장 — 처리 관리자 id·이름 제거", () => {
    const rows = withoutAdminActors([
      { obligationId: "o1", decision: { adminUserId: "admin-1", adminUserName: "op", reason: "r" } },
      { obligationId: "o2", decision: null },
    ] as unknown as StoreCommissionLedgerRow[]);
    expect(rows[0]!.decision?.adminUserId).toBeNull();
    expect(rows[0]!.decision?.adminUserName).toBeNull();
    expect(rows[0]!.decision?.reason).toBe("r");
    expect(rows[1]!.decision).toBeNull();
  });

  it("Cash/Coin 공개 사유 — 관리자 조정 사유만", () => {
    expect(walletLedgerPublicReason("ADMIN_ADJUST", "admin_adjustment", { reason: " 정정 " })).toBe("정정");
    expect(walletLedgerPublicReason("ADMIN_ADJUST", "apple_iap_refund", { reason: "x", note: "내부" })).toBeNull();
    expect(walletLedgerPublicReason("TOP_UP", "admin_adjustment", { reason: "x" })).toBeNull();
  });

  it("관리자 처리자 표시 — 이름 없으면 짧은 id", () => {
    const names = new Map([["a", "운영자A"]]);
    expect(adminActorLabel(names, "a")).toBe("운영자A");
    expect(adminActorLabel(names, null)).toBeNull();
  });
});

describe("Point 잔액 사슬 — 같은 시각 +1/−1 묶음이 연달아 있을 때", () => {
  // 운영 원장 모양 그대로: 6 → (+1 → 7, −1 → 6) → (+1 → 7, −1 → 6). id 순서는 사슬과 반대.
  const rows = [
    { id: "d4", created_at: "2026-09-17T15:34:45Z", amount: -1, balance_after: 6 },
    { id: "d3", created_at: "2026-09-17T15:34:45Z", amount: 1, balance_after: 7 },
    { id: "c2", created_at: "2026-09-17T15:30:44Z", amount: 1, balance_after: 7 },
    { id: "c1", created_at: "2026-09-17T15:30:44Z", amount: -1, balance_after: 6 },
    { id: "b0", created_at: "2026-09-07T15:11:02Z", amount: 1, balance_after: 6 },
  ];

  it("앞 묶음을 사슬로 정한 잔액에서 다음 묶음을 시작한다 — 최신 잔액 6", () => {
    const view = (r: (typeof rows)[number]) => ({ createdAt: r.created_at, signed: r.amount, balanceAfter: r.balance_after });
    const ordered = orderLedgerChainDesc(rows, view);
    expect(ordered.map((r) => r.id)).toEqual(["d4", "d3", "c1", "c2", "b0"]);
    expect(pickPointLedgerChainTail(rows)?.balance_after).toBe(6);
  });
});

describe("A-14 Apple 결제 대사 자료", () => {
  const base = {
    original_transaction_id: null,
    environment: "Production",
    purchase_date: "2026-11-05T01:00:00Z",
    product_id: "dibay.point.1000",
    kind: "point",
    currency: "PHP",
    storefront: "PHL",
    price_milli: 55000,
    point_amount: 1000,
    cash_amount_minor: null,
    credited_at: "2026-11-05T01:00:05Z",
    credit_ledger_id: "led-1",
    refund_notified_at: null,
    refund_ledger_id: null,
  };

  it("결제 완료 줄만 합계 · 지급 전·환불 처리 상태를 따로 센다", () => {
    const groups = summarizeAppleIapRecon([
      { ...base, transaction_id: "t1", status: "credited", refund_status: "none" },
      { ...base, transaction_id: "t2", status: "credited", refund_status: "recovered", refund_notified_at: "2026-11-06T00:00:00Z" },
      { ...base, transaction_id: "t3", status: "received", refund_status: "none", credited_at: null, credit_ledger_id: null },
      { ...base, transaction_id: null, status: "prepared", refund_status: "none" },
      { ...base, transaction_id: "t4", status: "user_cancelled", refund_status: "none" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      purchases: 3,
      customerPriceMilli: 165000,
      credited: 2,
      creditedPoint: 2000,
      notCredited: 1,
      refunds: 1,
      refundRecovered: 1,
    });
  });

  it("CSV — 결제 완료 거래 1건 = 1줄, 고객 결제가는 통화 단위", () => {
    const csv = appleIapReconCsv([
      { ...base, transaction_id: "t1", status: "credited", refund_status: "none" },
      { ...base, transaction_id: null, status: "prepared", refund_status: "none" },
    ]).trim().split("\n");
    expect(csv).toHaveLength(2);
    expect(csv[1]).toContain("t1,,Production,2026-11-05 09:00:00,dibay.point.1000,point,PHL,PHP,55.00,credited");
  });

  it("기간은 PHT 하루 경계 · 잘못된 값은 거부", () => {
    expect(phtDayRange("2026-11-01", "2026-11-30")).toEqual({
      fromIso: "2026-10-31T16:00:00.000Z",
      toIso: "2026-11-30T16:00:00.000Z",
    });
    expect(phtDayRange("2026-11-30", "2026-11-01")).toBeNull();
    expect(phtDayRange("bad", "2026-11-01")).toBeNull();
  });
});

describe("화면 정리", () => {
  it("M-9 — 0P 광고 확정 감사 줄은 숨김, 금액 있는 줄은 표시", () => {
    expect(isHiddenCaptureAuditRow({ entry_type: "ad_charge", related_type: "trade_post_ad", related_id: "finalize:1", amount: 0 })).toBe(true);
    expect(isHiddenCaptureAuditRow({ entry_type: "ad_charge", related_type: "trade_post_ad", related_id: "finalize:1", amount: -50 })).toBe(false);
    expect(isHiddenCaptureAuditRow({ entry_type: "ad_charge", related_type: "trade_post_ad", related_id: "p1", amount: 0 })).toBe(false);
  });

  it("O-9 — 없는 정산 탭은 거래 내역으로", () => {
    expect(normalizeOwnerFinanceSection("withdraw")).toBe("withdraw");
    expect(normalizeOwnerFinanceSection("nope")).toBe("transactions");
    expect(normalizeOwnerFinanceSection(null)).toBe("transactions");
  });

  it("원장 종류 이름 — 금융 화면과 수수료 원장이 같은 말", () => {
    for (const [kind, label] of Object.entries(BUSINESS_CASH_LEDGER_KIND_LABEL)) {
      expect({ kind, ko: label.ko, en: label.en }).toEqual({
        kind,
        ko: financeTypeLabel(kind, true),
        en: financeTypeLabel(kind, false),
      });
    }
  });

  it("필터 이름 중복 없음 · 구 반려 코드도 이름이 있다", () => {
    const labels = financeTypeFilterOptions(true).map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(financeTypeLabel("WITHDRAWAL_REJECT", true)).toBe("출금 반려 (Coin 환원)");
  });

  it("A-10 감사 로그 금융 작업 이름", () => {
    expect(financeAuditActionLabel("approve", "point_charge_request", true)).toBe("Point 입금 확인 · 충전 완료");
    expect(financeAuditActionLabel("business_cash.admin_adjust", "business_cash_account", false)).toBe("Store Cash adjustment");
    expect(financeAuditActionLabel("approve", "feed_ad_request", true)).toBeNull();
    expect(financeAuditTargetLabel("coin_withdrawal_request", true)).toBe("Coin 출금 신청");
  });
});

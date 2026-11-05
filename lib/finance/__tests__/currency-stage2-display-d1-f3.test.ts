/**
 * 2단계 표시·동작 결함 (설계 `docs/audit/currency-remaining-defects-design-2026-11-04.md` §2·§5)
 * D-1·D-2·D-3·D-10·D-11·D-14·D-15·F-2·F-3 — 순수 함수는 동작으로, 화면 배선은 소스로 검사.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commissionOwnerRefundedLabel } from "@/lib/stores/commission/store-commission-display-labels";
import { formatAdminPointBucketLine } from "@/lib/admin/points/admin-point-bucket-line";
import {
  POINT_PROMOTION_ORDER_STATUS_KEYS,
  pointChargeStatusLabel,
  pointPromotionOrderStatusText,
} from "@/lib/points/point-label-i18n";
import type { PointChargeRequestStatus } from "@/lib/types/point";
import { communityAuditTargetHref } from "@/components/admin/community/audit/community-audit-labels";

const ROOT = path.resolve(__dirname, "../../..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const zero = { charge: 0, grant: 0, refund: 0, use: 0, reclaim: 0, hold: 0, rows: 1 };

describe("F-3 사장님 「수수료 환급」 칩 = 실제 처리", () => {
  it("캐시 환급만 / 미납 취소만 / 둘 다", () => {
    expect(commissionOwnerRefundedLabel({ cashRefundMinor: 500, outstandingCancelMinor: 0 }, "ko")).toBe("Cash 환급");
    expect(commissionOwnerRefundedLabel({ cashRefundMinor: 0, outstandingCancelMinor: 300 }, "ko")).toBe("미납 취소");
    expect(commissionOwnerRefundedLabel({ cashRefundMinor: 500, outstandingCancelMinor: 300 }, "ko")).toBe("Cash 환급·미납 취소");
    expect(commissionOwnerRefundedLabel({ cashRefundMinor: 500, outstandingCancelMinor: 0 }, "en")).toBe("Cash refunded");
  });
  it("금액 정보가 없으면 null → 공용 이름 유지", () => {
    expect(commissionOwnerRefundedLabel(null, "ko")).toBeNull();
    expect(commissionOwnerRefundedLabel({ cashRefundMinor: 0, outstandingCancelMinor: 0 }, "ko")).toBeNull();
  });
  it("사장님 분기에만 쓰고 관리자 이름은 그대로", () => {
    const t = src("components/stores/commission/StoreCommissionLedgerTable.tsx");
    expect(t).toMatch(/if \(audience !== "owner" \|\| r\.state !== "refunded"\) return null;/);
    expect(src("lib/stores/commission/store-commission-contract.ts")).toMatch(/refunded: \{ ko: "수수료 환급", en: "Fee refunded" \}/);
  });
});

describe("D-14 ③ 보류 칸 — 순변화 음수는 「보류 해제」", () => {
  it("관리자 한 줄: 양수 = 보류 중 −, 음수 = 보류 해제 +", () => {
    const fmt = (n: number) => String(n);
    expect(formatAdminPointBucketLine({ ...zero, hold: 200 }, fmt)).toBe("보류 중 −200 P");
    expect(formatAdminPointBucketLine({ ...zero, hold: -300 }, fmt)).toBe("보류 해제 +300 P");
  });
  it("회원 카드도 같은 규칙", () => {
    const c = src("components/points/PointPeriodSummary.tsx");
    expect(c).toMatch(/hold < 0\s*\?\s*pick\(lang, "보류 해제", "Hold released"\)/);
  });
});

describe("D-14 ①② 회원 포인트 화면", () => {
  const page = src("app/(main)/mypage/points/page.tsx");
  it("대기 거르기는 기간이 미완성이어도 조회", () => {
    expect(page).toMatch(/if \(!valid && balanceLoadedRef\.current && !pendingOnly\)/);
    expect(page).toMatch(/chargeStatus: pendingOnly \? "pending" : null/);
  });
  it("충전 합계의 상태 합계 칸 이름 = 「처리 대기(보류 포함)」 (회원만)", () => {
    expect(page).toMatch(/<PointChargePeriodSummaryLine summary=\{chargeSummary\} lang=\{lang\} audience="member" \/>/);
    const c = src("components/points/PointPeriodSummary.tsx");
    expect(c).toMatch(/"처리 대기\(보류 포함\)", "Awaiting processing \(incl\. on hold\)"/);
  });
});

describe("D-2 상위노출·입금 상태 이름", () => {
  it("공용 표 — paused 포함, 모르는 값은 원문", () => {
    const t = (k: string) => `T:${k}`;
    expect(pointPromotionOrderStatusText(t as never, "paused")).toBe(`T:${POINT_PROMOTION_ORDER_STATUS_KEYS.paused}`);
    expect(pointPromotionOrderStatusText(t as never, "ended")).toBe("T:point_status_ended");
    expect(pointPromotionOrderStatusText(t as never, "weird")).toBe("weird");
  });
  it("입금 상태 — 모르는 값은 키 문자열이 아니라 원문", () => {
    expect(pointChargeStatusLabel("weird" as PointChargeRequestStatus)).toBe("weird");
    expect(pointChargeStatusLabel("approved")).not.toBe("approved");
  });
  it("상세 시트가 영문 코드를 그대로 쓰지 않음", () => {
    const s = src("components/points/PointFinancialHistoryList.tsx");
    expect(s).not.toMatch(/\{item\.promotion\.orderStatus\}/);
    expect(s).not.toMatch(/\|\| item\.deposit\.requestStatus\}/);
  });
});

describe("D-1·D-3·D-10·D-11·D-15·F-2 배선", () => {
  it("D-1 결정 창 머리글 = 주문 상태 줄", () => {
    const s = src("components/admin/stores/AdminStoreCommissionLedgerPage.tsx");
    expect(s).toMatch(/commissionOrderStatusLine\(modal\.row, lang\)/);
    expect(s).not.toMatch(/\$\{modal\.row\.orderStatus\}/);
  });
  it("D-11 ② 카드 시작 시 loading · 요청 번호", () => {
    const s = src("components/admin/stores/AdminStoreCommissionLedgerPage.tsx");
    expect(s).toMatch(/const seq = \+\+headlineSeqRef\.current;/);
    expect(s).toMatch(/setHeadlineStatus\(\{ ledger: "loading", integrity: "loading" \}\);/);
  });
  it("D-11 ① 충전 목록 실패 → 상태 카드 비움", () => {
    const s = src("components/admin/points/AdminPointChargeListPage.tsx");
    expect(s.match(/setStatusCounts\(null\);/g)?.length).toBe(2);
    expect(s.match(/setWaitingConfirmAllTime\(null\);/g)?.length).toBe(2);
  });
  it("D-3 사장님 영어 문구", () => {
    expect(src("components/stores/commission/StoreCommissionLedgerTable.tsx")).toContain(
      `"History can't be edited; corrections are kept as records."`
    );
    expect(src("lib/i18n/catalog/store-commerce-ui.ts")).toContain(
      `store_owner_point_err_platform_unavailable: "Past store activity is read-only.",`
    );
  });
  it("D-10 기간 이름 · 요청 번호", () => {
    const s = src("components/finance/AdminFinanceStoreViews.tsx");
    expect(s).not.toMatch(/기간 \$\{periodKey\}/);
    expect(s).toMatch(/if \(seq !== loadSeqRef\.current\) return;/);
  });
  it("D-15 시각 머리글 (PHT) · 커뮤니티 링크 period=all · 거래 빈 문구 = 적용 기간", () => {
    for (const f of [
      "components/finance/FinanceTransactionList.tsx",
      "components/finance/FinanceTransactionDetail.tsx",
      "components/finance/AdminFinanceAdsView.tsx",
      "components/finance/AdminFinanceConversionsView.tsx",
    ]) {
      expect(src(f)).toContain(`{ko ? "일시 (PHT)" : "When (PHT)"}`);
    }
    expect(communityAuditTargetHref("user_points", "u1")).toBe("/admin/community/points?userId=u1&period=all");
    expect(src("components/admin/community/members/AdminCommunityMemberDetailPage.tsx")).toMatch(
      /\/admin\/community\/points\?userId=\$\{encodeURIComponent\(userId\)\}&period=all/
    );
    expect(src("components/admin/trade/points/TradePointsPage.tsx")).not.toContain("최근 30일 포인트 내역이 없습니다.");
  });
});

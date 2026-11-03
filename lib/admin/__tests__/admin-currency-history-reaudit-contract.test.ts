/**
 * 재감사 2026-11-03 (R5-a · R6-g · R8-g · R6 날짜) — 관리자 Point·Cash·Coin 신청 화면 계약.
 * 화면 동작은 실기로 확인한다. 여기서는 회귀 방지용으로 코드 계약만 고정한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("R5-a — 늦게 온 응답 무시", () => {
  it("Cash 충전 대기열: 요청 번호 + 조건이 바뀌면 불러오는 중", () => {
    const src = read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx");
    expect(src).toMatch(/const seq = \+\+loadSeqRef\.current/);
    expect(src).toMatch(/if \(seq !== loadSeqRef\.current\) return;/);
    expect(src).toMatch(/loadedKey !== conditionKey/);
  });

  it("회원 포인트 관리: 기간 변경·쪽 이동 모두 세대 확인 (C-2: 더 보기 → 쪽 이동)", () => {
    const src = read("components/admin/users/AdminUserPointsSection.tsx");
    expect(src).toMatch(/genRef\.current \+= 1/);
    expect(src).toMatch(/if \(stale\(\)\) return;/);
    expect(src).toMatch(/const stale = \(\) => gen !== genRef\.current \|\| seq !== historySeqRef\.current;/);
    expect(src).toMatch(/const stale = \(\) => gen !== genRef\.current \|\| seq !== chargeSeqRef\.current;/);
    expect(src).toMatch(/data-admin-user-points-loading/);
    expect(src).toContain("<AdminPagination");
    expect(src).not.toContain("point_fin_load_more");
  });
});

describe("R6-g — 반려 사유를 목록 줄에", () => {
  it.each([
    ["components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx", "data-admin-cash-charge-reject-reason"],
    ["components/admin/points/AdminPointChargeInlineActions.tsx", "data-point-charge-reject-reason"],
    ["components/admin/points/AdminPointChargeDetailPage.tsx", "data-point-charge-reject-reason"],
    ["components/admin/users/AdminUserPointsSection.tsx", "data-admin-user-point-charge-reject-reason"],
    ["components/admin/community/charges/AdminCommunityPointChargesPage.tsx", "data-community-charge-reject-reason"],
  ])("%s", (rel, marker) => {
    const src = read(rel);
    expect(src).toContain(marker);
    expect(src).toMatch(/반려 사유/);
  });

  it("Cash 충전 반려 사유는 접힌 기술 정보 안에 두지 않는다", () => {
    const src = read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx");
    expect(src).not.toMatch(/reason \{r\.reject_reason\}/);
  });
});

describe("R8-g — 목록 실패 시 기간 합계 지움", () => {
  it("Cash 충전 대기열", () => {
    const src = read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx");
    const failBlock = src.slice(src.indexOf("if (!res.ok || !json.ok) {"), src.indexOf("let next = json.requests"));
    expect(failBlock).toMatch(/setPeriodSummary\(null\)/);
  });

  it("Coin 출금: 조회 중·실패 시 합계 숨김", () => {
    expect(read("components/admin/finance/AdminCoinWithdrawalsPanel.tsx")).toMatch(
      /list\.loading \|\| list\.error \? null/
    );
  });
});

describe("R6 — 신청·처리 시각 (연도 포함 PHT)", () => {
  it("Cash·Coin 표 머리글에 (PHT)", () => {
    for (const rel of [
      "components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx",
      "components/admin/finance/AdminCoinWithdrawalsPanel.tsx",
    ]) {
      const src = read(rel);
      expect(src).toMatch(/신청 시각 \(PHT\)/);
      expect(src).toMatch(/처리 시각 \(PHT\)/);
    }
  });

  it("커뮤니티 충전 목록은 상대 시각 대신 절대 시각 + 처리 시각", () => {
    const src = read("components/admin/community/charges/AdminCommunityPointChargesPage.tsx");
    expect(src).toMatch(/<CommunityTimeCell iso=\{r\.requestedAt\} absolute \/>/);
    expect(src).toMatch(/data-community-charge-processed-at/);
  });

  it("매장 재무 패널 Cash 충전 줄: 신청·처리 시각", () => {
    const src = read("components/admin/finance/AdminStoreFinancePanels.tsx");
    expect(src).toMatch(/formatAdminManilaDateTime\(r\.decided_at\)/);
  });
});

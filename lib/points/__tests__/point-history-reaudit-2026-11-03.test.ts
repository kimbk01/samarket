/**
 * 회원 포인트 내역 재감사 수정 (2026-11-03 · docs/audit/currency-history-full-reaudit-2026-11-03.md §2–3)
 * R3-g 보류 칸 · R3-h 1,000줄 나눠 읽기 · R2 같은 시각 사슬 순서·쪽 자르기 · R6 쪽 이동·주소·대기·취소 시각 ·
 * R8-b 「상위노출」 번역 키 · R8-c 0P 승인 확정 줄 숨김 · R4 직접 기간 확인.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { orderLedgerChainDesc } from "@/lib/finance/ledger-chain-order";
import {
  computePointPeriodSummary,
  isHiddenCaptureAuditRow,
  loadCapturedPointHoldKeys,
  parsePointChargeStatusFilter,
  pointChainView,
  pointHoldKey,
  POINT_CHARGE_PENDING_STATUSES,
  POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR,
  POINT_PERIOD_SUMMARY_ROW_CAP,
  readAllRowsInPages,
  type PointPeriodLedgerRow,
} from "@/lib/points/point-period-history";
import {
  pointLedgerChainWindow,
  promotionOrderIdOfLedger,
  slicePointLedgerChainPage,
} from "@/lib/points/project-point-financial-history";
import { pointFinancialCategoryTitle, promotionProductDisplayLabel } from "@/lib/points/point-financial-history";
import {
  checkPointsPeriod,
  clampPointsPage,
  isValidPointsDay,
  parsePointsScreenUrlState,
  writePointsScreenUrlState,
} from "@/lib/points/points-screen-url-state";
import { formatPointChargePht, pointChargeProcessedStamp } from "@/lib/points/point-charge-request-display";

const P = { period: "this_month" as const, fromDay: null, toDay: null, fromIso: null, toIso: null };
const read = (f: string) => readFileSync(f, "utf8");
const ORDER = "11111111-1111-4111-8111-111111111111";

describe("R3-g 보류 중 칸 — 사용·환불 이중 계산 없음", () => {
  it("보류 → 해제: 사용·환불 0, 보류 중 0, 합계 맞음", () => {
    // 시작 1000 → 보류 −300(700) → 해제 +300(1000)
    const rows: PointPeriodLedgerRow[] = [
      { id: "2", amount: 300, balance_after: 1000, entry_type: "ad_hold_release", related_type: "promotion_order", related_id: "release:h1", created_at: "2026-11-02T00:00:00Z" },
      { id: "1", amount: -300, balance_after: 700, entry_type: "ad_hold", related_type: "promotion_order", related_id: `hold:${ORDER}`, created_at: "2026-11-01T00:00:00Z" },
    ];
    const s = computePointPeriodSummary({ period: P, openingBalance: 1000, rows });
    expect(s).toMatchObject({ use: 0, refund: 0, hold: 0, totalDebit: 0, totalCredit: 0, closingBalance: 1000, consistent: true });
  });

  it("보류 → 승인 확정: 보류 줄이 「사용」 1번 (확정 0P 감사 줄은 칸 없음), 보류 중 0", () => {
    const rows: PointPeriodLedgerRow[] = [
      { id: "2", amount: 0, balance_after: 700, entry_type: "ad_purchase", related_type: "promotion_order", related_id: `capture:${ORDER}`, created_at: "2026-11-02T00:00:00Z" },
      { id: "1", amount: -300, balance_after: 700, entry_type: "ad_hold", related_type: "promotion_order", related_id: `hold:${ORDER}`, created_at: "2026-11-01T00:00:00Z" },
    ];
    const s = computePointPeriodSummary({
      period: P,
      openingBalance: 1000,
      rows,
      capturedHoldKeys: new Set([`promotion_order:${ORDER}`]),
    });
    expect(s).toMatchObject({ use: 300, hold: 0, refund: 0, totalDebit: 300, closingBalance: 700, consistent: true });
  });

  it("아직 보류 중: 보류 중 칸 +300 (출금 쪽), 합계 맞음 · 지난 기간 보류를 이번에 해제하면 −", () => {
    const held = computePointPeriodSummary({
      period: P,
      openingBalance: 1000,
      rows: [{ id: "1", amount: -300, balance_after: 700, entry_type: "ad_hold", related_type: "feed_ad_request", related_id: "hold:r1", created_at: "2026-11-01T00:00:00Z" }],
    });
    expect(held).toMatchObject({ use: 0, hold: 300, totalDebit: 300, consistent: true });
    const releasedLater = computePointPeriodSummary({
      period: P,
      openingBalance: 700,
      rows: [{ id: "2", amount: 300, balance_after: 1000, entry_type: "ad_hold_release", related_type: "feed_ad_request", related_id: "release:h9", created_at: "2026-12-01T00:00:00Z" }],
    });
    expect(releasedLater).toMatchObject({ refund: 0, hold: -300, totalCredit: 0, totalDebit: -300, closingBalance: 1000, consistent: true });
  });

  it("보류 열쇠 = related_type:대상 id (hold: 접두 제거), 보류 줄이 아니면 null", () => {
    expect(pointHoldKey({ entry_type: "ad_hold", related_type: "trade_post_ad", related_id: "hold:t1" })).toBe("trade_post_ad:t1");
    expect(pointHoldKey({ entry_type: "ad_hold_release", related_type: "trade_post_ad", related_id: "release:x" })).toBeNull();
  });

  it("확정 상태 조회 — captured·charged 만 확정, 표마다 해당 열로 조회", async () => {
    const calls: Array<{ table: string; column: string; ids: string[] }> = [];
    const data: Record<string, Array<Record<string, string>>> = {
      promotion_point_holds: [{ promotion_order_id: ORDER, status: "captured" }],
      feed_ad_point_holds: [{ request_id: "r1", status: "held" }],
      trade_ad_point_holds: [{ trade_post_ad_id: "t1", status: "charged" }],
    };
    const sb = {
      from: (table: string) => ({
        select: () => ({
          in: async (column: string, ids: string[]) => {
            calls.push({ table, column, ids });
            return { data: data[table], error: null };
          },
        }),
      }),
    };
    const res = await loadCapturedPointHoldKeys(sb as never, [
      { amount: -1, balance_after: 0, entry_type: "ad_hold", related_type: "promotion_order", related_id: `hold:${ORDER}` },
      { amount: -1, balance_after: 0, entry_type: "ad_hold", related_type: "feed_ad_request", related_id: "hold:r1" },
      { amount: -1, balance_after: 0, entry_type: "ad_hold", related_type: "trade_post_ad", related_id: "hold:t1" },
    ]);
    expect(res.ok && [...res.keys].sort()).toEqual([`promotion_order:${ORDER}`, "trade_post_ad:t1"]);
    expect(calls.map((c) => `${c.table}.${c.column}`).sort()).toEqual([
      "feed_ad_point_holds.request_id",
      "promotion_point_holds.promotion_order_id",
      "trade_ad_point_holds.trade_post_ad_id",
    ]);
  });
});

describe("R3-h 1,000줄씩 끝까지 읽기", () => {
  function fakeBuilder(total: number) {
    const ranges: Array<[number, number]> = [];
    const build = (withCount: boolean) => ({
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        const n = Math.max(0, Math.min(to, total - 1) - from + 1);
        return { data: Array.from({ length: n }, (_, i) => ({ i: from + i })), error: null, count: withCount ? total : null };
      },
    });
    return { build, ranges };
  }

  it("2,500줄 → 1,000·1,000·500 세 번, 전부 합산 · 정확한 건수", async () => {
    const f = fakeBuilder(2500);
    const r = await readAllRowsInPages<{ i: number }>(f.build);
    expect(r.ok && r.rows.length).toBe(2500);
    expect(r.ok && r.count).toBe(2500);
    expect(f.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("상한을 넘으면 상한까지만 읽고 capped (문구 숫자 = 50,000)", async () => {
    const f = fakeBuilder(3500);
    const r = await readAllRowsInPages<PointPeriodLedgerRow>(f.build, 2000);
    expect(r.ok && r.rows.length).toBe(2000);
    const s = computePointPeriodSummary({ period: P, openingBalance: 0, rows: r.ok ? r.rows : [], rowCount: r.ok ? r.count : 0 });
    expect(s.capped).toBe(true);
    expect(POINT_PERIOD_SUMMARY_ROW_CAP).toBe(50_000);
    expect(read("lib/points/point-period-history.ts")).not.toContain(".limit(POINT_PERIOD_SUMMARY_ROW_CAP)");
    expect(read("components/points/PointPeriodSummary.tsx")).not.toContain("5,000");
  });
});

describe("R2 같은 시각 줄 사슬 순서 · 쪽 경계 일관", () => {
  /** 같은 시각 3줄 묶음이 쪽 경계(20)에 걸리게 만든 원장 — id 순서는 사슬과 반대 */
  function ledger(): PointPeriodLedgerRow[] {
    const asc: PointPeriodLedgerRow[] = [];
    let bal = 0;
    for (let k = 0; k < 15; k += 1) {
      const at = `2026-11-01T${String(k).padStart(2, "0")}:00:00Z`;
      const n = k % 2 === 0 ? 3 : 1;
      for (let j = 0; j < n; j += 1) {
        const amount = (j + 1) * 10;
        bal += amount;
        // 같은 시각 안에서 id 는 사슬 순서와 반대(먼저 쓴 줄이 큰 id)
        asc.push({ id: `${String(k).padStart(2, "0")}-${9 - j}`, amount, balance_after: bal, created_at: at });
      }
    }
    // DB 정렬 = created_at desc, id desc
    return asc.sort((a, b) =>
      a.created_at === b.created_at ? String(b.id).localeCompare(String(a.id)) : String(b.created_at).localeCompare(String(a.created_at))
    );
  }

  it("쪽마다 [offset−8, offset+20+8) 창을 정렬해 자른 결과를 이으면 전체 사슬 순서와 같다", () => {
    const db = ledger();
    const full = orderLedgerChainDesc(db, pointChainView);
    // 사슬: 최신 줄의 직전 잔액 = 다음 줄 잔액
    for (let i = 0; i + 1 < full.length; i += 1) {
      expect(Number(full[i]!.balance_after) - Number(full[i]!.amount)).toBe(Number(full[i + 1]!.balance_after));
    }
    const pages: PointPeriodLedgerRow[] = [];
    for (let offset = 0; offset < db.length; offset += 20) {
      const w = pointLedgerChainWindow(offset, 20);
      pages.push(...slicePointLedgerChainPage(db.slice(w.start, w.end + 1), w.start, offset, 20));
    }
    expect(pages.map((r) => r.id)).toEqual(full.map((r) => r.id));
  });

  it("창 = 앞뒤 8줄 여유 (첫 쪽은 0부터)", () => {
    expect(pointLedgerChainWindow(0, 20)).toEqual({ start: 0, end: 27 });
    expect(pointLedgerChainWindow(40, 20)).toEqual({ start: 32, end: 67 });
  });
});

describe("R8-b·R8-c 문구 · 0P 승인 확정 줄", () => {
  it("상위노출 상품 문구 — 「홍보」 없음", () => {
    expect(promotionProductDisplayLabel(null, 7).ko).toBe("상위노출 7일");
    expect(promotionProductDisplayLabel("trade_promote_14", 0).ko).toBe("상위노출 14일");
    expect(pointFinancialCategoryTitle("PROMOTION").fallbackTitleKo).toBe("상위노출");
    for (const f of [
      "lib/points/point-financial-history.ts",
      "lib/points/project-point-financial-history.ts",
      "components/points/PointFinancialHistoryList.tsx",
      "lib/i18n/catalog/points-ui.ts",
    ]) {
      expect(read(f), f).not.toMatch(/일 홍보|게시물 홍보/);
    }
  });

  it("줄 제목·상세 제목은 번역 키(safeT)", () => {
    const src = read("components/points/PointFinancialHistoryList.tsx");
    expect(src).toContain("safeT(item.titleKey as MessageKey");
    expect(src).not.toContain('language === "en" ? item.fallbackTitleEn : item.fallbackTitleKo');
  });

  it("커뮤니티·거래 상위노출 승인 0P 줄 — 피드 광고와 같이 숨김 (DB 조건·표시 같은 규칙)", () => {
    expect(isHiddenCaptureAuditRow({ entry_type: "ad_purchase", related_type: "promotion_order", related_id: `capture:${ORDER}`, amount: 0 })).toBe(true);
    expect(isHiddenCaptureAuditRow({ entry_type: "ad_purchase", related_type: "feed_ad_request", related_id: "capture:r1", amount: 0 })).toBe(true);
    // 돈이 움직인 줄은 숨기지 않는다
    expect(isHiddenCaptureAuditRow({ entry_type: "ad_purchase", related_type: "promotion_order", related_id: `capture:${ORDER}`, amount: -300 })).toBe(false);
    expect(isHiddenCaptureAuditRow({ entry_type: "spend", related_type: "promotion_order", related_id: ORDER, amount: -300 })).toBe(false);
    expect(POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR).toContain("related_type.not.in.(feed_ad_request,promotion_order)");
    expect(POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR).toContain("amount.neq.0");
  });

  it("상위노출 줄 주문 id — hold:/capture: 접두 제거, release: 는 보류 행으로, 그 밖은 uuid 만", () => {
    expect(promotionOrderIdOfLedger(`hold:${ORDER}`)).toBe(ORDER);
    expect(promotionOrderIdOfLedger(`capture:${ORDER}`)).toBe(ORDER);
    expect(promotionOrderIdOfLedger(ORDER)).toBe(ORDER);
    expect(promotionOrderIdOfLedger("release:h1", new Map([["h1", ORDER]]))).toBe(ORDER);
    expect(promotionOrderIdOfLedger("release:h1")).toBeNull();
    expect(promotionOrderIdOfLedger("not-a-uuid")).toBeNull();
  });
});

describe("R6 쪽 이동 · 주소 · 대기 · 취소 시각 / R4 직접 기간", () => {
  it("주소 상태 읽기·쓰기 — 기본값 생략, 다른 키(from=customer-center·tab) 보존", () => {
    const st = parsePointsScreenUrlState(new URLSearchParams("from=customer-center&tab=charges&period=custom&pfrom=2026-10-01&pto=2026-10-31&page=3&cpage=2&cstatus=pending"));
    expect(st).toEqual({
      period: { period: "custom", fromDay: "2026-10-01", toDay: "2026-10-31" },
      histPage: 2,
      chargePage: 1,
      chargeStatus: "pending",
    });
    expect(writePointsScreenUrlState("?from=customer-center&tab=charges&page=9", { ...st, histPage: 0, chargePage: 0, chargeStatus: null, period: { period: "this_month" } })).toBe(
      "from=customer-center&tab=charges"
    );
    expect(writePointsScreenUrlState("", st)).toBe("period=custom&pfrom=2026-10-01&pto=2026-10-31&page=3&cpage=2&cstatus=pending");
    expect(parsePointsScreenUrlState(new URLSearchParams("period=bogus&page=-2"))).toMatchObject({ period: { period: "this_month" }, histPage: 0 });
  });

  it("직접 기간 — 두 날짜 전에는 조회 안 함, 시작 > 종료 안내, 없는 날짜 거름", () => {
    expect(checkPointsPeriod({ period: "custom", fromDay: "2026-10-01", toDay: "" })).toBe("incomplete");
    expect(checkPointsPeriod({ period: "custom", fromDay: "2026-11-02", toDay: "2026-11-01" })).toBe("inverted");
    expect(checkPointsPeriod({ period: "custom", fromDay: "2026-11-01", toDay: "2026-11-01" })).toBe("ok");
    expect(checkPointsPeriod({ period: "this_week" })).toBe("ok");
    expect(isValidPointsDay("2026-02-31")).toBe(false);
    const page = read("app/(main)/mypage/points/page.tsx");
    expect(page).toContain("시작일이 종료일보다 늦습니다");
    expect(page).not.toContain("manilaTodayDay");
  });

  it("쪽 위치 유지 — 건수가 줄면 마지막 쪽으로", () => {
    expect(clampPointsPage(3, 61, 20)).toBe(3);
    expect(clampPointsPage(3, 40, 20)).toBe(1);
    expect(clampPointsPage(2, 0, 20)).toBe(0);
  });

  it("화면 — 「더 보기」 대신 LedgerPager(20건), 기간·쪽 주소 저장, 조용한 재조회는 지금 쪽, 대기 n → 대기 목록", () => {
    const page = read("app/(main)/mypage/points/page.tsx");
    expect(page).not.toContain("MyListPager");
    expect(page).toContain("LedgerPager");
    expect(page.match(/<LedgerPager/g)?.length).toBe(2);
    expect(page).toContain("writePointsScreenUrlState(window.location.search");
    expect(page).toContain("window.history.replaceState");
    expect(page).toContain("onPress={openPendingCharges}");
    expect(page).toContain("requestIdRef.current !== reqId");
    expect(page).toContain("useRefetchOnPageShowRestore(refetchOnRestore");
    expect(read("lib/points/me-points-client.ts")).toContain("ME_POINTS_PAGE_SIZE = 20");
    expect(read("app/api/me/points/route.ts")).toContain("loadPointFinancialHistoryChainPage");
  });

  it("대기 숫자와 대기 목록은 같은 조건 (기간 무관)", () => {
    expect([...POINT_CHARGE_PENDING_STATUSES]).toEqual(["pending", "waiting_confirm"]);
    expect(parsePointChargeStatusFilter("pending")).toBe("pending");
    expect(parsePointChargeStatusFilter("approved")).toBeNull();
    const src = read("lib/points/point-period-history.ts");
    expect(src.match(/\[\.\.\.POINT_CHARGE_PENDING_STATUSES\]/g)?.length).toBe(2);
  });

  it("직접 취소는 처리 시각을 저장하고, 목록은 「취소 YYYY-MM-DD HH:mm (PHT)」 (예전 줄은 updated_at)", () => {
    expect(read("app/api/me/points/charge/[id]/cancel/route.ts")).toContain("processed_at: now");
    const base = { approvedAt: undefined, updatedAt: "2026-11-03T01:00:00Z" };
    expect(pointChargeProcessedStamp({ ...base, requestStatus: "cancelled", processedAt: "2026-11-03T05:12:00Z" })).toEqual({ kind: "cancelled", at: "2026-11-03T05:12:00Z" });
    expect(pointChargeProcessedStamp({ ...base, requestStatus: "cancelled", processedAt: undefined })).toEqual({ kind: "cancelled", at: "2026-11-03T01:00:00Z" });
    expect(pointChargeProcessedStamp({ ...base, requestStatus: "pending", processedAt: undefined })).toBeNull();
    expect(formatPointChargePht("2026-11-03T05:12:00Z")).toBe("2026-11-03 13:12 (PHT)");
  });

  it("충전 신청 기간 합계는 「신청일 기준」", () => {
    expect(read("components/points/PointPeriodSummary.tsx")).toContain("신청일 기준");
  });
});

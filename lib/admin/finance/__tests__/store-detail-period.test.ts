/**
 * R4-d (재감사 2026-11-03) — 관리자 매장 재무 상세: 합계·목록 같은 기간 · 머리글 날짜 · 배타 끝 → 포함 끝.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatStoreStatementPeriodLabel,
  inclusiveManilaEndDay,
  statementInclusiveDays,
  storeStatementQueryParams,
} from "@/lib/admin/finance/store-detail-period";

describe("storeStatementQueryParams", () => {
  const now = new Date("2026-11-03T05:00:00.000Z"); // 13:00 PHT 2026-11-03

  it("from/to 가 없으면 프리셋 (기본 30d)", () => {
    expect(storeStatementQueryParams({ now })).toEqual({ period: "30d" });
    expect(storeStatementQueryParams({ period: "7d", now })).toEqual({ period: "7d" });
  });

  it("from/to 둘 다 있으면 합계도 그 기간(custom)", () => {
    expect(storeStatementQueryParams({ period: "30d", from: "2026-10-01", to: "2026-10-31", now })).toEqual({
      period: "custom",
      fromDay: "2026-10-01",
      toDay: "2026-10-31",
    });
  });

  it("시작 > 종료면 바꾼다 · 없는 날짜는 무시", () => {
    expect(storeStatementQueryParams({ from: "2026-10-31", to: "2026-10-01", now })).toEqual({
      period: "custom",
      fromDay: "2026-10-01",
      toDay: "2026-10-31",
    });
    expect(storeStatementQueryParams({ from: "2026-02-31", to: null, now })).toEqual({ period: "30d" });
  });

  it("한쪽만: from → 오늘(PHT)까지 · to → 30일 창", () => {
    expect(storeStatementQueryParams({ from: "2026-10-20", now })).toEqual({
      period: "custom",
      fromDay: "2026-10-20",
      toDay: "2026-11-03",
    });
    expect(storeStatementQueryParams({ to: "2026-10-31", now })).toEqual({
      period: "custom",
      fromDay: "2026-10-02",
      toDay: "2026-10-31",
    });
  });
});

describe("inclusive end (off-by-one)", () => {
  it("statement.toIso(다음날 00:00 PHT, 배타) → 포함 끝 날짜는 그 전날", () => {
    // 2026-11-03 00:00 PHT = 2026-11-02T16:00Z → 포함 끝 = 2026-11-02
    expect(inclusiveManilaEndDay("2026-11-02T16:00:00.000Z")).toBe("2026-11-02");
    expect(inclusiveManilaEndDay(null)).toBeNull();
  });

  it("응답 period.fromDay/toDay 우선, 없으면 fromIso/toIso 에서 계산", () => {
    expect(
      statementInclusiveDays({
        period: { fromDay: "2026-10-05", toDay: "2026-11-03" },
        fromIso: "x",
        toIso: "y",
      })
    ).toEqual({ fromDay: "2026-10-05", toDay: "2026-11-03" });
    expect(
      statementInclusiveDays({ fromIso: "2026-10-04T16:00:00.000Z", toIso: "2026-11-03T16:00:00.000Z" })
    ).toEqual({ fromDay: "2026-10-05", toDay: "2026-11-03" });
  });

  it("머리글 = 「YYYY-MM-DD ~ YYYY-MM-DD (PHT)」", () => {
    expect(formatStoreStatementPeriodLabel({ fromDay: "2026-10-05", toDay: "2026-11-03" })).toBe(
      "2026-10-05 ~ 2026-11-03 (PHT)"
    );
    expect(formatStoreStatementPeriodLabel(null)).toBe("—");
  });
});

describe("매장 상세 화면 계약", () => {
  const src = readFileSync(path.join(process.cwd(), "components/finance/AdminFinanceStoreViews.tsx"), "utf8");

  it("머리글에 「기간: 30d」 대신 날짜 범위", () => {
    expect(src).not.toMatch(/\{ko \? "기간" : "Period"\}: \{period\}/);
    expect(src).toMatch(/formatStoreStatementPeriodLabel\(periodDays\)/);
  });

  it("목록은 합계 기간이 정해진 뒤에만 조회 · 요청 번호로 늦은 응답 무시", () => {
    expect(src).toMatch(/if \(!periodDays\) \{/);
    expect(src).toMatch(/seq !== txSeqRef\.current/);
    expect(src).toMatch(/seq !== loadSeqRef\.current/);
    // 예전 +1일 오류 원인(배타 끝을 그대로 PHT 날짜로) 제거
    expect(src).not.toMatch(/manilaDayOf\(statement\?\.toIso\)/);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CrewRepContribution } from "@/lib/trust/crew-rep-calculator";
import { summarizeMannerForPublic, toContributionViews } from "@/lib/trust/crew-rep-read";

const c = (over: Partial<CrewRepContribution>): CrewRepContribution => ({
  eventId: "e",
  eventType: "trade_rating_good",
  occurredAt: "2026-11-10T00:00:00.000Z",
  axis: "trade",
  sign: 1,
  base: 1,
  r: 1,
  w: 1,
  d: 1,
  value: 1,
  counted: true,
  ...over,
});

describe("CREW REP 읽기 (S6)", () => {
  it("반영된 기록: 최신순, 점수 대상 아닌 접수류는 빼고 0 처리 사유는 남긴다", () => {
    const v = toContributionViews([
      c({ eventId: "a", occurredAt: "2026-11-01T00:00:00.000Z" }),
      c({ eventId: "b", eventType: "report_created", axis: "none", counted: false, zeroReason: "not_scored", occurredAt: "2026-11-05T00:00:00.000Z" }),
      c({ eventId: "c", counted: false, value: 0, zeroReason: "pair_cooldown", occurredAt: "2026-11-09T00:00:00.000Z" }),
    ]);
    expect(v.map((x) => [x.occurredAt.slice(5, 10), x.zeroReason])).toEqual([
      ["11-09", "pair_cooldown"],
      ["11-01", null],
    ]);
    // 상대 회원 정보(사건 id·counterparty)는 내보내지 않는다
    expect(Object.keys(v[0]!)).not.toContain("eventId");
  });

  it("상대 공개 약속 요약: 반영된 것만 센다", () => {
    expect(
      summarizeMannerForPublic([
        c({ eventType: "clean_month", axis: "manner" }),
        c({ eventType: "clean_month", axis: "manner", counted: false }),
        c({ eventType: "manner_moim_attended", axis: "manner" }),
        c({ eventType: "manner_moim_no_show", axis: "manner", sign: -1 }),
        c({ eventType: "manner_report_confirmed", axis: "manner", sign: -1 }),
      ])
    ).toEqual({ cleanMonths: 1, moimAttended: 1, moimNoShow: 1, confirmedReports: 1 });
  });

  it("공개 요약 API 는 개별 기록·평가자를 내보내지 않는다 (구조 계약)", () => {
    const root = path.resolve(__dirname, "../../..");
    const read = readFileSync(path.join(root, "lib/trust/crew-rep-read.ts"), "utf8");
    const pub = read.slice(read.indexOf("export async function loadCrewRepPublicSummary"));
    expect(pub).not.toMatch(/contributions:/);
    expect(pub).not.toMatch(/reviewer_id|counterparty/);
  });
});

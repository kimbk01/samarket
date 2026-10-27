import { describe, expect, it } from "vitest";
import { POST_REPORT_REASONS } from "@/lib/reports/report-utils";
import { ADMIN_DASHBOARD_REPORT_REASON_LABELS } from "@/lib/admin-dashboard/report-reason-labels";

describe("POST_REPORT_REASONS (P-2 · 2단계 신고)", () => {
  it("「기타」는 상세 내용 필수, 나머지 사유는 선택", () => {
    const other = POST_REPORT_REASONS.find((r) => r.code === "other");
    expect(other?.detailRequired).toBe(true);
    expect(POST_REPORT_REASONS.filter((r) => r.detailRequired).map((r) => r.code)).toEqual(["other"]);
  });

  it("작성자 신고는 맨 아래, 모든 글 신고 사유는 관리자 라벨이 있다", () => {
    expect(POST_REPORT_REASONS[POST_REPORT_REASONS.length - 1]?.code).toBe("report_author");
    for (const r of POST_REPORT_REASONS.filter((x) => !x.isAuthor)) {
      expect(ADMIN_DASHBOARD_REPORT_REASON_LABELS[r.code]).toBeTruthy();
    }
  });
});

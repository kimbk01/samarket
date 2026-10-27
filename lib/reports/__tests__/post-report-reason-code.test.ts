import { describe, expect, it } from "vitest";
import { POST_REPORT_REASONS } from "@/lib/reports/report-utils";
import { ADMIN_DASHBOARD_REPORT_REASON_LABELS } from "@/lib/admin-dashboard/report-reason-labels";

describe("게시글 신고 사유 코드 (TM-08·TM-53)", () => {
  it("작성자 신고를 뺀 모든 사유 코드는 관리자 라벨이 있는 reports.reason_code 다", () => {
    for (const r of POST_REPORT_REASONS) {
      if (r.isAuthor) continue;
      expect(ADMIN_DASHBOARD_REPORT_REASON_LABELS[r.code], r.code).toBeTruthy();
    }
  });

  it("모든 사유 문구는 i18n 키로 표시된다", () => {
    for (const r of POST_REPORT_REASONS) expect(r.labelKey.startsWith("ui_post_report_reason_")).toBe(true);
  });
});

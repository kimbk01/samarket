import { describe, expect, it } from "vitest";
import {
  filterReports,
  resolveAdminReportDomainFromQuery,
} from "@/lib/admin-reports/report-admin-utils";
import type { Report } from "@/lib/types/report";

function row(partial: Partial<Report> & Pick<Report, "id" | "reportSource">): Report {
  return {
    reporterId: "r1",
    targetType: "product",
    targetId: "p1",
    targetUserId: "u1",
    reasonCode: "spam",
    reasonLabel: "spam",
    detail: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "pending",
    ...partial,
  };
}

describe("admin report domain filter (CUT 1/2)", () => {
  const mixed = [
    row({ id: "t1", reportSource: "reports" }),
    row({ id: "c1", reportSource: "community_feed", targetType: "community" }),
  ];

  it("resolveAdminReportDomainFromQuery defaults Trade menu to reports", () => {
    expect(resolveAdminReportDomainFromQuery({ domain: "trade", from: null })).toBe("reports");
    expect(resolveAdminReportDomainFromQuery({ domain: null, from: "trade" })).toBe("reports");
    expect(resolveAdminReportDomainFromQuery({ domain: "community", from: null })).toBe(
      "community_feed"
    );
    expect(resolveAdminReportDomainFromQuery({ domain: null, from: null })).toBe("");
  });

  it("filterReports does not silently mix when domain is set", () => {
    const tradeOnly = filterReports(mixed, {
      reportSource: "reports",
      targetType: "",
      status: "",
      reasonCode: "",
    });
    expect(tradeOnly.map((r) => r.id)).toEqual(["t1"]);

    const communityOnly = filterReports(mixed, {
      reportSource: "community_feed",
      targetType: "",
      status: "",
      reasonCode: "",
    });
    expect(communityOnly.map((r) => r.id)).toEqual(["c1"]);
  });
});

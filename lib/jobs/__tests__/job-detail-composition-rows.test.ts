import { describe, expect, it } from "vitest";
import { buildJobsCompositionDetailRows } from "@/lib/jobs/job-detail-composition-rows";

describe("jobs detail composition rows", () => {
  it("projects hire composition fields without inventing storage keys", () => {
    const rows = buildJobsCompositionDetailRows({
      listingKind: "hire",
      meta: {
        listing_kind: "hire",
        work_category: "서빙",
        work_term: "short",
        pay_type: "daily",
        pay_amount: "700",
        company_name: "Mart",
      },
      currency: "PHP",
      lang: "ko",
    });
    expect(rows.some((r) => r.fieldId === "work_category" && r.value.includes("서빙"))).toBe(true);
    expect(rows.some((r) => r.fieldId === "pay_amount")).toBe(true);
    expect(rows.some((r) => r.fieldId === "company_name" && r.value === "Mart")).toBe(true);
  });

  it("hides hire-only company on seek listing", () => {
    const rows = buildJobsCompositionDetailRows({
      listingKind: "work",
      meta: {
        listing_kind: "work",
        work_category: "식당/주방",
        experience_level: "beginner",
        company_name: "ShouldHide",
      },
      currency: "PHP",
      lang: "ko",
    });
    expect(rows.some((r) => r.fieldId === "company_name")).toBe(false);
    expect(rows.some((r) => r.fieldId === "experience_level")).toBe(true);
  });
});

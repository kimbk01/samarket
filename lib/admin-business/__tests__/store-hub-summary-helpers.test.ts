import { describe, expect, it } from "vitest";
import { auditReasonFromAfterJson, manilaMonthStartIso } from "@/lib/admin-business/load-store-hub-summary";
import { mapAuditAction } from "@/lib/admin-business/store-audit-action-labels";

describe("store hub summary helpers", () => {
  it("month start is computed in Asia/Manila", () => {
    // 2026-10-31T17:00Z = 2026-11-01 01:00 Manila → November
    expect(manilaMonthStartIso(new Date("2026-10-31T17:00:00Z"))).toBe("2026-10-31T16:00:00.000Z");
    expect(manilaMonthStartIso(new Date("2026-10-15T00:00:00Z"))).toBe("2026-09-30T16:00:00.000Z");
  });

  it("extracts reason from audit after_json", () => {
    expect(auditReasonFromAfterJson({ reason: " 서류 미비 " })).toBe("서류 미비");
    expect(auditReasonFromAfterJson({ action_memo: "중복 신고" })).toBe("중복 신고");
    expect(auditReasonFromAfterJson({ reason: null })).toBeNull();
    expect(auditReasonFromAfterJson(null)).toBeNull();
  });

  it("DEF-19 — maps review/revision actions to their own names", () => {
    expect(mapAuditAction("store.request_revision", true)).toBe("보완 요청");
    expect(mapAuditAction("store.start_review", true)).toBe("심사 시작");
    expect(mapAuditAction("store.owner_resubmit", true)).toBe("사장님 보완 재제출");
    expect(mapAuditAction("store.set_store_delivery_distance", false)).toBe(
      "Delivery radius/distance policy changed"
    );
  });
});

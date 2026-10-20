import { describe, expect, it } from "vitest";
import {
  adminOperatorRowClassFromNotificationStatus,
  adminOperatorRowClassFromPromotionStatus,
  adminOperatorRowClassFromTone,
  notificationSendOperatorTone,
} from "@/lib/admin/admin-operator-row-presentation";

describe("admin-operator-row-presentation", () => {
  it("ACTIVE / 노출 중 uses success accent", () => {
    const cls = adminOperatorRowClassFromPromotionStatus("ACTIVE");
    expect(cls).toContain("border-l-[3px]");
    expect(cls).toContain("sam-success");
  });

  it("SCHEDULED uses waiting accent", () => {
    expect(adminOperatorRowClassFromPromotionStatus("SCHEDULED")).toContain("sam-warning");
  });

  it("ENDED uses muted danger/neutral-ended accent", () => {
    expect(adminOperatorRowClassFromPromotionStatus("ENDED")).toContain("border-l-");
  });

  it("DRAFT / PAUSED are not success (not live)", () => {
    expect(adminOperatorRowClassFromPromotionStatus("DRAFT")).not.toContain("sam-success");
    expect(adminOperatorRowClassFromPromotionStatus("PAUSED")).not.toContain("sam-success");
  });

  it("notification sent ≠ promotion 노출 중 but may share success tone for send lifecycle", () => {
    expect(notificationSendOperatorTone("sent")).toBe("success");
    expect(notificationSendOperatorTone("draft")).toBe("neutral");
    expect(adminOperatorRowClassFromNotificationStatus("failed")).toContain("border-l-");
  });

  it("tone helper is stable", () => {
    expect(adminOperatorRowClassFromTone("success")).toContain("sam-success");
  });
});

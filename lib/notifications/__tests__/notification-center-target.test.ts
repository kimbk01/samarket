import { describe, expect, it } from "vitest";
import {
  findNotificationCenterTargetRow,
  normalizeNotificationCenterTargetId,
  shouldShowNotificationCenterRowForTarget,
} from "@/lib/notifications/notification-center-target";

describe("notification center notificationId focus contract", () => {
  const marketingRow = {
    id: "m1",
    push_kind: "marketing",
    notification_type: "status",
    bell_presentation_type: "admin_marketing",
  };
  const systemRow = {
    id: "s1",
    push_kind: "system",
    notification_type: "status",
    bell_presentation_type: "admin_system",
  };

  it("normalizes blank / whitespace notificationId to null (safe)", () => {
    expect(normalizeNotificationCenterTargetId("  ")).toBeNull();
    expect(normalizeNotificationCenterTargetId(null)).toBeNull();
    expect(normalizeNotificationCenterTargetId("evt-1")).toBe("evt-1");
  });

  it("finds the exact notification identity", () => {
    expect(findNotificationCenterTargetRow([marketingRow, systemRow], "m1")).toBe(marketingRow);
    expect(findNotificationCenterTargetRow([marketingRow], "missing")).toBeNull();
  });

  it("target identity wins over stale tab filter", () => {
    expect(shouldShowNotificationCenterRowForTarget(marketingRow, "system", "m1")).toBe(true);
    expect(shouldShowNotificationCenterRowForTarget(marketingRow, "system", null)).toBe(false);
  });

  it("invalid notificationId does not force unrelated rows visible", () => {
    expect(shouldShowNotificationCenterRowForTarget(marketingRow, "system", "ghost-id")).toBe(
      false
    );
    expect(findNotificationCenterTargetRow([marketingRow, systemRow], "ghost-id")).toBeNull();
  });
});

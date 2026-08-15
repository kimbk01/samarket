import { describe, expect, it } from "vitest";
import { formatNotificationInboxTime } from "@/lib/notifications/format-notification-inbox-time";

describe("formatNotificationInboxTime", () => {
  // Local calendar constructors — CI may run UTC; do not pin +08:00 wall clock.
  const now = new Date(2026, 7, 15, 12, 0, 0).getTime();

  it("formats today as clock only", () => {
    const iso = new Date(2026, 7, 15, 11, 45, 0).toISOString();
    const ko = formatNotificationInboxTime(iso, "ko", now);
    expect(ko).toMatch(/11:45/);
    expect(ko).not.toMatch(/어제/);
  });

  it("formats yesterday with yesterday prefix", () => {
    const iso = new Date(2026, 7, 14, 10, 23, 0).toISOString();
    expect(formatNotificationInboxTime(iso, "ko", now)).toMatch(/^어제 /);
  });

  it("formats older days as month.day", () => {
    const iso = new Date(2026, 7, 7, 9, 0, 0).toISOString();
    const label = formatNotificationInboxTime(iso, "ko", now);
    expect(label).toMatch(/8/);
    expect(label).toMatch(/7/);
  });
});

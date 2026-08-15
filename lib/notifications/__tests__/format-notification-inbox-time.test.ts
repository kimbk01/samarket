import { describe, expect, it } from "vitest";
import { formatNotificationInboxTime } from "@/lib/notifications/format-notification-inbox-time";

describe("formatNotificationInboxTime", () => {
  const now = new Date("2026-08-15T12:00:00+08:00").getTime();

  it("formats today as clock only", () => {
    const iso = new Date("2026-08-15T11:45:00+08:00").toISOString();
    const ko = formatNotificationInboxTime(iso, "ko", now);
    expect(ko).toMatch(/11:45/);
    expect(ko).not.toMatch(/어제/);
  });

  it("formats yesterday with yesterday prefix", () => {
    const iso = new Date("2026-08-14T10:23:00+08:00").toISOString();
    expect(formatNotificationInboxTime(iso, "ko", now)).toMatch(/^어제 /);
  });

  it("formats older days as month.day", () => {
    const iso = new Date("2026-08-07T09:00:00+08:00").toISOString();
    const label = formatNotificationInboxTime(iso, "ko", now);
    expect(label).toMatch(/8/);
    expect(label).toMatch(/7/);
  });
});

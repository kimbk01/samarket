import { describe, expect, it } from "vitest";
import {
  resolveNotificationAwareDetailBackHref,
  withNotificationEntryFrom,
} from "@/lib/notifications/notification-entry-from";

describe("notification-entry-from", () => {
  it("stamps from=notifications on relative destinations", () => {
    expect(withNotificationEntryFrom("/mypage/customer-center/notice/abc")).toBe(
      "/mypage/customer-center/notice/abc?from=notifications",
    );
  });

  it("keeps existing query and is idempotent", () => {
    expect(withNotificationEntryFrom("/post/1?x=1")).toBe("/post/1?x=1&from=notifications");
    expect(withNotificationEntryFrom("/post/1?from=notifications")).toBe(
      "/post/1?from=notifications",
    );
  });

  it("does not stamp the notification center itself", () => {
    expect(withNotificationEntryFrom("/notifications")).toBe("/notifications");
    expect(withNotificationEntryFrom("/notifications?tab=all")).toBe("/notifications?tab=all");
  });

  it("detail back returns to notification center when from=notifications", () => {
    expect(
      resolveNotificationAwareDetailBackHref({
        from: "notifications",
        fallbackHref: "/mypage/customer-center/notice",
      }),
    ).toBe("/notifications");
    expect(
      resolveNotificationAwareDetailBackHref({
        from: null,
        fallbackHref: "/mypage/customer-center/notice",
      }),
    ).toBe("/mypage/customer-center/notice");
  });
});

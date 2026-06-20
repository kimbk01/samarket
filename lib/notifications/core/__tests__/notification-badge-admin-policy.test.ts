import { describe, expect, it } from "vitest";
import { countNotificationEventsBadge } from "@/lib/notifications/core/notification-event-repository";

function fakeBadgeSb(rows: Array<{ category: string }>) {
  const q = {
    select: () => q,
    eq: () => q,
    is: async () => ({ data: rows, error: null }),
  };
  return {
    from: () => q,
  } as unknown;
}

describe("notification badge admin policy", () => {
  it("excludes admin_marketing_banner from total when badge is disabled", async () => {
    const sb = fakeBadgeSb([
      { category: "admin_marketing_banner" },
      { category: "admin_marketing_banner" },
      { category: "chat_message" },
    ]);
    const out = await countNotificationEventsBadge(sb as never, "u1");
    expect(out.adminMarketingBanner).toBe(2);
    expect(out.chatMessage).toBe(1);
    expect(out.total).toBe(1);
  });

  it("keeps admin_notice countable in total", async () => {
    const sb = fakeBadgeSb([{ category: "admin_notice" }, { category: "admin_notice" }]);
    const out = await countNotificationEventsBadge(sb as never, "u1");
    expect(out.adminNotice).toBe(2);
    expect(out.total).toBe(2);
  });
});

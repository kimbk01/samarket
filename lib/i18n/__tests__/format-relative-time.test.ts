import { describe, expect, it } from "vitest";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";

describe("formatRelativeTimeAgo", () => {
  it("does not expose raw i18n key for days ago", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const ko = formatRelativeTimeAgo(threeDaysAgo, "ko");
    const en = formatRelativeTimeAgo(threeDaysAgo, "en");
    expect(ko).toBe("3일 전");
    expect(en).toBe("3d ago");
    expect(ko).not.toContain("mypage_hub_time");
    expect(en).not.toContain("mypage_hub_time");
  });

  it("returns just now for recent timestamps", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTimeAgo(now, "ko")).toBe("방금");
    expect(formatRelativeTimeAgo(now, "en")).toBe("Just now");
  });
});

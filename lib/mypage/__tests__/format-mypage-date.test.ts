import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MYPAGE_DISPLAY_TIME_ZONE,
  formatMypageDate,
  formatMypageMoney,
  mypageDateGroupKey,
} from "@/lib/mypage/format-mypage-date";

describe("format-mypage-date", () => {
  afterEach(() => vi.useRealTimers());

  it("displays in Philippine time regardless of device time zone", () => {
    expect(MYPAGE_DISPLAY_TIME_ZONE).toBe("Asia/Manila");
    // 2026-10-19T17:30Z = 2026-10-20 01:30 PHT
    const iso = "2026-10-19T17:30:00.000Z";
    expect(formatMypageDate(iso, { style: "date", lang: "en" })).toBe("Oct 20, 2026");
    expect(formatMypageDate(iso, { style: "date", lang: "ko" })).toContain("20");
    expect(formatMypageDate(iso, { style: "time", lang: "en" })).toBe("01:30 AM");
    expect(formatMypageDate(iso, { style: "datetime", lang: "en" })).toBe("Oct 20, 2026, 01:30 AM");
  });

  it("returns empty string for missing / invalid input", () => {
    expect(formatMypageDate(null)).toBe("");
    expect(formatMypageDate("")).toBe("");
    expect(formatMypageDate("not-a-date")).toBe("");
    expect(mypageDateGroupKey(undefined)).toBe("");
  });

  it("relative style reuses formatRelativeTimeAgo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T00:00:00.000Z"));
    const twoHoursAgo = "2026-10-19T22:00:00.000Z";
    expect(formatMypageDate(twoHoursAgo, { style: "relative", lang: "en" })).toMatch(/2/);
  });

  it("group keys use PHT day / month", () => {
    expect(mypageDateGroupKey("2026-10-31T17:00:00.000Z", "day")).toBe("2026-11-01");
    expect(mypageDateGroupKey("2026-10-31T17:00:00.000Z", "month")).toBe("2026-11");
  });

  it("money delegates to formatMoneyPhp", () => {
    expect(formatMypageMoney(12500)).toBe("₱12,500");
    expect(formatMypageMoney(null)).toBe("");
  });
});

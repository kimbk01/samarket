import { describe, expect, it } from "vitest";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";

describe("computeMainBottomNavPushAxis", () => {
  it("배달→메신저 — ltr (우측 탭)", () => {
    expect(computeMainBottomNavPushAxis("/stores", "/community-messenger?section=chats")).toBe("ltr");
  });

  it("메신저→배달 — rtl (좌측 탭)", () => {
    expect(computeMainBottomNavPushAxis("/community-messenger", "/stores")).toBe("rtl");
  });

  it("동일 경로 — null", () => {
    expect(computeMainBottomNavPushAxis("/stores", "/stores")).toBeNull();
  });
});

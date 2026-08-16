import { describe, expect, it } from "vitest";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";

describe("computeMainBottomNavPushAxis", () => {
  it("다른 MAIN DOMAIN — 항상 rtl (index 무관)", () => {
    expect(computeMainBottomNavPushAxis("/stores", "/community-messenger?section=chats")).toBe("rtl");
    expect(computeMainBottomNavPushAxis("/community-messenger", "/stores")).toBe("rtl");
    expect(computeMainBottomNavPushAxis("/philife", "/market")).toBe("rtl");
    expect(computeMainBottomNavPushAxis("/market", "/philife")).toBe("rtl");
    expect(computeMainBottomNavPushAxis("/mypage", "/philife")).toBe("rtl");
    expect(computeMainBottomNavPushAxis("/philife", "/mypage")).toBe("rtl");
  });

  it("동일 경로 — null", () => {
    expect(computeMainBottomNavPushAxis("/stores", "/stores")).toBeNull();
  });

  it("동일 MainSurface — null", () => {
    expect(computeMainBottomNavPushAxis("/philife", "/community")).toBeNull();
    expect(computeMainBottomNavPushAxis("/mypage", "/my")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";

describe("computeMainBottomNavPushAxis", () => {
  it("배달→메신저 — rtl (우→좌 고정)", () => {
    expect(computeMainBottomNavPushAxis("/stores", "/community-messenger?section=chats")).toBe("rtl");
  });

  it("메신저→배달 — rtl (우→좌 고정, 과거 ltr 아님)", () => {
    expect(computeMainBottomNavPushAxis("/community-messenger", "/stores")).toBe("rtl");
  });

  it("커뮤니티→거래 — rtl", () => {
    expect(computeMainBottomNavPushAxis("/philife", "/market")).toBe("rtl");
  });

  it("동일 경로 — null", () => {
    expect(computeMainBottomNavPushAxis("/stores", "/stores")).toBeNull();
  });
});

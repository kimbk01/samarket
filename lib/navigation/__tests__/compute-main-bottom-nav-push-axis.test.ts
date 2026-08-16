import { describe, expect, it } from "vitest";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";

describe("computeMainBottomNavPushAxis", () => {
  it("배달→메신저 — rtl (우측 탭, 우→좌)", () => {
    expect(computeMainBottomNavPushAxis("/stores", "/community-messenger?section=chats")).toBe("rtl");
  });

  it("메신저→배달 — ltr (좌측 탭, 좌→우)", () => {
    expect(computeMainBottomNavPushAxis("/community-messenger", "/stores")).toBe("ltr");
  });

  it("동일 경로 — null", () => {
    expect(computeMainBottomNavPushAxis("/stores", "/stores")).toBeNull();
  });
});

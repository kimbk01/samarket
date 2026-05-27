import { describe, expect, it } from "vitest";
import {
  requiresMessengerTabConfirm,
  resolveBottomNavTransitionConfirmCopy,
} from "@/lib/navigation/main-bottom-nav-transition-copy";

describe("main-bottom-nav-transition-copy", () => {
  it("배달에서 chat 탭 — 메신저 확인 팝업", () => {
    expect(requiresMessengerTabConfirm("/stores", "chat")).toBe(true);
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "chat")).toEqual({
      kind: "messenger",
    });
  });

  it("이미 메신저 — chat 탭 확인 없음", () => {
    expect(requiresMessengerTabConfirm("/community-messenger", "chat")).toBe(false);
    expect(resolveBottomNavTransitionConfirmCopy("/community-messenger", "chat")).toBeNull();
  });

  it("배달→커뮤니티 — 허브 교차 확인", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "community")).toEqual({
      kind: "cross_domain",
      copy: {
        kind: "from_to",
        fromLabelKey: "nav_bottom_delivery",
        toLabelKey: "nav_bottom_community",
      },
    });
  });

  it("my 탭 — 확인 없음", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "my")).toBeNull();
  });
});

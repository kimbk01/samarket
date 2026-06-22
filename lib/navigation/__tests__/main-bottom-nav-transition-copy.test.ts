import { describe, expect, it } from "vitest";
import {
  requiresMessengerTabConfirm,
  resolveBottomNavTransitionConfirmCopy,
} from "@/lib/navigation/main-bottom-nav-transition-copy";

describe("main-bottom-nav-transition-copy", () => {
  it("requiresMessengerTabConfirm — low-level 판별 유지", () => {
    expect(requiresMessengerTabConfirm("/stores", "chat")).toBe(true);
    expect(requiresMessengerTabConfirm("/community-messenger", "chat")).toBe(false);
  });

  it("배달에서 chat 탭 — 메신저 Confirm", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "chat")).toEqual({
      kind: "messenger",
    });
  });

  it("이미 메신저 chat 탭 — Confirm 없음", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/community-messenger", "chat")).toBeNull();
  });

  it("배달→커뮤니티 허브 교차 Confirm", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "community")).toEqual({
      kind: "cross_domain",
      copy: {
        kind: "from_to",
        fromLabelKey: "nav_bottom_delivery",
        toLabelKey: "nav_bottom_community",
      },
    });
  });

  it("배달→거래 허브 교차 Confirm", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "home")).toEqual({
      kind: "cross_domain",
      copy: {
        kind: "from_to",
        fromLabelKey: "nav_bottom_delivery",
        toLabelKey: "nav_bottom_trade",
      },
    });
  });

  it("메신저→거래 — to_only Confirm", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/community-messenger", "home")).toEqual({
      kind: "cross_domain",
      copy: {
        kind: "to_only",
        toLabelKey: "nav_bottom_trade",
      },
    });
  });

  it("내정보→거래 — to_only Confirm", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/mypage", "home")).toEqual({
      kind: "cross_domain",
      copy: {
        kind: "to_only",
        toLabelKey: "nav_bottom_trade",
      },
    });
  });

  it("my 탭 — Confirm 없음", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "my")).toBeNull();
  });
});

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

  it("Phase A read-only — 배달에서 chat 탭 즉시 이동 (Confirm 없음)", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "chat")).toBeNull();
  });

  it("Phase A read-only — 이미 메신저 chat 탭 Confirm 없음", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/community-messenger", "chat")).toBeNull();
  });

  it("Phase A read-only — 배달→커뮤니티 허브 교차 Confirm 없음", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "community")).toBeNull();
  });

  it("Phase A read-only — my 탭 Confirm 없음", () => {
    expect(resolveBottomNavTransitionConfirmCopy("/stores", "my")).toBeNull();
  });

  it("Phase B placeholder — writeSheetBlocking risky 시 messenger copy 반환", () => {
    expect(
      resolveBottomNavTransitionConfirmCopy("/stores", "chat", { writeSheetBlocking: true })
    ).toEqual({
      kind: "messenger",
    });
  });

  it("Phase B placeholder — writeSheetBlocking risky 시 cross-domain copy 반환", () => {
    expect(
      resolveBottomNavTransitionConfirmCopy("/stores", "community", { writeSheetBlocking: true })
    ).toEqual({
      kind: "cross_domain",
      copy: {
        kind: "from_to",
        fromLabelKey: "nav_bottom_delivery",
        toLabelKey: "nav_bottom_community",
      },
    });
  });
});

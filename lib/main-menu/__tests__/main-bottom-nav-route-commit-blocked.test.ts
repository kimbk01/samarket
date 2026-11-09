/**
 * 재감사(2026-11-10, Owner 승인) — 하단 탭 이동이 나가지 못하면(deep route 잠금 등) onNavigationBlocked 로
 * 선택 표시를 되돌린다. 나가면 호출하지 않는다(선택 표시는 경로 확정까지 유지).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const guarded = vi.fn();
vi.mock("@/lib/navigation/guarded-client-navigation", () => ({
  guardedClientNavigate: (...args: unknown[]) => guarded(...args),
}));

import { commitMainBottomNavRoute } from "@/lib/main-menu/main-bottom-nav-route-commit";

function baseArgs(onNavigationBlocked: () => void) {
  return {
    pathname: "/philife",
    currentSearch: "",
    href: "/stores",
    tabId: "stores",
    beginMenuNavigation: vi.fn(),
    onNavigationIntent: vi.fn(),
    guardBeforeNavigate: () => true,
    push: vi.fn(),
    replace: vi.fn(),
    skipPerfMark: true,
    onNavigationBlocked,
  };
}

beforeEach(() => guarded.mockReset());

describe("commitMainBottomNavRoute — onNavigationBlocked", () => {
  it("이동이 거부되면 호출", () => {
    guarded.mockReturnValue(false);
    const blocked = vi.fn();
    const args = baseArgs(blocked);
    expect(commitMainBottomNavRoute(args)).toBe("navigated");
    expect(args.onNavigationIntent).toHaveBeenCalledWith("stores");
    expect(blocked).toHaveBeenCalledTimes(1);
  });
  it("이동이 나가면 호출하지 않음", () => {
    guarded.mockReturnValue(true);
    const blocked = vi.fn();
    commitMainBottomNavRoute(baseArgs(blocked));
    expect(blocked).not.toHaveBeenCalled();
  });
});

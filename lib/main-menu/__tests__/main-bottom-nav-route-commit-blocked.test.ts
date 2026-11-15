/**
 * 계약 v2 (Owner 2026-11-15) — 하단 탭 이동이 나가지 못하면 결과 "blocked" + onNavigationBlocked,
 * 하단 탭 컨트롤러도 원래 탭으로 되돌린다. 나가면 호출하지 않는다(선택 표시는 경로 확정까지 유지).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const guarded = vi.fn();
vi.mock("@/lib/navigation/guarded-client-navigation", () => ({
  guardedClientNavigate: (...args: unknown[]) => guarded(...args),
}));

import { commitMainBottomNavRoute } from "@/lib/main-menu/main-bottom-nav-route-commit";
import {
  __resetBottomNavControllerForTest,
  getBottomNavControllerState,
} from "@/lib/main-menu/bottom-nav-controller";

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

beforeEach(() => {
  guarded.mockReset();
  __resetBottomNavControllerForTest({ documentNavigate: () => {} });
});

describe("commitMainBottomNavRoute — onNavigationBlocked", () => {
  it("이동이 거부되면 호출", () => {
    guarded.mockReturnValue(false);
    const blocked = vi.fn();
    const args = baseArgs(blocked);
    expect(commitMainBottomNavRoute({ ...args, showOnBottomNavController: true })).toBe("blocked");
    expect(blocked).toHaveBeenCalledTimes(1);
    /** 컨트롤러가 원래 탭으로 — 선택 표시 되돌림 */
    expect(getBottomNavControllerState().phase).toBe("idle");
  });
  it("이동이 나가면 호출하지 않음", () => {
    guarded.mockReturnValue(true);
    const blocked = vi.fn();
    expect(commitMainBottomNavRoute({ ...baseArgs(blocked), showOnBottomNavController: true })).toBe("navigated");
    expect(blocked).not.toHaveBeenCalled();
    const st = getBottomNavControllerState();
    expect(st.phase).toBe("showing");
    if (st.phase === "showing") expect(st.tabId).toBe("stores");
  });
  it("사용자 탭은 bottom_nav_explicit · 기다림 뒤 실행은 bottom_nav_async", () => {
    guarded.mockReturnValue(true);
    commitMainBottomNavRoute(baseArgs(vi.fn()));
    expect(guarded.mock.calls[0][2]).toBe("bottom_nav_explicit");
    commitMainBottomNavRoute({ ...baseArgs(vi.fn()), deferredAfterAwait: true });
    expect(guarded.mock.calls[1][2]).toBe("bottom_nav_async");
  });
});
